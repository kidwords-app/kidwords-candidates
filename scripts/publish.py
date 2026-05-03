#!/usr/bin/env python3
"""Publish approved word candidates to the public KidWords app repo.

Usage:
  # Publish a single word
  python scripts/publish.py --round-id 2026-03-03 --word-id empathy

  # Publish all approved words in a round
  python scripts/publish.py --round-id 2026-03-03

Environment variables:
  CANDIDATES_REPO_PATH   Path to checked-out candidates repo (default: .)
  PUBLIC_REPO_TOKEN      GitHub PAT with contents:write on the public repo
  PUBLIC_REPO_OWNER      Public repo owner (default: kidwords-app)
  PUBLIC_REPO_NAME       GitHub repo name (default: kidwords.github.io)
  PUBLIC_APP_SUBDIR      App folder inside that repo (default: kidwords-web).
                         Writes {subdir}/src/core/words-data.json and one shared PNG
                         under {subdir}/public/cartoons/<wordId>.png (same art
                         for all grades; only level text varies in words-data).
                         Set empty for a flat repo.
  COMMIT_BASE_BRANCH     Target branch in the public repo (default: main). Writes land
                         on this branch via the Contents API — no PR is opened.

What it does:
  1. Validates each approved WordCandidate (selections complete, indexes in range).
  2. Maps each to a WordEntry and upserts it into src/core/words-data.json under the
     app subdir in the public repo. That file is always {"words": [<WordEntry>, ...]}
     (same shape when the file is created).
  3. Copies one cartoon PNG to public/cartoons/{wordId}.png — the image for
     ``selected.imageId`` (shared illustration for every grade).
  4. Pushes file updates to COMMIT_BASE_BRANCH (typically ``main``) in the public repo.
"""

import argparse
import base64
import json
import os
import sys
from pathlib import Path
from typing import Optional

import requests
from pydantic import BaseModel, ConfigDict, Field

# ── Constants ──────────────────────────────────────────────────────────────────

WORDS_DATA_REL = "src/core/words-data.json"

PUBLISH_LEVEL_ORDER: tuple[str, ...] = ("preK", "K", "G1")


class LevelCopy(BaseModel):
    """Must stay in sync with LevelCopy / levels payload in the public kidwords-web app."""

    model_config = ConfigDict(extra="forbid")

    definition: str
    example:    str
    tryIt:      str
    speak:      Optional[str] = None


class WordEntry(BaseModel):
    """Must stay in sync with WordEntry in the public kidwords-web app (words-data.json)."""

    model_config = ConfigDict(extra="forbid")

    word:          str
    partOfSpeech:  str
    syllables:     int = Field(ge=0)
    tags:          list[str]
    cartoonId:     str
    levels:        dict[str, LevelCopy]


def _app_repo_prefix(app_subdir: str) -> str:
    root = (app_subdir or "").strip().strip("/")
    return f"{root}/" if root else ""


def _words_data_repo_path(app_subdir: str) -> str:
    """Path to words-data.json within the public GitHub repo."""
    return f"{_app_repo_prefix(app_subdir)}{WORDS_DATA_REL}"


def _cartoon_repo_path(app_subdir: str, word_id: str) -> str:
    """Path to the shared cartoon PNG (``public/cartoons/{wordId}.png``)."""
    return f"{_app_repo_prefix(app_subdir)}public/cartoons/{word_id}.png"


def _ordered_publish_levels(selected_levels: dict) -> list[str]:
    """Levels present in the selection, in canonical order (for iteration / docs)."""
    return [lid for lid in PUBLISH_LEVEL_ORDER if lid in selected_levels]


# ── Error types ────────────────────────────────────────────────────────────────

class PublishError(Exception):
    pass


class ValidationError(PublishError):
    pass


# ── Validation ─────────────────────────────────────────────────────────────────

def validate_word_candidate(word: dict) -> None:
    """Raise ValidationError if the candidate is not ready to publish.

    Levels are optional — only levels present in selected.levels are validated.
    At least one level must be complete. Missing levels are skipped at publish
    time and can be shown as 'coming soon' in the public app.
    """
    word_id = word.get("wordId", "<unknown>")

    if word.get("status") != "approved":
        raise ValidationError(
            f"{word_id}: status is '{word.get('status')}', expected 'approved'"
        )

    selected = word.get("selected", {})
    if not selected.get("imageId"):
        raise ValidationError(f"{word_id}: no image selected")

    # Verify the selected imageId actually exists in the images array
    image_ids = {img["imageId"] for img in word.get("images", [])}
    if selected["imageId"] not in image_ids:
        raise ValidationError(
            f"{word_id}: selected imageId '{selected['imageId']}' not found in images"
        )

    selected_levels = selected.get("levels", {})
    levels_data = word.get("levels", {})

    # Validate only the levels that have selections; require at least one.
    if not selected_levels:
        raise ValidationError(f"{word_id}: no level selections — at least one level is required")

    for level, sel in selected_levels.items():
        candidates = levels_data.get(level, [])
        for field in ("definition", "example", "tryIt"):
            if sel.get(field) is None:
                raise ValidationError(
                    f"{word_id}: missing '{field}' selection for level '{level}'"
                )
            idx = sel[field]
            if idx >= len(candidates):
                raise ValidationError(
                    f"{word_id}: selected index {idx} for {level}.{field} is out of range "
                    f"({len(candidates)} candidate(s) available)"
                )


