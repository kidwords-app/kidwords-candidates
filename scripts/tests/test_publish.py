"""Tests for scripts/publish.py"""

import base64
import json
import sys
import os
from pathlib import Path
from unittest.mock import MagicMock, call, patch

import pytest

# Make scripts/ importable from this test file
sys.path.insert(0, str(Path(__file__).parent.parent))
from publish import (
    GitHubClient,
    PublishError,
    ValidationError,
    load_approved_words_in_round,
    load_image_bytes,
    load_word_candidate,
    map_to_word_entry,
    publish_word,
    validate_word_candidate,
)

# ── Fixtures ────────────────────────────────────────────────────────────────────

APPROVED_WORD = {
    "wordId": "empathy",
    "word": "empathy",
    "partOfSpeech": "noun",
    "syllables": 3,
    "tags": ["emotions"],
    "roundId": "2026-03-03",
    "status": "approved",
    "images": [
        {
            "imageId": "img_abc",
            "prompt": "two children",
            "model": "gemini",
            "assetPath": "candidates/rounds/2026-03-03/assets/empathy/img_abc.png",
            "createdAt": "2026-03-03T09:00:00Z",
        }
    ],
    "levels": {
        "preK": [
            {"definition": "Def preK 0", "example": "Ex preK 0", "tryIt": "Try preK 0", "model": "chatgpt"},
            {"definition": "Def preK 1", "example": "Ex preK 1", "tryIt": "Try preK 1", "model": "claude"},
        ],
        "K": [
            {"definition": "Def K 0", "example": "Ex K 0", "tryIt": "Try K 0", "model": "chatgpt"},
        ],
        "G1": [
            {"definition": "Def G1 0", "example": "Ex G1 0", "tryIt": "Try G1 0", "model": "chatgpt"},
            {"definition": "Def G1 1", "example": "Ex G1 1", "tryIt": "Try G1 1", "model": "claude"},
        ],
    },
    "selected": {
        "imageId": "img_abc",
        "levels": {
            "preK": {"definition": 1, "example": 0, "tryIt": 0},  # mix-and-match
            "K":    {"definition": 0, "example": 0, "tryIt": 0},
            "G1":   {"definition": 0, "example": 1, "tryIt": 0},
        },
    },
    "subPrompts": {},
    "createdAt": "2026-03-03T00:00:00Z",
    "updatedAt": "2026-03-03T00:00:00Z",
}


# ── validate_word_candidate ─────────────────────────────────────────────────────

class TestValidateWordCandidate:
    def test_passes_for_valid_approved_word(self):
        validate_word_candidate(APPROVED_WORD)  # should not raise

    def test_rejects_non_approved_status(self):
        word = {**APPROVED_WORD, "status": "in_review"}
        with pytest.raises(ValidationError, match="in_review"):
            validate_word_candidate(word)

    def test_rejects_missing_image_selection(self):
        word = {**APPROVED_WORD, "selected": {**APPROVED_WORD["selected"], "imageId": None}}
        with pytest.raises(ValidationError, match="no image selected"):
            validate_word_candidate(word)

    def test_rejects_imageId_not_in_images_array(self):
        word = {**APPROVED_WORD, "selected": {**APPROVED_WORD["selected"], "imageId": "nonexistent"}}
        with pytest.raises(ValidationError, match="not found in images"):
            validate_word_candidate(word)

    def test_allows_partial_level_selection(self):
        # Missing G1 is fine — partial levels are allowed
        selected = {**APPROVED_WORD["selected"]}
        levels = {**selected["levels"]}
        del levels["G1"]
        selected = {**selected, "levels": levels}
        word = {**APPROVED_WORD, "selected": selected}
        validate_word_candidate(word)  # should not raise

    def test_rejects_no_level_selections(self):
        selected = {**APPROVED_WORD["selected"], "levels": {}}
        word = {**APPROVED_WORD, "selected": selected}
        with pytest.raises(ValidationError, match="at least one level"):
            validate_word_candidate(word)

    def test_rejects_out_of_range_field_index(self):
        selected = {
            **APPROVED_WORD["selected"],
            "levels": {
                **APPROVED_WORD["selected"]["levels"],
                "K": {"definition": 99, "example": 0, "tryIt": 0},  # only 1 candidate
            },
        }
        word = {**APPROVED_WORD, "selected": selected}
        with pytest.raises(ValidationError, match="out of range"):
            validate_word_candidate(word)

    def test_rejects_missing_field_in_selection(self):
        selected = {
            **APPROVED_WORD["selected"],
            "levels": {
                **APPROVED_WORD["selected"]["levels"],
                "preK": {"definition": 0, "example": 0},  # missing tryIt
            },
        }
        word = {**APPROVED_WORD, "selected": selected}
        with pytest.raises(ValidationError, match="tryIt"):
            validate_word_candidate(word)


# ── map_to_word_entry ───────────────────────────────────────────────────────────

