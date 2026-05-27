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
AUDIENCE_BY_LEVEL_ID = {v: k for k, v in LEVEL_ID_MAP.items()}

# ---- Cartoon pipeline (Gemini text + image generation) ----
# Definition-first: teaching scenario → level copy (definition + example) → scene → one image.

TEXT_PROMPT_RESPONSE_TEMPLATE = {
    "definition": "",
    "example": "",
    "tryIt": "",
    "speak": "",
}

STAGE1_TEACHING_SCENARIO_TEMPLATE = """You are planning vocabulary content for a children's app. The same word will be taught to preschool, kindergarten, and first grade with different wording, but ONE shared picture will illustrate every level.

Word: "{word}"
Part of speech: "{part_of_speech}"
Optional tags (themes): {tags}

Start from meaning. Plan a single concrete everyday situation a child can understand:
- The situation should make the word's meaning clear through action and objects, not abstraction alone.
- Use props and actions a preschooler can name (e.g. toothbrush, backpack, toys, lunchbox).
- Prefer one clear moment or action; avoid culture-specific games unless obvious.
- Tone: warm, safe, positive (never scary or shaming).

Return ONLY valid JSON with these keys:
- "teaching_scenario": 2–3 sentences describing the situation (what is happening and why it explains the word).
- "concrete_anchor": the main object or action in simple words (for consistency across levels)
- "example_core": ONE short example sentence idea that clearly shows the word being used in this situation 
- "avoid": array of strings — extra metaphors or second situations to NOT use
{admin_guidance_block}
Do not use a code fence or any text outside the JSON. Use standard JSON only: straight double quotes on keys and string values, no trailing commas."""

STAGE2_LEVEL_TEXT_PROMPT_TEMPLATE = """Word: "{word}"
Audience: {level} (vocabulary and sentence length for this age only).

Teaching situation (all levels share this idea; your copy must stay in this situation):
{teaching_scenario}

Concrete focus: {concrete_anchor}
Core example to adapt (make it natural for this age): {example_core}

Tasks — write teaching copy BEFORE any picture exists:
1. "definition" — short, accurate, and easy for this age to understand. Say what the word means using the situation above.
2. "example" — ONE concrete sentence a child can picture. It must match the teaching situation and illustrate the definition. Do not introduce a new place, prop, or story.
3. "tryIt" — a simple question or activity; stay in the same situation.
4. "speak" — how to say "{word}" aloud (headword only). Hyphen-separated chunks per syllable/beat; mark the stressed chunk with ALL CAPS (e.g. "pri-OR-i-tize"). Familiar English spellings, not IPA.

Return ONLY valid JSON:
{text_template}
No code fence or other text."""

STAGE3_SCENE_FROM_TEXT_TEMPLATE = """You are an art director. A children's vocabulary app already has written definitions and examples for multiple ages. Describe ONE illustration that matches that teaching copy (the picture comes after the words).

Word: "{word}"

Teaching situation:
{teaching_scenario}

Concrete focus: {concrete_anchor}

Level copy (the drawing must match these examples — same moment, props, and setting):
{level_copy_block}

Requirements for the scene:
- Depict what the examples describe; do not invent a different story.
- One clear scene, readable for ages 4–7; soft, friendly, no text in the image.
- One focal child or simple character action; minimal clutter.

Return ONLY valid JSON with these keys:
- "visual_concept": one short phrase summarizing the scene
- "scene_for_artist": 2–4 sentences describing exactly what to draw (characters, pose, setting, props). No camera jargon.
- "concrete_anchor": confirm the main prop or action (same as above unless you must narrow it)
- "avoid": array of strings — anything in the written copy that must NOT appear as a second scene

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

{additional_guidance_block}

Output: one square-friendly illustration suitable for a flashcard."""

# Inserted before ``Output:`` when an admin adds regen guidance (empty on first generation).
ADDITIONAL_GUIDANCE_SECTION = """Additional guidance:
{additional_guidance}
"""

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


def _parse_string_list_field(payload: dict, key: str) -> list[str]:
    avoid = payload.get(key, [])
    if avoid is None:
        avoid = []
    if isinstance(avoid, str):
        avoid = [avoid] if avoid.strip() else []
    if not isinstance(avoid, list) or not all(isinstance(x, str) for x in avoid):
        raise InvalidResponseError(f"JSON '{key}' must be an array of strings.")
    return [str(x).strip() for x in avoid]


