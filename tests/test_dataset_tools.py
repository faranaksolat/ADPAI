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

    def test_english_selection_and_normalized_barcode_image_paths(self):
        product = {"code": "123456789012", "images": {"ingredients_en": {"imgid": "4"}, "4": {"uploader": "fixture-user"}}}
        self.assertIsNone(collector.candidate(product))  # not a Korean panel
        result = collector.candidate(product, "en")
        self.assertEqual(result["product_id"], "off-0123456789012")
        self.assertEqual(result["bulk_image_url"], "https://openfoodfacts-images.s3.eu-west-3.amazonaws.com/data/012/345/678/9012/4.jpg")
        product["code"] = "12345678"
        self.assertIn("/000/001/234/5678/4.jpg", collector.candidate(product, "en")["bulk_image_url"])
        product["code"] = "0000012345678"
        self.assertEqual(collector.candidate(product, "en")["product_id"], "off-12345678")
        self.assertIsNone(collector.candidate({"code": "00000000"}, "en"))


if __name__ == "__main__":
    unittest.main()
