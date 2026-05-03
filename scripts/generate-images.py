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
LEVEL_GENERATION_ORDER: tuple[str, ...] = ("preschooler", "kindergartener", "first grader")
LEVEL_ID_MAP = {
    "preschooler": "preK",
    "kindergartener": "K",
    "first grader": "G1",
}

# ---- Cartoon pipeline (Gemini text + image generation) ----
# One shared illustration concept for the word; level-specific copy; one image.

TEXT_PROMPT_RESPONSE_TEMPLATE = {
    "definition": "",
    "example": "",
    "tryIt": "",
    "speak": "",
}

STAGE1_CONCEPT_PROMPT_TEMPLATE = """You are designing ONE illustration for a children's vocabulary app. The same picture will be shown for preschool, kindergarten, and first grade; only the written explanations will change by age.

Word: "{word}"
Part of speech: "{part_of_speech}"
Optional tags (themes): {tags}

Requirements:
- Choose a single concrete scene that makes the meaning obvious without reading text.
- Use objects and actions a preschooler can name (e.g. cookie, stepstool, playground, book — not abstract ideas alone).
- The scene must work as-is for all ages; do not rely on reading, school routines, or culture-specific games unless universally obvious.
- Prefer one focal child or animal and one clear action; avoid busy crowds or tiny details.
- Tone: warm, safe, positive (never scary or shaming).

Return ONLY valid JSON with these keys:
- "visual_concept": one short phrase (e.g. "one cookie into a jar — just enough")
- "scene_for_artist": 2–4 sentences describing exactly what to draw (characters, pose, setting, key props). No camera or art-direction jargon.
- "concrete_anchor": the main prop or action in simple words (for consistency checks)
- "avoid": array of strings — metaphors or second scenes to NOT add (e.g. a separate "treasure hunt" if we already chose a cookie jar scene)

Do not use a code fence or any text outside the JSON. Use standard JSON only: straight double quotes on keys and string values, no trailing commas."""

STAGE2_LEVEL_TEXT_PROMPT_TEMPLATE = """Word: "{word}"
Audience: {level} (use vocabulary and sentence length right for this age only).

Shared illustration (the app will show a picture of THIS scene — your example must fit it):
{scene_for_artist}

Concrete focus (must stay consistent): {concrete_anchor}

Tasks:
1. "definition" — short, level-appropriate; you may refer to the concrete_anchor in plain words.
2. "example" — ONE sentence that could be happening in the scene above (same place, props, and idea). Do not introduce a new location or metaphor.
3. "tryIt" — a simple activity or question for the child; no new visual scenario that contradicts the scene.
4. "speak" — how to say the word "{word}" aloud for a child or caregiver (the headword only, not a sentence). Use hyphen-separated chunks (one chunk per syllable or clear beat). Mark the stressed syllable with ALL CAPS inside that chunk (e.g. "HAP-ee" for happy, "in-SPY-er" for inspire). Use familiar English spellings for sounds, not IPA. Keep it short.

Return ONLY valid JSON:
{text_template}
No code fence or other text."""

STAGE3_IMAGE_PROMPT_TEMPLATE = """Create a single children's vocabulary illustration — one clear scene, no comic panels.

Scene to depict (follow closely; do not add a second story or setting):
{scene_for_artist}

Art style (match a gentle educational app, not bold marketing vector):
- 2D cartoon, soft rounded shapes, friendly proportions.
- Color: soft pastel palette — warm cream or light beige background, muted blues, gentle browns, soft coral or yellow accents; avoid neon or harsh saturation.
- Line: soft brown or dusty blue outlines; not heavy black outlines.
- Mood: calm, kind, hopeful; the character can show a content or thoughtful expression when appropriate.
- Setting: simple, readable background (e.g. home, classroom, park) with minimal clutter.
- Lighting: soft and even, no dramatic shadows.

Hard rules:
- No text, letters, numbers, logos, or labels anywhere in the image.
- No scary, violent, or shaming imagery.

Output: one square-friendly illustration suitable for a flashcard."""

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


def _ordered_generation_levels(levels: List[str]) -> List[str]:
    """Stable order for API calls (subset of batch levels)."""
    want = set(levels)
    return [lev for lev in LEVEL_GENERATION_ORDER if lev in want]


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


