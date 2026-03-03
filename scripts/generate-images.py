from __future__ import annotations

import argparse
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

from google import genai

ALLOWED_LEVELS = frozenset(["preschooler", "kindergartener", "first grader"])

# ---- Cartoon pipeline (Gemini text + image generation) ----

TEXT_PROMPT_RESPONSE_TEMPLATE = {
    "prompts": [{"first": ""}, {"second": ""}, {"third": ""}],
}
TEXT_PROMPT_TEMPLATE = (
    "Generate three written examples of {word} that a {level} would understand. "
    "Return them in JSON format like so: {text_prompt_response_template}."
    "Do not format the response in a code block or include any other text or formatting."
)
CARTOON_PROMPT_TEMPLATE = (
    "Create a cartoon with a single frame or image, describing the following: {phrase}. "
    "Do not include any words in the cartoon."
)
TEXT_MODEL = "gemini-2.5-flash"
IMAGE_MODEL = "gemini-2.5-flash-image"


class BudgetLimitError(RuntimeError):
    pass


class TextGenerationError(RuntimeError):
    pass


class ImageGenerationError(RuntimeError):
    pass


class InvalidResponseError(ValueError):
    pass


class ConfigurationError(RuntimeError):
    pass


def _build_text_prompt(word: str, level: str) -> str:
    return TEXT_PROMPT_TEMPLATE.format(
        word=word, level=level, text_prompt_response_template=json.dumps(TEXT_PROMPT_RESPONSE_TEMPLATE)
    )


def _build_cartoon_prompt(phrase: str) -> str:
    return CARTOON_PROMPT_TEMPLATE.format(phrase=phrase)


def _is_budget_error(error: BaseException) -> bool:
    message = str(error).lower()
    return any(
        hint in message
        for hint in ("resource exhausted", "quota", "budget", "limit", "rate limit", "429")
    )


def _extract_text_from_response(response) -> str:
    parts = getattr(response, "parts", []) or []
    text_chunks = [part.text for part in parts if getattr(part, "text", None)]
    if not text_chunks:
        raise TextGenerationError("Text response contained no text parts.")
    return "\n".join(text_chunks).strip()


def _parse_text_response(response_text: str) -> List[str]:
    try:
        payload = json.loads(response_text)
    except json.JSONDecodeError as exc:
        raise InvalidResponseError("Text response is not valid JSON.") from exc
    prompts = payload.get("prompts")
    if not isinstance(prompts, list):
        raise InvalidResponseError("Text response JSON missing 'prompts' list.")
    values: List[str] = []
    for item in prompts:
        if not isinstance(item, dict) or len(item) != 1:
            raise InvalidResponseError("Each prompt entry must be a single-key object.")
        value = next(iter(item.values()))
        if not isinstance(value, str) or not value.strip():
            raise InvalidResponseError("Prompt entries must be non-empty strings.")
        values.append(value.strip())
    if not values:
        raise InvalidResponseError("No prompts found in text response JSON.")
    return values


def _generate_text_examples(client: genai.Client, word: str, level: str, model: str = TEXT_MODEL) -> List[str]:
    prompt = _build_text_prompt(word, level)
    print(f"[cartoon] API text request model={model} word={word!r} level={level!r}", flush=True)
    try:
        response = client.models.generate_content(model=model, contents=prompt)
    except Exception as exc:
        if _is_budget_error(exc):
            raise BudgetLimitError("Budget or quota limit reached.") from exc
        raise TextGenerationError("Failed to generate text prompt.") from exc
    if response is None:
        raise TextGenerationError("API returned no response.")
    response_text = _extract_text_from_response(response)
    parsed = _parse_text_response(response_text)
    return parsed


def _extract_image_from_response(response):
    parts = getattr(response, "parts", []) or []
    for part in parts:
        if getattr(part, "inline_data", None) is not None:
            return part.as_image()
    raise ImageGenerationError("Image response contained no image data.")


def _generate_cartoon_image(
    client: genai.Client, phrase: str, output_path: Path, model: str = IMAGE_MODEL
) -> Path:
    prompt = _build_cartoon_prompt(phrase)
    print(f"[cartoon] API image request model={model} phrase={phrase[:50]!r}...", flush=True)
    try:
        response = client.models.generate_content(model=model, contents=prompt)
    except Exception as exc:
        if _is_budget_error(exc):
            raise BudgetLimitError("Budget or quota limit reached.") from exc
        raise ImageGenerationError("Failed to generate cartoon image.") from exc
    if response is None:
        raise ImageGenerationError("API returned no response.")
    image = _extract_image_from_response(response)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path)
    return output_path


