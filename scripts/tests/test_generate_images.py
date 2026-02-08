import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).resolve().parents[1] / "generate-images.py"
spec = importlib.util.spec_from_file_location("generate_images", MODULE_PATH)
generate_images = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generate_images)


class FakeUUID:
    def __init__(self, hex_value: str):
        self.hex = hex_value


class GenerateImagesTests(unittest.TestCase):
    def test_slugify(self):
        self.assertEqual(generate_images.slugify(" Blue  Bird! "), "blue-bird")

    def test_process_round_creates_candidates_and_images(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            candidates_repo = root / "candidates-repo"
            app_repo = root / "app"
            (app_repo / "scripts").mkdir(parents=True, exist_ok=True)
            (app_repo / "scripts" / "cartoon-gen.py").write_text(
                "print('stub')", encoding="utf-8"
            )

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
                                "levels": ["K", "G1"],
                                "tags": ["animal"],
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )

            fake_ids = [FakeUUID("abc123def4"), FakeUUID("zzz999yyy8")]
            with patch.object(generate_images.uuid, "uuid4", side_effect=fake_ids), patch.object(
                generate_images.subprocess, "run"
            ) as run_mock:
                created = generate_images.process_round(
                    "2026-02-08", candidates_repo, app_repo
                )

            self.assertEqual(created, 2)
            self.assertEqual(run_mock.call_count, 2)

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