def _coerce_llm_json_text(raw: str) -> str:
    """Strip markdown fences and surrounding prose so ``json.loads`` can run.

    Gemini often returns ```json ... ``` or text before/after the object.
    """
    text = (raw or "").strip()
    if not text:
        return text
    fence = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if fence:
        return fence.group(1).strip()
    start = text.find("{")
    if start == -1:
        return text
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return text[start:]


def _debug_log_gemini_parse_failure(
    label: str,
    response,
    response_text: str,
    coerced: str,
    exc: BaseException,
) -> None:
    """Print model output and response metadata when JSON parsing fails."""
    print(f"[cartoon] DEBUG parse failure [{label}]: {exc}", flush=True)
    print(f"[cartoon] DEBUG [{label}] raw extracted text ({len(response_text)} chars):", flush=True)
    print(response_text, flush=True)
    print(
        f"[cartoon] DEBUG [{label}] after coercion ({len(coerced)} chars):\n{coerced}",
        flush=True,
    )
    if response is None:
        print(f"[cartoon] DEBUG [{label}] (no response object passed to parser)", flush=True)
        return
    rtype = type(response).__name__
    rrepr = repr(response)
    if len(rrepr) > 4000:
        rrepr = rrepr[:4000] + "…[truncated]"
    print(f"[cartoon] DEBUG [{label}] response type={rtype!r} repr:\n{rrepr}", flush=True)
    cand = getattr(response, "candidates", None)
    if cand is not None:
        print(f"[cartoon] DEBUG [{label}] response.candidates={cand!r}", flush=True)


def _parse_text_response(response_text: str, *, response=None) -> dict:
    coerced = _coerce_llm_json_text(response_text)
    try:
        payload = json.loads(coerced)
    except json.JSONDecodeError as exc:
        _debug_log_gemini_parse_failure("level_text", response, response_text, coerced, exc)
        raise InvalidResponseError("Text response is not valid JSON.") from exc
    if not isinstance(payload, dict):
        raise InvalidResponseError("Text response JSON must be an object.")
    for key in ("definition", "example", "tryIt", "speak"):
        value = payload.get(key)
        if not isinstance(value, str) or not value.strip():
            raise InvalidResponseError(f"Text response JSON missing or empty field: '{key}'.")
    return {
        "definition": payload["definition"].strip(),
        "example": payload["example"].strip(),
        "tryIt": payload["tryIt"].strip(),
        "speak": payload["speak"].strip(),
    }


def _parse_concept_response(response_text: str, *, response=None) -> dict:
    coerced = _coerce_llm_json_text(response_text)
    try:
        payload = json.loads(coerced)
    except json.JSONDecodeError as exc:
        _debug_log_gemini_parse_failure("concept", response, response_text, coerced, exc)
        raise InvalidResponseError("Concept response is not valid JSON.") from exc
    if not isinstance(payload, dict):
        _debug_log_gemini_parse_failure(
            "concept", response, response_text, coerced, ValueError("not an object")
        )
        raise InvalidResponseError("Concept response JSON must be an object.")
    for key in ("visual_concept", "scene_for_artist", "concrete_anchor"):
        if key not in payload:
            raise InvalidResponseError(f"Concept JSON missing key '{key}'.")
        if not isinstance(payload[key], str) or not str(payload[key]).strip():
            raise InvalidResponseError(f"Concept JSON field '{key}' must be a non-empty string.")
    avoid = payload.get("avoid", [])
    if avoid is None:
        avoid = []
    if isinstance(avoid, str):
        avoid = [avoid] if avoid.strip() else []
    if not isinstance(avoid, list) or not all(isinstance(x, str) for x in avoid):
        raise InvalidResponseError("Concept JSON 'avoid' must be an array of strings.")
    return {
        "visual_concept": str(payload["visual_concept"]).strip(),
        "scene_for_artist": str(payload["scene_for_artist"]).strip(),
        "concrete_anchor": str(payload["concrete_anchor"]).strip(),
        "avoid": [str(x).strip() for x in avoid],
    }


