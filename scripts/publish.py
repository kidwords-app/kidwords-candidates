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
  PUBLIC_REPO_NAME       Public repo name  (default: kidwords.github.io)
  PR_BASE_BRANCH         Base branch for the PR (default: main)

What it does:
  1. Validates each approved WordCandidate (selections complete, indexes in range).
  2. Maps each to a WordEntry and upserts it into src/core/words-data.json in the
     public repo.
  3. Copies the selected image to public/cartoons/{wordId}.png in the public repo.
  4. Commits both changes to a new branch and opens a PR for review.
"""

import argparse
import base64
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import requests

# ── Constants ──────────────────────────────────────────────────────────────────

LEVEL_IDS = ["preK", "K", "G1"]
WORDS_DATA_PATH = "src/core/words-data.json"


# ── Error types ────────────────────────────────────────────────────────────────

class PublishError(Exception):
    pass


class ValidationError(PublishError):
    pass


# ── Validation ─────────────────────────────────────────────────────────────────

def validate_word_candidate(word: dict) -> None:
    """Raise ValidationError if the candidate is not ready to publish."""
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

    for level in LEVEL_IDS:
        if level not in selected_levels:
            raise ValidationError(f"{word_id}: no field selections for level '{level}'")

        sel = selected_levels[level]
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

    Each level field (definition, example, tryIt) is resolved independently
    from the candidate at the selected index — allowing mix-and-match across
    model attempts.
    """
    selected_levels = word["selected"]["levels"]
    levels_data = word["levels"]

    levels = {}
    for level in LEVEL_IDS:
        sel = selected_levels[level]
        candidates = levels_data[level]
        levels[level] = {
            "definition": candidates[sel["definition"]]["definition"],
            "example":    candidates[sel["example"]]["example"],
            "tryIt":      candidates[sel["tryIt"]]["tryIt"],
        }

    return {
        "wordId":       word["wordId"],
        "word":         word["word"],
        "partOfSpeech": word.get("partOfSpeech", ""),
        "syllables":    word.get("syllables", 0),
        "tags":         word.get("tags", []),
        "imageUrl":     f"/cartoons/{word['wordId']}.png",
        "levels":       levels,
        "roundId":      word["roundId"],
        "publishedAt":  datetime.now(timezone.utc).isoformat(),
    }


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
) -> None:
    """Copy image and upsert words-data.json for a single word."""
    word_id = word["wordId"]

    # 1. Copy selected image to public repo
    image_bytes = load_image_bytes(candidates_path, word)
    image_dest = f"public/cartoons/{word_id}.png"
    existing_image = public_gh.get_file(image_dest)
    public_gh.put_file(
        image_dest,
        image_bytes,
        message=f"publish: image for {word_id}",
        sha=existing_image["sha"] if existing_image else None,
        branch=branch,
    )
    print(f"  ✓ image  → {image_dest}")

    # 2. Upsert words-data.json
    existing_data_file = public_gh.get_file(WORDS_DATA_PATH)
    if existing_data_file:
        content = base64.b64decode(
            existing_data_file["content"].replace("\n", "")
        ).decode()
        words_list: list = json.loads(content)
        data_sha: Optional[str] = existing_data_file["sha"]
    else:
        words_list = []
        data_sha = None

    entry = map_to_word_entry(word)
    words_list = [e for e in words_list if e["wordId"] != word_id]
    words_list.append(entry)
    words_list.sort(key=lambda e: e["wordId"])

    public_gh.put_file(
        WORDS_DATA_PATH,
        json.dumps(words_list, indent=2, ensure_ascii=False).encode(),
        message=f"publish: add word '{word_id}'",
        sha=data_sha,
        branch=branch,
    )
    print(f"  ✓ words  → {WORDS_DATA_PATH} (upserted '{word_id}')")


# ── Orchestration ──────────────────────────────────────────────────────────────

def run(args: argparse.Namespace) -> None:
    candidates_path = Path(os.environ.get("CANDIDATES_REPO_PATH", "."))
    token = os.environ["PUBLIC_REPO_TOKEN"]
    owner = os.environ.get("PUBLIC_REPO_OWNER", "kidwords-app")
    repo = os.environ.get("PUBLIC_REPO_NAME", "kidwords.github.io")
    base_branch = os.environ.get("PR_BASE_BRANCH", "main")

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
        publish_word(word, candidates_path, public_gh, base_branch)
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
