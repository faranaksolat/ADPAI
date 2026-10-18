import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("off_collector", Path(__file__).resolve().parent.parent / "benchmarks/collect-off.py")
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class DatasetToolsTests(unittest.TestCase):
    def test_candidate_is_unreviewed_and_attributed(self):
        # Fabricated API fixture, never claimed as a real product.
        product = {"code": "8800000000001", "images": {"ingredients_ko": {"imgid": "2"}, "2": {"uploader": "fixture-user"}}, "ingredients_text_ko": "unverified hint"}
        result = collector.candidate(product)
        self.assertEqual(result["annotation_status"], "unreviewed")
        self.assertIn("fixture-user", result["attribution"])
        self.assertEqual(result["image_url"], "https://images.openfoodfacts.org/images/products/880/000/000/0001/2.jpg")
        self.assertEqual(result["reference_hint_UNVERIFIED"], "unverified hint")
        del product["images"]["2"]["uploader"]
        self.assertIsNone(collector.candidate(product))

    def test_only_documented_https_sources_and_no_code_injection(self):
        for url in ["http://images.openfoodfacts.org/a", "https://example.com/a", "file:///tmp/x", "https://world.openfoodfacts.org.evil.test/a"]:
            self.assertFalse(collector.approved_url(url))
        self.assertTrue(collector.approved_url("https://images.openfoodfacts.org/images/products/a.jpg"))
        self.assertIsNone(collector.candidate({"code": "../../etc/passwd"}))


if __name__ == "__main__":
    unittest.main()
