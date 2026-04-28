import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock
from types import ModuleType


MODULE_PATH = Path(__file__).resolve().parents[1] / "generate-images.py"
spec = importlib.util.spec_from_file_location("generate_images", MODULE_PATH)
gen_images = importlib.util.module_from_spec(spec)
google_module = ModuleType("google")
genai_module = ModuleType("genai")
google_module.genai = genai_module
sys.modules.setdefault("google", google_module)
sys.modules.setdefault("google.genai", genai_module)
sys.modules[spec.name] = gen_images
spec.loader.exec_module(gen_images)


class FakeImage:
    def __init__(self):
        self.saved_to = None

    def save(self, path):
        self.saved_to = Path(path)
        self.saved_to.write_bytes(b"fake-image")


class FakeImagePart:
    def __init__(self, image):
        self.inline_data = object()
        self._image = image
        self.text = None

    def as_image(self):
        return self._image


class FakeResponse:
    def __init__(self, parts):
        self.parts = parts


class CartoonPipelineTests(unittest.TestCase):
    def test_build_image_prompt_includes_scene_and_style(self):
        prompt = gen_images._build_image_prompt("A child shares a toy with a friend.")
        self.assertIn("A child shares a toy with a friend.", prompt)
        self.assertIn("pastel", prompt.lower())
        self.assertIn("No text", prompt)

    def test_build_level_text_prompt_includes_shared_scene(self):
        p = gen_images._build_level_text_prompt(
            "share",
            "preschooler",
            "Two children pass a ball.",
            "ball",
        )
        self.assertIn("share", p)
        self.assertIn("preschooler", p)
        self.assertIn("Two children pass a ball.", p)
        self.assertIn("ball", p)

    def test_parse_concept_response(self):
        raw = json.dumps(
            {
                "visual_concept": "sharing a ball",
                "scene_for_artist": "Two kids and a red ball.",
                "concrete_anchor": "ball",
                "avoid": ["treasure hunt"],
            }
        )
        c = gen_images._parse_concept_response(raw)
        self.assertEqual(c["concrete_anchor"], "ball")
        self.assertEqual(c["avoid"], ["treasure hunt"])

    def test_parse_concept_response_rejects_missing_key(self):
        with self.assertRaises(gen_images.InvalidResponseError):
            gen_images._parse_concept_response("{}")

    def test_parse_concept_strips_markdown_fence(self):
        inner = json.dumps(
            {
                "visual_concept": "x",
                "scene_for_artist": "y",
                "concrete_anchor": "z",
                "avoid": [],
            }
        )
        raw = f"Sure!\n```json\n{inner}\n```\n"
        c = gen_images._parse_concept_response(raw)
        self.assertEqual(c["visual_concept"], "x")
        self.assertEqual(c["avoid"], [])

    def test_parse_concept_prose_before_brace(self):
        inner = {
            "visual_concept": "a",
            "scene_for_artist": "b",
            "concrete_anchor": "c",
            "avoid": ["d"],
        }
        raw = "Here you go: " + json.dumps(inner)
        c = gen_images._parse_concept_response(raw)
        self.assertEqual(c["concrete_anchor"], "c")

    def test_parse_concept_omitted_avoid_defaults_empty(self):
        raw = json.dumps(
            {
                "visual_concept": "v",
                "scene_for_artist": "s",
                "concrete_anchor": "c",
            }
        )
        c = gen_images._parse_concept_response(raw)
        self.assertEqual(c["avoid"], [])

    def test_generate_cartoon_image_saves_file(self):
        client = MagicMock()
        fake_image = FakeImage()
        client.models.generate_content.return_value = FakeResponse([FakeImagePart(fake_image)])

        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "cartoon.png"
            result_path = gen_images._generate_cartoon_image(
                client, "Full image prompt text here.", output_path
            )

        self.assertEqual(result_path, output_path)
        self.assertEqual(fake_image.saved_to, output_path)


if __name__ == "__main__":
    unittest.main()