class TestMapToWordEntry:
    def test_returns_correct_structure(self):
        entry = map_to_word_entry(APPROVED_WORD)
        assert entry["word"]         == "empathy"
        assert entry["partOfSpeech"] == "noun"
        assert entry["syllables"]    == 3
        assert entry["cartoonId"]    == "empathy"
        assert entry["tags"]         == ["emotions"]
        assert set(entry["levels"].keys()) == {"preK", "K", "G1"}
        assert set(entry.keys()) == {"word", "partOfSpeech", "syllables", "tags", "cartoonId", "levels"}

    def test_respects_mix_and_match_selections(self):
        entry = map_to_word_entry(APPROVED_WORD)
        # preK: definition from index 1 (claude), example+tryIt from index 0 (chatgpt)
        assert entry["levels"]["preK"]["definition"] == "Def preK 1"
        assert entry["levels"]["preK"]["example"]    == "Ex preK 0"
        assert entry["levels"]["preK"]["tryIt"]      == "Try preK 0"
        # G1: definition from index 0, example from index 1
        assert entry["levels"]["G1"]["definition"]   == "Def G1 0"
        assert entry["levels"]["G1"]["example"]      == "Ex G1 1"

    def test_each_level_has_required_fields(self):
        entry = map_to_word_entry(APPROVED_WORD)
        for level in ("preK", "K", "G1"):
            assert "definition" in entry["levels"][level]
            assert "example"    in entry["levels"][level]
            assert "tryIt"      in entry["levels"][level]

    def test_omits_unselected_levels(self):
        selected = {**APPROVED_WORD["selected"]}
        levels = {**selected["levels"]}
        del levels["G1"]
        word = {**APPROVED_WORD, "selected": {**selected, "levels": levels}}
        entry = map_to_word_entry(word)
        assert set(entry["levels"].keys()) == {"preK", "K"}
        assert "G1" not in entry["levels"]

    def test_has_no_pipeline_only_fields(self):
        entry = map_to_word_entry(APPROVED_WORD)
        for bad in ("wordId", "imageUrl", "roundId", "publishedAt"):
            assert bad not in entry


# ── load_word_candidate ─────────────────────────────────────────────────────────

class TestLoadWordCandidate:
    def test_loads_existing_json(self, tmp_path):
        word_dir = tmp_path / "candidates" / "rounds" / "2026-03-03" / "words"
        word_dir.mkdir(parents=True)
        (word_dir / "empathy.json").write_text(json.dumps(APPROVED_WORD))

        word = load_word_candidate(tmp_path, "2026-03-03", "empathy")
        assert word["wordId"] == "empathy"

    def test_raises_for_missing_file(self, tmp_path):
        with pytest.raises(PublishError, match="not found"):
            load_word_candidate(tmp_path, "2026-03-03", "nonexistent")


# ── load_approved_words_in_round ────────────────────────────────────────────────

class TestLoadApprovedWordsInRound:
    def test_returns_only_approved_words(self, tmp_path):
        word_dir = tmp_path / "candidates" / "rounds" / "2026-03-03" / "words"
        word_dir.mkdir(parents=True)
        (word_dir / "empathy.json").write_text(json.dumps(APPROVED_WORD))
        pending = {**APPROVED_WORD, "wordId": "resilience", "status": "pending"}
        (word_dir / "resilience.json").write_text(json.dumps(pending))

        words = load_approved_words_in_round(tmp_path, "2026-03-03")
        assert len(words) == 1
        assert words[0]["wordId"] == "empathy"

    def test_raises_for_missing_round_directory(self, tmp_path):
        with pytest.raises(PublishError, match="not found"):
            load_approved_words_in_round(tmp_path, "9999-99-99")


# ── load_image_bytes ────────────────────────────────────────────────────────────

class TestLoadImageBytes:
    def test_returns_image_bytes(self, tmp_path):
        asset_dir = tmp_path / "candidates" / "rounds" / "2026-03-03" / "assets" / "empathy"
        asset_dir.mkdir(parents=True)
        (asset_dir / "img_abc.png").write_bytes(b"\x89PNG\r\nfake")

        data = load_image_bytes(tmp_path, APPROVED_WORD)
        assert data == b"\x89PNG\r\nfake"

    def test_raises_when_image_candidate_missing(self, tmp_path):
        word = {**APPROVED_WORD, "selected": {**APPROVED_WORD["selected"], "imageId": "img_missing"}}
        with pytest.raises(PublishError, match="not found in word JSON"):
            load_image_bytes(tmp_path, word)

    def test_raises_when_asset_file_missing(self, tmp_path):
        # image candidate exists in the JSON but the file is absent
        with pytest.raises(PublishError, match="image file not found"):
            load_image_bytes(tmp_path, APPROVED_WORD)


# ── publish_word (integration) ──────────────────────────────────────────────────

