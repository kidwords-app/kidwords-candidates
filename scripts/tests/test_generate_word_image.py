import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import ModuleType
from unittest.mock import MagicMock, patch


MODULE_PATH = Path(__file__).resolve().parents[1] / "generate-word-image.py"
spec = importlib.util.spec_from_file_location("generate_word_image", MODULE_PATH)
generate_images = importlib.util.module_from_spec(spec)
google_module = ModuleType("google")
genai_module = ModuleType("genai")
genai_module.Client = MagicMock  # stub for pipeline-order test
google_module.genai = genai_module
sys.modules.setdefault("google", google_module)
sys.modules.setdefault("google.genai", genai_module)
sys.modules[spec.name] = generate_images
spec.loader.exec_module(generate_images)


class FakeUUID:
    def __init__(self, hex_value: str):
        self.hex = hex_value


class GenerateWordImageTests(unittest.TestCase):
    def test_slugify(self):
        self.assertEqual(generate_images.slugify(" Blue  Bird! "), "blue-bird")

    def test_insert_regen_before_output(self):
        base = (
            "Scene line one.\n\n"
            "Hard rules:\n- No text.\n\n"
            "Output: one square-friendly illustration."
        )
        result = generate_images.insert_regen_before_output(base, "warmer colors")
        self.assertIn("Additional guidance:\nwarmer colors", result)
        self.assertTrue(result.index("warmer colors") < result.index("Output:"))
        self.assertTrue(result.endswith("Output: one square-friendly illustration."))

    def test_pipeline_calls_teaching_before_scene_and_image(self):
        call_order: list[str] = []

        def fake_teaching(client, word, entry, model=generate_images.TEXT_MODEL, *, admin_guidance=""):
            call_order.append("teaching")
            return {
                "teaching_scenario": "A child picks up toys before play.",
                "concrete_anchor": "toys",
                "example_core": "She puts toys away first.",
                "avoid": [],
            }

        def fake_level(client, word, level, teaching_scenario, concrete_anchor, example_core, model=generate_images.TEXT_MODEL):
            call_order.append(f"level:{level}")
            return {
                "definition": "d",
                "example": "e",
                "tryIt": "t",
                "speak": "w",
            }

        def fake_scene(client, word, teaching_scenario, concrete_anchor, level_contents, model=generate_images.TEXT_MODEL):
            call_order.append("scene")
            return {
                "visual_concept": "toys",
                "scene_for_artist": "A child placing toys in a bin.",
                "concrete_anchor": "toys",
                "avoid": [],
            }

        def fake_image(client, image_prompt, output_path, model=generate_images.IMAGE_MODEL):
            call_order.append("image")
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(b"PNG")
            return output_path

        with patch.object(generate_images, "_generate_teaching_scenario", side_effect=fake_teaching), patch.object(
            generate_images, "_generate_level_content", side_effect=fake_level
        ), patch.object(generate_images, "_generate_scene_from_level_text", side_effect=fake_scene), patch.object(
            generate_images, "_generate_cartoon_image", side_effect=fake_image
        ), patch.dict(
            os.environ, {"GEMINI_API_KEY": "test-key"}, clear=False
        ):
            out_path = Path("/tmp/test-word-visual/prioritize.png")
            generate_images.run_word_visual_pipeline(
                {"word": "prioritize", "partOfSpeech": "verb", "tags": []},
                ["kindergartener"],
                out_path,
            )

        self.assertEqual(call_order[0], "teaching")
        self.assertTrue(any(c.startswith("level:") for c in call_order))
        scene_idx = call_order.index("scene")
        image_idx = call_order.index("image")
        level_idx = next(i for i, c in enumerate(call_order) if c.startswith("level:"))
        self.assertLess(level_idx, scene_idx)
        self.assertLess(scene_idx, image_idx)

    def test_resolve_regen_subprompt_uses_first_image_prompt(self):
        candidate = {
            "wordId": "respect",
            "images": [
                {"prompt": "First prompt.\n\nOutput: flashcard."},
                {"prompt": "Second prompt.\n\nOutput: flashcard."},
            ],
        }
        out = generate_images.resolve_regen_image_prompt(
            "subprompt", "", "more cheerful", candidate
        )
        self.assertIn("First prompt", out)
        self.assertNotIn("Second prompt", out)
        self.assertIn("more cheerful", out)

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