def _parse_teaching_scenario_response(response_text: str, *, response=None) -> dict:
    coerced = _coerce_llm_json_text(response_text)
    try:
        payload = json.loads(coerced)
    except json.JSONDecodeError as exc:
        _debug_log_gemini_parse_failure("teaching_scenario", response, response_text, coerced, exc)
        raise InvalidResponseError("Teaching scenario response is not valid JSON.") from exc
    if not isinstance(payload, dict):
        raise InvalidResponseError("Teaching scenario JSON must be an object.")
    for key in ("teaching_scenario", "concrete_anchor", "example_core"):
        if key not in payload:
            raise InvalidResponseError(f"Teaching scenario JSON missing key '{key}'.")
        if not isinstance(payload[key], str) or not str(payload[key]).strip():
            raise InvalidResponseError(f"Teaching scenario field '{key}' must be a non-empty string.")
    return {
        "teaching_scenario": str(payload["teaching_scenario"]).strip(),
        "concrete_anchor": str(payload["concrete_anchor"]).strip(),
        "example_core": str(payload["example_core"]).strip(),
        "avoid": _parse_string_list_field(payload, "avoid"),
    }


def _parse_scene_response(response_text: str, *, response=None) -> dict:
    coerced = _coerce_llm_json_text(response_text)
    try:
        payload = json.loads(coerced)
    except json.JSONDecodeError as exc:
        _debug_log_gemini_parse_failure("scene", response, response_text, coerced, exc)
        raise InvalidResponseError("Scene response is not valid JSON.") from exc
    if not isinstance(payload, dict):
        raise InvalidResponseError("Scene JSON must be an object.")
    for key in ("visual_concept", "scene_for_artist", "concrete_anchor"):
        if key not in payload:
            raise InvalidResponseError(f"Scene JSON missing key '{key}'.")
        if not isinstance(payload[key], str) or not str(payload[key]).strip():
            raise InvalidResponseError(f"Scene JSON field '{key}' must be a non-empty string.")
    return {
        "visual_concept": str(payload["visual_concept"]).strip(),
        "scene_for_artist": str(payload["scene_for_artist"]).strip(),
        "concrete_anchor": str(payload["concrete_anchor"]).strip(),
        "avoid": _parse_string_list_field(payload, "avoid"),
    }


def _build_level_text_prompt(
    word: str,
    level: str,
    teaching_scenario: str,
    concrete_anchor: str,
    example_core: str,
) -> str:
    return STAGE2_LEVEL_TEXT_PROMPT_TEMPLATE.format(
        word=word,
        level=level,
        teaching_scenario=teaching_scenario,
        concrete_anchor=concrete_anchor,
        example_core=example_core,
        text_template=json.dumps(TEXT_PROMPT_RESPONSE_TEMPLATE),
    )


def _format_level_copy_block(level_contents: dict[str, dict]) -> str:
    lines: list[str] = []
    for level_id in ("preK", "K", "G1"):
        content = level_contents.get(level_id)
        if not content:
            continue
        lines.append(f"{level_id}:")
        lines.append(f"  Definition: {content['definition']}")
        lines.append(f"  Example: {content['example']}")
    return "\n".join(lines) if lines else "(no level copy)"


def _admin_guidance_block(guidance: str = "") -> str:
    text = (guidance or "").strip()
    if not text:
        return ""
    return f"\nAdmin guidance (follow when planning the situation and examples):\n{text}\n"


def _additional_guidance_block(additional_guidance: str = "") -> str:
    """Rendered block for ``STAGE3_IMAGE_PROMPT_TEMPLATE`` (empty when no guidance)."""
    text = (additional_guidance or "").strip()
    if not text:
        return ""
    body = ADDITIONAL_GUIDANCE_SECTION.format(additional_guidance=text).rstrip()
    return f"\n\n{body}\n\n"


def _build_image_prompt(scene_for_artist: str, additional_guidance: str = "") -> str:
    return STAGE3_IMAGE_PROMPT_TEMPLATE.format(
        scene_for_artist=scene_for_artist,
        additional_guidance_block=_additional_guidance_block(additional_guidance),
    )