# ── Mapping ────────────────────────────────────────────────────────────────────

def map_to_word_entry(word: dict) -> dict:
    """Convert an approved WordCandidate to the WordEntry shape for the public app.

    Only levels present in selected.levels are included. Missing levels are
    omitted from the output so the public app can show a 'coming soon' banner.
    Each level field (definition, example, tryIt) is resolved independently
    from the candidate at the selected index — allowing mix-and-match across
    model attempts. ``speak`` (when present on the candidate row) is taken from
    the same row as the selected ``definition`` so pronunciation matches that
    wording.

    Output keys match ``WordEntry`` in kidwords-web (``cartoonId`` ties to
    ``public/cartoons/{cartoonId}.png`` — one shared image for all grades); pipeline-only
    metadata must not appear here.
    """
    selected_levels = word["selected"]["levels"]
    levels_data = word["levels"]

    levels: dict[str, dict] = {}
    for level, sel in selected_levels.items():
        candidates = levels_data[level]
        def_row = candidates[sel["definition"]]
        level_out = {
            "definition": def_row["definition"],
            "example":    candidates[sel["example"]]["example"],
            "tryIt":      candidates[sel["tryIt"]]["tryIt"],
        }
        speak_val = def_row.get("speak")
        if isinstance(speak_val, str) and speak_val.strip():
            level_out["speak"] = speak_val.strip()
        levels[level] = level_out

    wid = word["wordId"]
    raw = {
        "word":         word["word"],
        "partOfSpeech": word.get("partOfSpeech", ""),
        "syllables":    int(word.get("syllables", 0) or 0),
        "tags":         list(word.get("tags", [])),
        "cartoonId":    wid,
        "levels":       levels,
    }
    return WordEntry.model_validate(raw).model_dump(exclude_none=True)


def _entry_cartoon_id(entry: dict) -> str:
    """Stable id for upsert + sort; supports legacy rows that used ``wordId``."""
    return str(entry.get("cartoonId") or entry.get("wordId") or "")


def _require_words_data_root(parsed: object) -> dict:
    """Return the words-data.json root object; must have a ``words`` list of word dicts."""
    if isinstance(parsed, list):
        raise PublishError(
            'words-data.json must be a JSON object {"words": [...]}, not a bare array.'
        )
    if not isinstance(parsed, dict):
        raise PublishError(
            f"words-data.json root must be a JSON object, not {type(parsed).__name__}"
        )
    words = parsed.get("words")
    if not isinstance(words, list):
        raise PublishError(
            'words-data.json must include a top-level "words" array (list of word objects).'
        )
    for i, item in enumerate(words):
        if not isinstance(item, dict):
            raise PublishError(
                f"words-data.json words[{i}] must be an object, not {type(item).__name__}"
            )
    return parsed


# ── GitHub API client ──────────────────────────────────────────────────────────

class GitHubClient:
    def __init__(self, token: str, owner: str, repo: str):
        self.base = f"https://api.github.com/repos/{owner}/{repo}"
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "kidwords-publish",
        }

    def get_file(self, path: str) -> Optional[dict]:
        """Return file metadata (content + sha) or None if not found."""
        r = requests.get(f"{self.base}/contents/{path}", headers=self.headers)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()

    def put_file(
        self,
        path: str,
        content_bytes: bytes,
        message: str,
        sha: Optional[str] = None,
        branch: Optional[str] = None,
    ) -> None:
        """Create or update a file. sha required for updates; branch for non-default."""
        body: dict = {
            "message": message,
            "content": base64.b64encode(content_bytes).decode(),
        }
        if sha:
            body["sha"] = sha
        if branch:
            body["branch"] = branch
        r = requests.put(
            f"{self.base}/contents/{path}", headers=self.headers, json=body
        )
        r.raise_for_status()



# ── File helpers ───────────────────────────────────────────────────────────────

def load_word_candidate(candidates_path: Path, round_id: str, word_id: str) -> dict:
    path = (
        candidates_path
        / "candidates"
        / "rounds"
        / round_id
        / "words"
        / f"{word_id}.json"
    )
    if not path.exists():
        raise PublishError(f"Word file not found: {path}")
    return json.loads(path.read_text())


def load_approved_words_in_round(candidates_path: Path, round_id: str) -> list[dict]:
    round_dir = (
        candidates_path / "candidates" / "rounds" / round_id / "words"
    )
    if not round_dir.exists():
        raise PublishError(f"Round directory not found: {round_dir}")
    words = []
    for p in sorted(round_dir.glob("*.json")):
        word = json.loads(p.read_text())
        if word.get("status") == "approved":
            words.append(word)
    return words


