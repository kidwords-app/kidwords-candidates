from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List

from google import genai


# todo: better google api error handling, generate multiple candidates, better way to store and retrieve API key 

TEXT_PROMPT_RESPONSE_TEMPLATE = {
    "prompts": [
        {"first": ""},
        {"second": ""},
        {"third": ""},
    ]
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


def build_text_prompt(word: str, level: str) -> str:
    return TEXT_PROMPT_TEMPLATE.format(word=word, level=level, text_prompt_response_template=json.dumps(TEXT_PROMPT_RESPONSE_TEMPLATE))


def build_cartoon_prompt(phrase: str) -> str:
    return CARTOON_PROMPT_TEMPLATE.format(phrase=phrase)

def is_budget_error(error: BaseException) -> bool:
    message = str(error).lower()
    return any(
        hint in message
        for hint in (
            "resource exhausted",
            "quota",
            "budget",
            "limit",
            "rate limit",
            "429",
        )
    )


def _extract_text_from_response(response) -> str:
    parts = getattr(response, "parts", []) or []
    text_chunks = [part.text for part in parts if getattr(part, "text", None)]
    if not text_chunks:
        raise TextGenerationError("Text response contained no text parts.")
    return "\n".join(text_chunks).strip()


def parse_text_response(response_text: str) -> List[str]:
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


def generate_text_examples(
    client: genai.Client, word: str, level: str, model: str = TEXT_MODEL
) -> List[str]:
    prompt = build_text_prompt(word, level)
    try:
        response = client.models.generate_content(model=model, contents=[prompt])
    except Exception as exc:  # pragma: no cover - defensive
        if is_budget_error(exc):
            raise BudgetLimitError("Budget or quota limit reached.") from exc
        raise TextGenerationError("Failed to generate text prompt.") from exc

    response_text = _extract_text_from_response(response)
    print("Raw text prompt response: ", response_text)
    return parse_text_response(response_text)


def _extract_image_from_response(response):
    parts = getattr(response, "parts", []) or []
    for part in parts:
        if getattr(part, "inline_data", None) is not None:
            return part.as_image()
    raise ImageGenerationError("Image response contained no image data.")


def generate_cartoon_image(
    client: genai.Client,
    phrase: str,
    output_path: Path,
    model: str = IMAGE_MODEL,
) -> Path:
    prompt = build_cartoon_prompt(phrase)
    try:
        response = client.models.generate_content(model=model, contents=[prompt])
    except Exception as exc:  # pragma: no cover - defensive
        if is_budget_error(exc):
            raise BudgetLimitError("Budget or quota limit reached.") from exc
        raise ImageGenerationError("Failed to generate cartoon image.") from exc

    image = _extract_image_from_response(response)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path)
    return output_path


def run_pipeline(word: str, level: str, output_path: Path) -> Path:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ConfigurationError("GEMINI_API_KEY is missing from the environment.")

    client = genai.Client(api_key=api_key)
    prompts = generate_text_examples(client, word, level)
    phrase = prompts[0]
    return generate_cartoon_image(client, phrase, output_path)


@dataclass(frozen=True)
class Arguments:
    word: str
    level: str
    output: Path


def parse_args(argv: Iterable[str]) -> Arguments:
    parser = argparse.ArgumentParser(description="Generate a cartoon image for a word.")
    parser.add_argument("--word", required=True, help="Word to illustrate.")
    parser.add_argument("--level", required=True, help="Audience level.")
    parser.add_argument(
        "--output",
        default="generated_image.png",
        help="Output image path.",
    )
    args = parser.parse_args(list(argv))
    return Arguments(word=args.word, level=args.level, output=Path(args.output))


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    try:
        output_path = run_pipeline(args.word, args.level, args.output)
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
    except Exception as exc:  # pragma: no cover - defensive
        print(f"Unexpected error: {exc}", file=sys.stderr)
        return 1

    print(f"Saved cartoon image to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))