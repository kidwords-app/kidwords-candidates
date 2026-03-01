from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import sys
import traceback
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List

ALLOWED_LEVELS = frozenset(["preschooler", "kindergartener", "first grader"])

_SCRIPT_DIR = Path(__file__).resolve().parent
_cartoon_gen_module = None


def _get_cartoon_gen():
    """Load cartoon-gen.py (same dir); cache so we only load once."""
    global _cartoon_gen_module
    if _cartoon_gen_module is None:
        spec = importlib.util.spec_from_file_location(
            "cartoon_gen", _SCRIPT_DIR / "cartoon-gen.py"
        )
        _cartoon_gen_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(_cartoon_gen_module)
    return _cartoon_gen_module


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9\-\s]", "", value)
    value = re.sub(r"\s+", "-", value)
    value = re.sub(r"-{2,}", "-", value)
    return value


def load_batch_words(batch_path: Path) -> List[dict]:
    payload = json.loads(batch_path.read_text(encoding="utf-8"))
    words = payload.get("words", [])
    if not isinstance(words, list) or not words:
        raise ValueError("Batch file has no words.")
    return words


def build_candidate(entry: dict, word_id: str, round_id: str, now: str) -> dict:
    return {
        "wordId": word_id,
        "word": entry.get("word"),
        "partOfSpeech": entry.get("partOfSpeech"),
        "syllables": entry.get("syllables"),
        "tags": entry.get("tags", []),
        "roundId": round_id,
        "status": "pending",
        "levels": {},
        "images": [],
        "selected": {},
        "subPrompts": {},
        "createdAt": now,
        "updatedAt": now,
    }


def validate_levels(levels: List[str], word: str) -> None:
    if not levels:
        raise ValueError(f"Word '{word}': required field 'levels' is missing or empty.")
    invalid = [lev for lev in levels if lev not in ALLOWED_LEVELS]
    if invalid:
        raise ValueError(
            f"Word '{word}': invalid level(s) {invalid}. "
            f"Allowed levels: {sorted(ALLOWED_LEVELS)}."
        )


def generate_images_for_entry(
    entry: dict,
    round_id: str,
    words_dir: Path,
    assets_dir: Path,
    now: str,
) -> int:
    word = entry.get("word")
    if not word:
        return 0
    levels = entry.get("levels")
    validate_levels(levels if levels is not None else [], word)
    word_id = slugify(word)
    candidate_path = words_dir / f"{word_id}.json"
    if candidate_path.exists():
        candidate = json.loads(candidate_path.read_text(encoding="utf-8"))
    else:
        candidate = build_candidate(entry, word_id, round_id, now)

    images = candidate.get("images", [])
    existing_paths = {img.get("assetPath") for img in images if isinstance(img, dict)}
    created = 0

    for level in levels:
        image_id = uuid.uuid4().hex[:10]
        output_dir = assets_dir / word_id
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"{level}-{image_id}.png"
        rel_path = str(output_path.as_posix())
        if rel_path in existing_paths:
            continue
        cartoon_gen = _get_cartoon_gen()
        cartoon_gen.run_pipeline(word, level, output_path)
        images.append(
            {
                "imageId": image_id,
                "prompt": f"generated via cartoon-gen.py for {word} ({level})",
                "model": "gemini",
                "assetPath": rel_path,
                "createdAt": now,
            }
        )
        created += 1

    candidate["images"] = images
    candidate["updatedAt"] = now
    candidate_path.write_text(
        json.dumps(candidate, indent=2, sort_keys=True), encoding="utf-8"
    )
    return created


def process_round(
    round_id: str,
    candidates_repo: Path,
) -> int:
    """Run image generation for a round. Reads inputs from inputs/, writes to candidates/."""
    print(f"Current working directory: {os.getcwd()}, candidates_repo: {candidates_repo}", flush=True)
    batch_path = candidates_repo / "inputs" / "word-batches" / f"{round_id}.json"
    if not batch_path.exists():
        raise FileNotFoundError(f"Missing batch file: {batch_path}")

    words = load_batch_words(batch_path)

    now = datetime.now(timezone.utc).isoformat()
    round_dir = candidates_repo / "candidates" / "rounds" / round_id
    words_dir = round_dir / "words"
    assets_dir = round_dir / "assets"
    words_dir.mkdir(parents=True, exist_ok=True)
    assets_dir.mkdir(parents=True, exist_ok=True)

    created = 0
    for entry in words:
        created += generate_images_for_entry(
            entry,
            round_id,
            words_dir,
            assets_dir,
            now,
        )
    return created


@dataclass(frozen=True)
class Arguments:
    round_id: str
    candidates_repo: Path


def parse_args(argv: Iterable[str]) -> Arguments:
    parser = argparse.ArgumentParser(description="Generate images for batch words.")
    parser.add_argument(
        "--round-id",
        default=os.environ.get("ROUND_ID"),
        help="Batch round id (YYYY-MM-DD). Defaults to ROUND_ID.",
    )
    parser.add_argument(
        "--candidates-repo",
        default=os.environ.get("CANDIDATES_REPO_PATH"),
        help="Repo root (inputs in inputs/, outputs in candidates/). Defaults to CANDIDATES_REPO_PATH.",
    )
    args = parser.parse_args(list(argv))
    if not args.round_id:
        parser.error("Round id is required via --round-id or ROUND_ID.")
    if not args.candidates_repo:
        parser.error("Candidates repo path is required via --candidates-repo or CANDIDATES_REPO_PATH.")
    return Arguments(
        round_id=args.round_id,
        candidates_repo=Path(args.candidates_repo),
    )


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    try:
        created = process_round(args.round_id, args.candidates_repo)
    except (FileNotFoundError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Image generation failed: {exc}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return 1

    print(f"Generated {created} images.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

