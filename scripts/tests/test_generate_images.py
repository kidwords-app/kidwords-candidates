import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch


MODULE_PATH = Path(__file__).resolve().parents[1] / "generate-images.py"
spec = importlib.util.spec_from_file_location("generate_images", MODULE_PATH)
generate_images = importlib.util.module_from_spec(spec)
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

            fake_ids = [FakeUUID("abc123def4"), FakeUUID("zzz999yyy8")]
            mock_cartoon_gen = MagicMock()
            with patch.object(generate_images.uuid, "uuid4", side_effect=fake_ids), patch.object(
                generate_images, "_get_cartoon_gen", return_value=mock_cartoon_gen
            ):
                created = generate_images.process_round(
                    "2026-02-08", candidates_repo
                )

            self.assertEqual(created, 2)  # created for each level
            self.assertEqual(mock_cartoon_gen.run_pipeline.call_count, 2)  # once per level

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
            self.assertEqual(len(payload["images"]), 2)
            asset_paths = {img["assetPath"] for img in payload["images"]}
            self.assertEqual(len(asset_paths), 2)


if __name__ == "__main__":
    unittest.main()