def _build_level_text_prompt(word: str, level: str, scene_for_artist: str, concrete_anchor: str) -> str:
    return STAGE2_LEVEL_TEXT_PROMPT_TEMPLATE.format(
        word=word,
        level=level,
        scene_for_artist=scene_for_artist,
        concrete_anchor=concrete_anchor,
        text_template=json.dumps(TEXT_PROMPT_RESPONSE_TEMPLATE),
    )


def _build_image_prompt(scene_for_artist: str) -> str:
    return STAGE3_IMAGE_PROMPT_TEMPLATE.format(scene_for_artist=scene_for_artist)


def _generate_shared_concept(client: genai.Client, word: str, entry: dict, model: str = TEXT_MODEL) -> dict:
    part = entry.get("partOfSpeech") or "noun"
    tags = entry.get("tags") or []
    if not isinstance(tags, list):
        tags = []
    tags_json = json.dumps(tags)
    prompt = STAGE1_CONCEPT_PROMPT_TEMPLATE.format(
        word=word, part_of_speech=part, tags=tags_json
    )
    print(f"[cartoon] API concept request model={model} word={word!r}", flush=True)
    try:
        response = client.models.generate_content(model=model, contents=prompt)
    except Exception as exc:
        if _is_budget_error(exc):
            raise BudgetLimitError("Budget or quota limit reached.") from exc
        raise TextGenerationError("Failed to generate shared illustration concept.") from exc
    if response is None:
        raise TextGenerationError("API returned no response.")
    response_text = _extract_text_from_response(response)
    concept = _parse_concept_response(response_text, response=response)
    print(f"[cartoon] visual_concept: {concept['visual_concept']!r}", flush=True)
    return concept


def _generate_level_content(
    client: genai.Client,
    word: str,
    level: str,
    scene_for_artist: str,
    concrete_anchor: str,
    model: str = TEXT_MODEL,
) -> dict:
    prompt = _build_level_text_prompt(word, level, scene_for_artist, concrete_anchor)
    print(f"[cartoon] API text request model={model} word={word!r} level={level!r}", flush=True)
    try:
        response = client.models.generate_content(model=model, contents=prompt)
    except Exception as exc:
        if _is_budget_error(exc):
            raise BudgetLimitError("Budget or quota limit reached.") from exc
        raise TextGenerationError("Failed to generate level content.") from exc
    if response is None:
        raise TextGenerationError("API returned no response.")
    response_text = _extract_text_from_response(response)
    return _parse_text_response(response_text, response=response)


def _extract_image_from_response(response):
    parts = getattr(response, "parts", []) or []
    for part in parts:
        if getattr(part, "inline_data", None) is not None:
            return part.as_image()
    raise ImageGenerationError("Image response contained no image data.")


def _generate_cartoon_image(
    client: genai.Client, image_prompt: str, output_path: Path, model: str = IMAGE_MODEL
) -> Path:
    preview = image_prompt[:80].replace("\n", " ")
    print(f"[cartoon] API image request model={model} prompt={preview!r}...", flush=True)
    try:
        response = client.models.generate_content(model=model, contents=image_prompt)
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


def run_word_visual_pipeline(
    entry: dict,
    levels: List[str],
    output_path: Path,
) -> tuple[Path, str, dict[str, dict]]:
    """One shared scene concept, level-specific JSON text, one illustration.

    Returns ``(output_path, image_prompt, level_gemini_id -> level_content)`` for each
    requested audience level in ``levels``.
    """
    word = (entry.get("word") or "").strip()
    if not word:
        raise ValueError("entry must include a non-empty 'word'.")
    ordered = _ordered_generation_levels(levels)
    if not ordered:
        raise ValueError("levels must include at least one allowed audience level.")

    print(f"[cartoon] start word={word!r} levels={ordered} output={output_path}", flush=True)
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ConfigurationError("GEMINI_API_KEY is missing from the environment.")
    client = genai.Client(api_key=api_key)

    concept = _generate_shared_concept(client, word, entry)
    scene = concept["scene_for_artist"]
    anchor = concept["concrete_anchor"]

    level_contents: dict[str, dict] = {}
    for level in ordered:
        content = _generate_level_content(client, word, level, scene, anchor)
        print(f"[cartoon] {level} definition: {content['definition']!r}", flush=True)
        level_contents[LEVEL_ID_MAP[level]] = content

    image_prompt = _build_image_prompt(scene)
    out = _generate_cartoon_image(client, image_prompt, output_path)
    print(f"[cartoon] done -> {out}", flush=True)
    return out, image_prompt, level_contents