def load_image_bytes(candidates_path: Path, word: dict) -> bytes:
    """Load the globally selected image (``selected.imageId``)."""
    image_id = word["selected"]["imageId"]
    image_candidate = next(
        (img for img in word["images"] if img["imageId"] == image_id), None
    )
    if not image_candidate:
        raise PublishError(
            f"{word['wordId']}: image candidate '{image_id}' not found in word JSON"
        )
    asset_path = candidates_path / image_candidate["assetPath"]
    if not asset_path.exists():
        raise PublishError(f"{word['wordId']}: image file not found: {asset_path}")
    return asset_path.read_bytes()


# ── Per-word publish ───────────────────────────────────────────────────────────

def publish_word(
    word: dict,
    candidates_path: Path,
    public_gh: GitHubClient,
    branch: str,
    *,
    app_subdir: str = "",
) -> None:
    """Copy the shared cartoon and upsert words-data.json for a single word."""
    word_id = word["wordId"]
    words_data_path = _words_data_repo_path(app_subdir)

    # 1. One cartoon for all grades (selected.imageId)
    image_bytes = load_image_bytes(candidates_path, word)
    image_dest = _cartoon_repo_path(app_subdir, word_id)
    existing_image = public_gh.get_file(image_dest)
    public_gh.put_file(
        image_dest,
        image_bytes,
        message=f"publish: cartoon for {word_id}",
        sha=existing_image["sha"] if existing_image else None,
        branch=branch,
    )
    print(f"  ✓ image  → {image_dest}")

    # 2. Upsert words-data.json (schema: {"words": [<WordEntry>, ...]})
    existing_data_file = public_gh.get_file(words_data_path)
    if existing_data_file:
        content = base64.b64decode(
            existing_data_file["content"].replace("\n", "")
        ).decode()
        words_root = _require_words_data_root(json.loads(content))
        data_sha: Optional[str] = existing_data_file["sha"]
    else:
        words_root = {"words": []}
        data_sha = None

    words_list = words_root["words"]
    entry = map_to_word_entry(word)
    words_list = [e for e in words_list if _entry_cartoon_id(e) != word_id]
    words_list.append(entry)
    words_list.sort(
        key=lambda e: (_entry_cartoon_id(e) or e.get("word", "")).lower(),
    )
    words_root["words"] = words_list

    public_gh.put_file(
        words_data_path,
        json.dumps(words_root, indent=2, ensure_ascii=False).encode(),
        message=f"publish: add word '{word_id}'",
        sha=data_sha,
        branch=branch,
    )
    print(f"  ✓ words  → {words_data_path} (upserted '{word_id}')")


# ── Orchestration ──────────────────────────────────────────────────────────────

def run(args: argparse.Namespace) -> None:
    candidates_path = Path(os.environ.get("CANDIDATES_REPO_PATH", "."))
    token = os.environ["PUBLIC_REPO_TOKEN"]
    owner = os.environ.get("PUBLIC_REPO_OWNER", "kidwords-app")
    repo = os.environ.get("PUBLIC_REPO_NAME", "kidwords.github.io")
    app_subdir = os.environ.get("PUBLIC_APP_SUBDIR", "kidwords-web")
    base_branch = os.environ.get("COMMIT_BASE_BRANCH", "main")

    public_gh = GitHubClient(token, owner, repo)

    # Collect words
    if args.word_id:
        words = [load_word_candidate(candidates_path, args.round_id, args.word_id)]
    else:
        words = load_approved_words_in_round(candidates_path, args.round_id)

    if not words:
        print("No approved words to publish.")
        sys.exit(0)

    print(f"Publishing {len(words)} word(s) from round {args.round_id}…\n")

    # Validate all words before touching the public repo
    for word in words:
        validate_word_candidate(word)
        print(f"  ✓ {word['wordId']} validated")

    print(f"Target branch: {base_branch}\n")

    # Publish each word directly to the base branch
    published = []
    for word in words:
        print(f"Publishing {word['wordId']}…")
        publish_word(word, candidates_path, public_gh, base_branch, app_subdir=app_subdir)
        published.append(word["wordId"])

    print(f"\n✓ Published {len(published)} word(s) to {base_branch}: {', '.join(published)}")


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Publish approved word candidates to the public KidWords app."
    )
    parser.add_argument("--round-id", required=True, help="Round ID (YYYY-MM-DD)")
    parser.add_argument("--word-id", help="Publish a single word by ID (omit for whole round)")
    args = parser.parse_args()

    try:
        run(args)
    except (PublishError, ValidationError) as e:
        print(f"\nERROR: {e}", file=sys.stderr)
        sys.exit(1)
    except requests.HTTPError as e:
        print(f"\nGitHub API error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
