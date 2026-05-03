import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import ModuleType
from unittest.mock import MagicMock, patch


MODULE_PATH = Path(__file__).resolve().parents[1] / "generate-images.py"
spec = importlib.util.spec_from_file_location("generate_images", MODULE_PATH)
generate_images = importlib.util.module_from_spec(spec)
google_module = ModuleType("google")
genai_module = ModuleType("genai")
google_module.genai = genai_module
sys.modules.setdefault("google", google_module)
sys.modules.setdefault("google.genai", genai_module)
sys.modules[spec.name] = generate_images
spec.loader.exec_module(generate_images)


class FakeUUID:
    def __init__(self, hex_value: str):
        self.hex = hex_value


class GenerateImagesTests(unittest.TestCase):
    def test_slugify(self):
        self.assertEqual(generate_images.slugify(" Blue  Bird! "), "blue-bird")

    def test_validate_levels_rejects_missing_or_empty(self):
        with self.assertRaises(ValueError) as ctx:
            generate_images.validate_levels([], "test")
        self.assertIn("required field 'levels' is missing or empty", str(ctx.exception))

    def test_validate_levels_rejects_invalid_levels(self):
        with self.assertRaises(ValueError) as ctx:
            generate_images.validate_levels(["K", "G1"], "bird")
        self.assertIn("invalid level(s)", str(ctx.exception))
        self.assertIn("K", str(ctx.exception))
        self.assertIn("preschooler", str(ctx.exception))

    def test_validate_levels_accepts_allowed_levels(self):
        generate_images.validate_levels(["preschooler"], "x")
        generate_images.validate_levels(
            ["preschooler", "kindergartener", "first grader"], "x"
        )

    def _fake_run_word_visual_pipeline(self, entry, levels, output_path):
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"PNG")
        word = entry.get("word", "")
        image_prompt = f"Soft cartoon for {word}"
        by_id = {}
        for lev in levels:
            lid = generate_images.LEVEL_ID_MAP[lev]
            by_id[lid] = {
                "definition": f"{word} means something.",
                "example": f"The {word} is great.",
                "tryIt": f"Can you use {word} in a sentence?",
                "speak": "WORD",
            }
        return output_path, image_prompt, by_id

    def test_process_round_creates_candidates_and_images(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            candidates_repo = root / "candidates-repo"

            batch_path = (
                candidates_repo / "inputs" / "word-batches" / "2026-02-08.json"
            )
            batch_path.parent.mkdir(parents=True, exist_ok=True)
            batch_path.write_text(
                json.dumps(
                    {
                        "words": [
                            {
                                "word": "Blue Bird",
                                "levels": ["kindergartener", "first grader"],
                                "tags": ["animal"],
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )

            fake_ids = [FakeUUID("abc123def4")]
            with patch.object(generate_images.uuid, "uuid4", side_effect=fake_ids), patch.object(
                generate_images, "run_word_visual_pipeline", side_effect=self._fake_run_word_visual_pipeline
            ):
                created = generate_images.process_round(
                    "2026-02-08", candidates_repo
                )

            self.assertEqual(created, 1)

            candidate_path = (
                candidates_repo
                / "candidates"
                / "rounds"
                / "2026-02-08"
                / "words"
                / "blue-bird.json"
            )
            self.assertTrue(candidate_path.exists())

            payload = json.loads(candidate_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["word"], "Blue Bird")
            self.assertEqual(payload["tags"], ["animal"])
            self.assertEqual(len(payload["images"]), 1)
            self.assertIn("shared-abc123def4.png", payload["images"][0]["assetPath"])

            levels = payload["levels"]
            self.assertIn("K", levels)
            self.assertIn("G1", levels)
            self.assertNotIn("kindergartener", levels)
            self.assertNotIn("first grader", levels)
            for level_id in ("K", "G1"):
                self.assertEqual(len(levels[level_id]), 1)
                entry = levels[level_id][0]
                self.assertIn("definition", entry)
                self.assertIn("example", entry)
                self.assertIn("tryIt", entry)
                self.assertIn("speak", entry)
                self.assertEqual(entry["model"], "gemini")


if __name__ == "__main__":
    unittest.main()