def _generate_teaching_scenario(
    client: genai.Client,
    word: str,
    entry: dict,
    model: str = TEXT_MODEL,
    *,
    admin_guidance: str = "",
) -> dict:
    part = entry.get("partOfSpeech") or "noun"
    tags = entry.get("tags") or []
    if not isinstance(tags, list):
        tags = []
    tags_json = json.dumps(tags)
    prompt = STAGE1_TEACHING_SCENARIO_TEMPLATE.format(
        word=word,
        part_of_speech=part,
        tags=tags_json,
        admin_guidance_block=_admin_guidance_block(admin_guidance),
    )
    print(f"[cartoon] API teaching-scenario request model={model} word={word!r}", flush=True)
    try:
        response = client.models.generate_content(model=model, contents=prompt)
    except Exception as exc:
        if _is_budget_error(exc):
            raise BudgetLimitError("Budget or quota limit reached.") from exc
        raise TextGenerationError("Failed to generate teaching scenario.") from exc
    if response is None:
        raise TextGenerationError("API returned no response.")
    response_text = _extract_text_from_response(response)
    scenario = _parse_teaching_scenario_response(response_text, response=response)
    print(f"[cartoon] example_core: {scenario['example_core']!r}", flush=True)
    return scenario


def _generate_level_content(
    client: genai.Client,
    word: str,
    level: str,
    teaching_scenario: str,
    concrete_anchor: str,
    example_core: str,
    model: str = TEXT_MODEL,
) -> dict:
    prompt = _build_level_text_prompt(
        word, level, teaching_scenario, concrete_anchor, example_core
    )
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


