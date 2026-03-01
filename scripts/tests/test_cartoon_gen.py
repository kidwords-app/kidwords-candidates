import importlib.util
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


class FakeTextPart:
    def __init__(self, text):
        self.text = text
        self.inline_data = None


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
    def test_build_text_prompt(self):
        prompt = gen_images._build_text_prompt("rocket", "kid-6")
        self.assertIn("rocket", prompt)
        self.assertIn("kid-6", prompt)
        self.assertIn('"prompts"', prompt)

    def test_build_cartoon_prompt(self):
        prompt = gen_images._build_cartoon_prompt("A rocket ship")
        self.assertIn("A rocket ship", prompt)
        self.assertIn("Do not include any words", prompt)

    def test_generate_text_examples_calls_client(self):
        response_json = '{"prompts":[{"first":"one"},{"second":"two"},{"third":"three"}]}'
        client = MagicMock()
        client.models.generate_content.return_value = FakeResponse([FakeTextPart(response_json)])

        result = gen_images._generate_text_examples(client, "rocket", "kindergartener")

        self.assertEqual(result, ["one", "two", "three"])
        expected_prompt = gen_images._build_text_prompt("rocket", "kindergartener")
        client.models.generate_content.assert_called_once_with(
            model=gen_images.TEXT_MODEL,
            contents=expected_prompt,
        )

    def test_generate_text_examples_budget_error(self):
        client = MagicMock()
        client.models.generate_content.side_effect = Exception("RESOURCE_EXHAUSTED: quota")

        with self.assertRaises(gen_images.BudgetLimitError):
            gen_images._generate_text_examples(client, "rocket", "kindergartener")

    def test_parse_text_response_invalid_json(self):
        with self.assertRaises(gen_images.InvalidResponseError):
            gen_images._parse_text_response("not-json")

    def test_generate_cartoon_image_saves_file(self):
        client = MagicMock()
        fake_image = FakeImage()
        client.models.generate_content.return_value = FakeResponse([FakeImagePart(fake_image)])

        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "cartoon.png"
            result_path = gen_images._generate_cartoon_image(
                client, "A rocket ship", output_path
            )

        self.assertEqual(result_path, output_path)
        self.assertEqual(fake_image.saved_to, output_path)


if __name__ == "__main__":
    unittest.main()