def run_cartoon_pipeline(word: str, level: str, output_path: Path) -> tuple[Path, str, dict]:
    """Backward-compatible single-level wrapper (runs full three-level pipeline if needed)."""
    entry = {
        "word": word,
        "partOfSpeech": "noun",
        "tags": [],
        "levels": [level],
    }
    out, image_prompt, by_id = run_word_visual_pipeline(entry, [level], output_path)
    content = by_id[LEVEL_ID_MAP[level]]
    return out, image_prompt, content


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

    image_id = uuid.uuid4().hex[:10]
    output_dir = assets_dir / word_id
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"shared-{image_id}.png"
    rel_path = str(output_path.as_posix())
    if rel_path in existing_paths:
        print(f"[word] {word!r} skip shared asset (already in candidate)", flush=True)
    else:
        ordered = _ordered_generation_levels(levels)
        pipeline_entry = {
            "word": word,
            "partOfSpeech": entry.get("partOfSpeech") or candidate.get("partOfSpeech") or "noun",
            "tags": entry.get("tags")
            if entry.get("tags") is not None
            else candidate.get("tags") or [],
            "levels": levels,
        }
        print(f"[word] {word!r} generating shared illustration -> {output_path}", flush=True)
        _out_path, image_prompt, level_contents = run_word_visual_pipeline(
            pipeline_entry, ordered, output_path
        )
        images.append(
            {
                "imageId": image_id,
                "prompt": image_prompt,
                "model": "gemini",
                "assetPath": rel_path,
                "createdAt": now,
            }
        )
        for level_id, level_content in level_contents.items():
            candidate["levels"].setdefault(level_id, []).append(
                {
                    "definition": level_content["definition"],
                    "example": level_content["example"],
                    "tryIt": level_content["tryIt"],
                    "speak": level_content["speak"],
                    "model": "gemini",
                }
            )
        created = 1
        print(f"[word] {word!r} saved ({len(level_contents)} level(s) of text + 1 image)", flush=True)

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
    parser.add_argument(
        "--levels",
        help="Single-word mode: comma-separated audience levels (preschooler,kindergartener,first grader). Default: all three.",
    )
    parser.add_argument(
        "--level",
        help="Single-word mode: one audience level (backward compat; only that level gets generated text).",
    )
    parser.add_argument(
        "--part-of-speech",
        default="noun",
        dest="part_of_speech",
        help="Single-word mode: part of speech for the shared concept prompt.",
    )
    parser.add_argument("--output", default="generated_image.png", help="Single-word mode: output path.")
    args = parser.parse_args(list(argv))
    return args


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)

    # Single-word mode: shared concept + level text + one image
    if args.word:
        if args.level:
            levels_list = [args.level]
        elif args.levels:
            levels_list = [s.strip() for s in args.levels.split(",") if s.strip()]
        else:
            levels_list = list(LEVEL_GENERATION_ORDER)
        try:
            validate_levels(levels_list, args.word)
        except ValueError as exc:
            print(str(exc), file=sys.stderr)
            return 1
        entry = {
            "word": args.word,
            "partOfSpeech": args.part_of_speech,
            "tags": [],
            "levels": levels_list,
        }
        try:
            out, image_prompt, by_level = run_word_visual_pipeline(
                entry, levels_list, Path(args.output)
            )
            print(f"Saved cartoon image to {out}")
            print(f"Image prompt:\n{image_prompt}")
            for level_id in sorted(by_level.keys()):
                lc = by_level[level_id]
                print(f"\n--- {level_id} ---")
                print(f"Definition: {lc['definition']}")
                print(f"Example: {lc['example']}")
                print(f"Try it: {lc['tryIt']}")
                print(f"Speak: {lc['speak']}")
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