def _generate_scene_from_level_text(
    client: genai.Client,
    word: str,
    teaching_scenario: str,
    concrete_anchor: str,
    level_contents: dict[str, dict],
    model: str = TEXT_MODEL,
) -> dict:
    prompt = STAGE3_SCENE_FROM_TEXT_TEMPLATE.format(
        word=word,
        teaching_scenario=teaching_scenario,
        concrete_anchor=concrete_anchor,
        level_copy_block=_format_level_copy_block(level_contents),
    )
    print(f"[cartoon] API scene-from-text request model={model} word={word!r}", flush=True)
    try:
        response = client.models.generate_content(model=model, contents=prompt)
    except Exception as exc:
        if _is_budget_error(exc):
            raise BudgetLimitError("Budget or quota limit reached.") from exc
        raise TextGenerationError("Failed to derive illustration scene from level copy.") from exc
    if response is None:
        raise TextGenerationError("API returned no response.")
    response_text = _extract_text_from_response(response)
    scene = _parse_scene_response(response_text, response=response)
    print(f"[cartoon] scene_for_artist: {scene['scene_for_artist'][:80]!r}...", flush=True)
    return scene


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
    *,
    additional_guidance: str = "",
    text_guidance: str = "",
) -> tuple[Path, str, dict[str, dict]]:
    """Teaching scenario → level copy → scene from text → one shared illustration.

    Returns ``(output_path, image_prompt, level_id -> level_content)`` for each
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

    scenario = _generate_teaching_scenario(client, word, entry, admin_guidance=text_guidance)
    teaching = scenario["teaching_scenario"]
    anchor = scenario["concrete_anchor"]
    example_core = scenario["example_core"]

    level_contents: dict[str, dict] = {}
    for level in ordered:
        content = _generate_level_content(
            client, word, level, teaching, anchor, example_core
        )
        print(f"[cartoon] {level} definition: {content['definition']!r}", flush=True)
        level_contents[LEVEL_ID_MAP[level]] = content

    scene = _generate_scene_from_level_text(client, word, teaching, anchor, level_contents)
    image_prompt = _build_image_prompt(
        scene["scene_for_artist"], additional_guidance=additional_guidance
    )
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


def _first_image_prompt(candidate: dict) -> str | None:
    """Prompt from the first (original) image candidate — the initial generation."""
    images = candidate.get("images") or []
    if not images:
        return None
    first = images[0]
    if isinstance(first, dict):
        p = first.get("prompt")
        return p if isinstance(p, str) and p.strip() else None
    return None


def insert_regen_before_output(base_prompt: str, regen_text: str) -> str:
    """Insert admin regen guidance immediately before the ``Output:`` section."""
    extra = regen_text.strip()
    if not extra:
        raise ValueError("regen text must be non-empty")
    block = _additional_guidance_block(extra)

    for marker in ("\n\nOutput:", "\nOutput:", "Output:"):
        idx = base_prompt.find(marker)
        if idx != -1:
            before = base_prompt[:idx].rstrip()
            after = base_prompt[idx:].lstrip("\n")
            return f"{before}{block}{after}"
    return f"{base_prompt.rstrip()}{block}"


def resolve_regen_image_prompt(mode: str, prompt: str, subprompt: str, candidate: dict) -> str:
    if mode == "replace":
        text = (prompt or "").strip()
        if not text:
            raise ValueError("replace mode requires a non-empty prompt")
        return text
    if mode == "subprompt":
        base = _first_image_prompt(candidate)
        if not base:
            word_id = candidate.get("wordId", "?")
            raise ValueError(f"No original image prompt to extend for wordId={word_id}")
        extra = (subprompt or "").strip()
        if not extra:
            raise ValueError("subprompt mode requires a non-empty subprompt")
        return insert_regen_before_output(base, extra)
    raise ValueError(f"Unknown regen mode: {mode!r} (expected replace or subprompt)")


def _parse_regen_level_ids(levels_csv: str) -> List[str]:
    """Map admin level ids (preK,K,G1) to audience level strings."""
    if not levels_csv.strip():
        raise ValueError("full regen requires at least one level id (preK, K, G1)")
    out: List[str] = []
    for raw in levels_csv.split(","):
        level_id = raw.strip()
        if not level_id:
            continue
        audience = AUDIENCE_BY_LEVEL_ID.get(level_id)
        if not audience:
            raise ValueError(f"Unknown level id {level_id!r}; expected preK, K, or G1")
        out.append(audience)
    if not out:
        raise ValueError("full regen requires at least one level id (preK, K, G1)")
    validate_levels(out, "regen")
    return _ordered_generation_levels(out)


def regenerate_full_for_word(
    word_id: str,
    round_id: str,
    candidates_repo: Path,
    levels_csv: str,
    text_guidance: str = "",
) -> int:
    """Re-run definition-first pipeline for selected levels; append text + image candidates."""
    candidate_path = (
        candidates_repo / "candidates" / "rounds" / round_id / "words" / f"{word_id}.json"
    )
    if not candidate_path.exists():
        raise FileNotFoundError(f"Word candidate not found: {candidate_path}")

    candidate = json.loads(candidate_path.read_text(encoding="utf-8"))
    word = candidate.get("word") or word_id
    audience_levels = _parse_regen_level_ids(levels_csv)

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ConfigurationError("GEMINI_API_KEY is missing from the environment.")
    client = genai.Client(api_key=api_key)

    now = datetime.now(timezone.utc).isoformat()
    assets_dir = candidates_repo / "candidates" / "rounds" / round_id / "assets"
    image_id = uuid.uuid4().hex[:10]
    output_path = assets_dir / word_id / f"shared-{image_id}.png"
    rel_path = str(output_path.as_posix())

    pipeline_entry = {
        "word": word,
        "partOfSpeech": candidate.get("partOfSpeech") or "noun",
        "tags": candidate.get("tags") or [],
        "levels": audience_levels,
    }
    print(
        f"[regen-full] wordId={word_id!r} levels={audience_levels!r} guidance={text_guidance[:60]!r}...",
        flush=True,
    )
    _out_path, image_prompt, level_contents = run_word_visual_pipeline(
        pipeline_entry,
        audience_levels,
        output_path,
        text_guidance=text_guidance,
    )

    images = list(candidate.get("images") or [])
    images.append(
        {
            "imageId": image_id,
            "prompt": image_prompt,
            "model": "gemini",
            "assetPath": rel_path,
            "createdAt": now,
        }
    )
    candidate["images"] = images
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
    candidate["status"] = "in_review"
    candidate["updatedAt"] = now
    candidate_path.write_text(
        json.dumps(candidate, indent=2, sort_keys=True), encoding="utf-8"
    )
    print(f"[regen-full] appended image {image_id!r} and {len(level_contents)} level(s)", flush=True)
    return 1


def regenerate_image_for_word(
    word_id: str,
    round_id: str,
    candidates_repo: Path,
    mode: str,
    prompt: str = "",
    subprompt: str = "",
) -> int:
    """Append one new image candidate for an existing word (admin image regen)."""
    candidate_path = (
        candidates_repo / "candidates" / "rounds" / round_id / "words" / f"{word_id}.json"
    )
    if not candidate_path.exists():
        raise FileNotFoundError(f"Word candidate not found: {candidate_path}")

    candidate = json.loads(candidate_path.read_text(encoding="utf-8"))
    image_prompt = resolve_regen_image_prompt(mode, prompt, subprompt, candidate)

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ConfigurationError("GEMINI_API_KEY is missing from the environment.")
    client = genai.Client(api_key=api_key)

    now = datetime.now(timezone.utc).isoformat()
    assets_dir = candidates_repo / "candidates" / "rounds" / round_id / "assets"
    image_id = uuid.uuid4().hex[:10]
    output_path = assets_dir / word_id / f"shared-{image_id}.png"
    rel_path = str(output_path.as_posix())

    print(
        f"[regen] wordId={word_id!r} roundId={round_id!r} mode={mode!r} -> {output_path}",
        flush=True,
    )
    _generate_cartoon_image(client, image_prompt, output_path)

    images = list(candidate.get("images") or [])
    images.append(
        {
            "imageId": image_id,
            "prompt": image_prompt,
            "model": "gemini",
            "assetPath": rel_path,
            "createdAt": now,
        }
    )
    candidate["images"] = images
    candidate["status"] = "in_review"
    candidate["updatedAt"] = now

    candidate_path.write_text(
        json.dumps(candidate, indent=2, sort_keys=True), encoding="utf-8"
    )
    print(f"[regen] appended image {image_id!r} for {word_id!r}", flush=True)
    return 1


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
    parser.add_argument(
        "--word-id",
        default=os.environ.get("WORD_ID"),
        help="Admin regen: existing wordId slug in candidates/rounds/<round>/words/.",
    )
    parser.add_argument(
        "--regen-mode",
        default=os.environ.get("REGEN_MODE", "replace"),
        choices=("replace", "subprompt", "full"),
        help="Admin regen: replace | subprompt (image only) | full (text + image).",
    )
    parser.add_argument(
        "--regen-levels",
        default=os.environ.get("REGEN_LEVELS", ""),
        help="Admin full regen: comma-separated level ids (preK,K,G1).",
    )
    parser.add_argument(
        "--regen-prompt",
        default=os.environ.get("REGEN_PROMPT", ""),
        help="Admin regen: replacement image prompt (mode=replace).",
    )
    parser.add_argument(
        "--regen-subprompt",
        default=os.environ.get("REGEN_SUBPROMPT", ""),
        help="Admin regen: text to append (mode=subprompt).",
    )
    args = parser.parse_args(list(argv))
    return args


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)

    # Admin image regen for an existing candidate JSON
    if args.word_id:
        if not args.round_id:
            print("Error: --round-id (or ROUND_ID) required with --word-id.", file=sys.stderr)
            return 1
        if not args.candidates_repo:
            print("Error: --candidates-repo (or CANDIDATES_REPO_PATH) required with --word-id.", file=sys.stderr)
            return 1
        try:
            if args.regen_mode == "full":
                created = regenerate_full_for_word(
                    args.word_id,
                    args.round_id,
                    Path(args.candidates_repo),
                    args.regen_levels,
                    args.regen_subprompt or "",
                )
            else:
                created = regenerate_image_for_word(
                    args.word_id,
                    args.round_id,
                    Path(args.candidates_repo),
                    args.regen_mode,
                    args.regen_prompt or "",
                    args.regen_subprompt or "",
                )
        except (FileNotFoundError, ValueError) as exc:
            print(str(exc), file=sys.stderr)
            return 1
        except BudgetLimitError as exc:
            print(f"Error: {exc}", file=sys.stderr)
            return 2
        except (
            ImageGenerationError,
            TextGenerationError,
            ConfigurationError,
        ) as exc:
            print(f"Error: {exc}", file=sys.stderr)
            return 1
        except Exception as exc:
            print(f"Regen failed: {exc}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            return 1
        print(f"Regen complete: {created} update(s) for {args.word_id!r}.")
        return 0

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