class TestPublishWord:
    def _setup_candidates(self, tmp_path: Path) -> None:
        """Write word JSON + image file to a fake candidates repo."""
        word_dir = tmp_path / "candidates" / "rounds" / "2026-03-03" / "words"
        word_dir.mkdir(parents=True)
        (word_dir / "empathy.json").write_text(json.dumps(APPROVED_WORD))

        asset_dir = tmp_path / "candidates" / "rounds" / "2026-03-03" / "assets" / "empathy"
        asset_dir.mkdir(parents=True)
        (asset_dir / "img_abc.png").write_bytes(b"\x89PNG\r\nfake-image-data")

    def test_calls_put_file_for_image_and_data(self, tmp_path):
        self._setup_candidates(tmp_path)
        mock_gh = MagicMock(spec=GitHubClient)
        mock_gh.get_file.return_value = None  # both files are new

        publish_word(APPROVED_WORD, tmp_path, mock_gh, "publish/test-branch", app_subdir="")

        put_calls = mock_gh.put_file.call_args_list
        paths = [c.args[0] for c in put_calls]
        assert "public/cartoons/empathy.png" in paths
        assert "src/core/words-data.json" in paths

    def test_passes_correct_branch_to_put_file(self, tmp_path):
        self._setup_candidates(tmp_path)
        mock_gh = MagicMock(spec=GitHubClient)
        mock_gh.get_file.return_value = None

        publish_word(APPROVED_WORD, tmp_path, mock_gh, "main", app_subdir="")

        for c in mock_gh.put_file.call_args_list:
            assert c.kwargs.get("branch") == "main"

    def test_preserves_existing_words_in_data_file(self, tmp_path):
        self._setup_candidates(tmp_path)
        existing_word = {"cartoonId": "resilience", "word": "resilience", "partOfSpeech": "noun", "syllables": 4, "tags": [], "levels": {}}
        existing_content = json.dumps([existing_word], indent=2).encode()
        encoded = base64.b64encode(existing_content).decode()

        mock_gh = MagicMock(spec=GitHubClient)
        mock_gh.get_file.side_effect = lambda path: (
            {"content": encoded, "sha": "abc123"}
            if path == "src/core/words-data.json"
            else None
        )

        publish_word(APPROVED_WORD, tmp_path, mock_gh, "publish/test", app_subdir="")

        data_call = next(
            c for c in mock_gh.put_file.call_args_list
            if c.args[0] == "src/core/words-data.json"
        )
        written = json.loads(data_call.args[1].decode())
        ids = [e["cartoonId"] for e in written]
        assert "empathy" in ids
        assert "resilience" in ids  # existing word preserved

    def test_writes_under_app_subdirectory(self, tmp_path):
        self._setup_candidates(tmp_path)
        mock_gh = MagicMock(spec=GitHubClient)
        mock_gh.get_file.return_value = None

        publish_word(APPROVED_WORD, tmp_path, mock_gh, "main", app_subdir="kidwords-web")

        put_paths = [c.args[0] for c in mock_gh.put_file.call_args_list]
        assert "kidwords-web/public/cartoons/empathy.png" in put_paths
        assert "kidwords-web/src/core/words-data.json" in put_paths

    def test_replaces_legacy_row_that_used_wordId_instead_of_cartoonId(self, tmp_path):
        self._setup_candidates(tmp_path)
        legacy = {
            "wordId": "empathy",
            "word": "empathy",
            "partOfSpeech": "noun",
            "syllables": 3,
            "tags": [],
            "imageUrl": "/cartoons/empathy.png",
            "levels": {"preK": {"definition": "legacy", "example": "legacy", "tryIt": "legacy"}},
        }
        existing_content = json.dumps([legacy], indent=2).encode()
        encoded = base64.b64encode(existing_content).decode()

        mock_gh = MagicMock(spec=GitHubClient)
        mock_gh.get_file.side_effect = lambda path: (
            {"content": encoded, "sha": "abc123"}
            if path == "src/core/words-data.json"
            else None
        )

        publish_word(APPROVED_WORD, tmp_path, mock_gh, "publish/test", app_subdir="")

        data_call = next(
            c for c in mock_gh.put_file.call_args_list
            if c.args[0] == "src/core/words-data.json"
        )
        written = json.loads(data_call.args[1].decode())
        assert len(written) == 1
        assert written[0]["cartoonId"] == "empathy"
        assert written[0]["levels"]["preK"]["definition"] != "legacy"

    def test_upserts_word_if_already_exists(self, tmp_path):
        self._setup_candidates(tmp_path)
        old_entry = {**map_to_word_entry(APPROVED_WORD), "levels": {"preK": {"definition": "old", "example": "old", "tryIt": "old"}}}
        existing_content = json.dumps([old_entry], indent=2).encode()
        encoded = base64.b64encode(existing_content).decode()

        mock_gh = MagicMock(spec=GitHubClient)
        mock_gh.get_file.side_effect = lambda path: (
            {"content": encoded, "sha": "abc123"}
            if path == "src/core/words-data.json"
            else None
        )

        publish_word(APPROVED_WORD, tmp_path, mock_gh, "publish/test", app_subdir="")

        data_call = next(
            c for c in mock_gh.put_file.call_args_list
            if c.args[0] == "src/core/words-data.json"
        )
        written = json.loads(data_call.args[1].decode())
        empathy_entries = [e for e in written if e["cartoonId"] == "empathy"]
        assert len(empathy_entries) == 1  # not duplicated
        assert empathy_entries[0]["levels"]["preK"]["definition"] != "old"  # replaced from candidate
