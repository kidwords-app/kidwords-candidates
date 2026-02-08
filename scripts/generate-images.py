from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List

DEFAULT_LEVELS = ["preK", "K", "G1"]


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


def generate_images_for_entry(
    entry: dict,
    round_id: str,
    words_dir: Path,
    assets_dir: Path,
    app_repo: Path,
    now: str,
    default_levels: List[str],
) -> int:
    word = entry.get("word")
    if not word:
        return 0
    word_id = slugify(word)
    levels = entry.get("levels") or default_levels
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
        subprocess.run(
            [
                sys.executable,
                str(app_repo / "scripts" / "cartoon-gen.py"),
                "--word",
                word,
                "--level",
                level,
                "--output",
                str(output_path),
            ],
            check=True,
        )
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
    app_repo: Path,
    default_levels: List[str] | None = None,
) -> int:
    batch_path = candidates_repo / "inputs" / "word-batches" / f"{round_id}.json"
    if not batch_path.exists():
        raise FileNotFoundError(f"Missing batch file: {batch_path}")

    words = load_batch_words(batch_path)
    default_levels = default_levels or list(DEFAULT_LEVELS)

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
            app_repo,
            now,
            default_levels,
        )
    return created


@dataclass(frozen=True)
class Arguments:
    round_id: str
    candidates_repo: Path
    app_repo: Path


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
        help="Path to candidates repo. Defaults to CANDIDATES_REPO_PATH.",
    )
    parser.add_argument(
        "--app-repo",
        default=os.environ.get("APP_REPO_PATH", "app"),
        help="Path to app repo. Defaults to APP_REPO_PATH or 'app'.",
    )
    args = parser.parse_args(list(argv))
    if not args.round_id:
        parser.error("Round id is required via --round-id or ROUND_ID.")
    if not args.candidates_repo:
        parser.error("Candidates repo path is required via --candidates-repo or CANDIDATES_REPO_PATH.")
    return Arguments(
        round_id=args.round_id,
        candidates_repo=Path(args.candidates_repo),
        app_repo=Path(args.app_repo),
    )


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    try:
        created = process_round(args.round_id, args.candidates_repo, args.app_repo)
    except (FileNotFoundError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except subprocess.CalledProcessError as exc:
        print(f"Image generation failed: {exc}", file=sys.stderr)
        return 1

    print(f"Generated {created} images.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