def run_cartoon_pipeline(word: str, level: str, output_path: Path) -> tuple[Path, str]:
    """Run text + image generation. Returns (output_path, image_prompt)."""
    print(f"[cartoon] start word={word!r} level={level!r} output={output_path}", flush=True)
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ConfigurationError("GEMINI_API_KEY is missing from the environment.")
    client = genai.Client(api_key=api_key)
    print(f"[cartoon] client ready, generating text examples...", flush=True)
    prompts = _generate_text_examples(client, word, level)
    phrase = prompts[0]
    print(f"[cartoon] chosen prompt 1: {phrase!r}", flush=True)
    for i, alt in enumerate(prompts[1:], start=2):
        print(f"[cartoon] alternate prompt {i}: {alt!r}", flush=True)
    image_prompt = _build_cartoon_prompt(phrase)
    out = _generate_cartoon_image(client, phrase, output_path)
    print(f"[cartoon] done -> {out}", flush=True)
    return out, image_prompt


# ---- Batch / candidate logic ----

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
    print(f"[word] {word!r} levels={levels}", flush=True)
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
            print(f"[word] {word!r} {level!r} skip (already exists)", flush=True)
            continue
        print(f"[word] {word!r} {level!r} generating -> {output_path}", flush=True)
        _out_path, image_prompt = run_cartoon_pipeline(word, level, output_path)
        print(f"[word] {word!r} {level!r} saved", flush=True)
        images.append(
            {
                "imageId": image_id,
                "prompt": image_prompt,
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
    print(f"[batch] cwd={os.getcwd()!r}, candidates_repo={candidates_repo!r}", flush=True)
    batch_path = candidates_repo / "inputs" / "word-batches" / f"{round_id}.json"
    if not batch_path.exists():
        raise FileNotFoundError(f"Missing batch file: {batch_path}")
    print(f"[batch] Loading batch: {batch_path}", flush=True)
    words = load_batch_words(batch_path)
    print(f"[batch] Loaded {len(words)} words", flush=True)

    now = datetime.now(timezone.utc).isoformat()
    round_dir = candidates_repo / "candidates" / "rounds" / round_id
    words_dir = round_dir / "words"
    assets_dir = round_dir / "assets"
    words_dir.mkdir(parents=True, exist_ok=True)
    assets_dir.mkdir(parents=True, exist_ok=True)
    print(f"[batch] Round dirs ready: {round_dir}", flush=True)

    created = 0
    for i, entry in enumerate(words):
        word = entry.get("word", "?")
        print(f"[batch] Word {i + 1}/{len(words)}: {word!r}", flush=True)
        created += generate_images_for_entry(
            entry,
            round_id,
            words_dir,
            assets_dir,
            now,
        )
        print(f"[batch] Word {word!r} done (total created this round: {created})", flush=True)
    return created


def parse_args(argv: Iterable[str]):
    parser = argparse.ArgumentParser(
        description="Generate cartoon images: batch (from word-batches) or single word."
    )
    parser.add_argument("--round-id", default=os.environ.get("ROUND_ID"), help="Batch round id (YYYY-MM-DD).")
    parser.add_argument(
        "--candidates-repo",
        default=os.environ.get("CANDIDATES_REPO_PATH"),
        help="Repo root for batch mode. Defaults to CANDIDATES_REPO_PATH.",
    )
    parser.add_argument("--word", help="Single-word mode: word to illustrate.")
    parser.add_argument("--level", help="Single-word mode: audience level.")
    parser.add_argument("--output", default="generated_image.png", help="Single-word mode: output path.")
    args = parser.parse_args(list(argv))
    return args


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)

    # Single-word mode: generate one cartoon and exit
    if args.word and args.level:
        try:
            out, image_prompt = run_cartoon_pipeline(args.word, args.level, Path(args.output))
            print(f"Saved cartoon image to {out}")
            print(f"Image prompt: {image_prompt}")
            return 0
        except BudgetLimitError as exc:
            print(f"Error: {exc}", file=sys.stderr)
            return 2
        except (
            TextGenerationError,
            ImageGenerationError,
            InvalidResponseError,
            ConfigurationError,
        ) as exc:
            print(f"Error: {exc}", file=sys.stderr)
            return 1
        except Exception as exc:
            print(f"Unexpected error: {exc}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            return 1

    # Batch mode
    if not args.round_id:
        print("Error: --round-id (or ROUND_ID) required for batch mode.", file=sys.stderr)
        return 1
    if not args.candidates_repo:
        print("Error: --candidates-repo (or CANDIDATES_REPO_PATH) required for batch mode.", file=sys.stderr)
        return 1
    print(f"[batch] Starting batch round_id={args.round_id!r} repo={args.candidates_repo!r}", flush=True)
    try:
        created = process_round(args.round_id, Path(args.candidates_repo))
    except (FileNotFoundError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Image generation failed: {exc}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return 1
    print(f"[batch] Complete. Generated {created} images.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

