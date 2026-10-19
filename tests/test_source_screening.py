import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import gzip
from unittest.mock import patch
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location("source_screen", Path(__file__).resolve().parent.parent / "benchmarks/screen-off.py")
screen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(screen)


def ocr(text, locale):
    return {"responses": [{"textAnnotations": [{"description": text, "locale": locale}]}]}


class SourceScreeningTests(unittest.TestCase):
    def test_source_ocr_cache_is_verified_and_does_not_refetch(self):
        url=screen.bulk.off.candidate({"code":"9000000000001","images":{"ingredients_en":{"imgid":"1"},"1":{"uploader":"fixture"}}},"en")["bulk_image_url"]
        raw=gzip.compress(json.dumps(ocr("INGREDIENTS: water, milk", "en")).encode())
        with tempfile.TemporaryDirectory() as tmp, patch.object(screen, "fetch_provider_bytes", return_value=raw) as fetch:
            first=screen.provider_ocr(url, tmp)
            self.assertEqual(screen.provider_ocr(url, tmp), first)
            self.assertEqual(fetch.call_count, 1)
            next(Path(tmp).glob('*.json.gz')).write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, "integrity"):
                screen.provider_ocr(url, tmp)

    def test_language_and_panel_screen_is_not_a_reference_or_safety_result(self):
        english = screen.screen_text(ocr("INGREDIENTS: WATER, WHEAT FLOUR, SUGAR, SALT", "en"), "en")
        self.assertTrue(english["likely_requested_label"])
        self.assertFalse(english["human_reviewed"])
        self.assertFalse(english["complete_panel_verified"])
        self.assertFalse(screen.screen_text(ocr("Ingredientes: azúcar, aceite, leche", "es"), "en")["likely_requested_label"])
        self.assertFalse(screen.screen_text(ocr("HTI Toys. Reusable modelling foam. WARNING", "en"), "en")["likely_requested_label"])
        self.assertTrue(screen.screen_text(ocr("원 재 료 명: 밀가루, 설탕, 정제수. 밀 함유", "ko"), "ko")["likely_requested_label"])
        self.assertFalse(screen.screen_text(ocr("INGREDIENTS: WATER, CORN EXTRACT, SALT", "en"), "ko")["likely_requested_label"])
        self.assertFalse(screen.screen_text({"responses": []}, "en")["likely_requested_label"])
        self.assertFalse(screen.screen_text(ocr("콜라겐 모이스처 파운데이션 기능성 화장품. 피부 보습 성분 함유", "ko"), "ko")["likely_requested_label"])
        self.assertTrue(screen.screen_text(ocr("원료명 정제수, 이산화탄소, 프로필렌글리콜, 구연산 함유", "ko"), "ko")["likely_requested_label"])

    def test_resume_pins_screening_rules_and_language(self):
        with tempfile.TemporaryDirectory() as tmp:
            screen.pin_screening(tmp, "en")
            screen.pin_screening(tmp, "en")
            with self.assertRaisesRegex(ValueError, "changed"):
                screen.pin_screening(tmp, "ko")

    def test_rejected_candidates_do_not_download_a_photo_and_denials_are_not_relabelled(self):
        calls = []
        fetch = screen.fetcher("en", {}, get_ocr=lambda _: (ocr("Ingredientes: azúcar", "es"), {}), get_image=lambda _: calls.append("image"))
        with self.assertRaises(screen.bulk.CandidateExcluded):
            fetch("fixture")
        self.assertEqual(calls, [])
        def denied(_): raise HTTPError("fixture", 403, "denied", None, None)
        fetch = screen.fetcher("en", {}, get_ocr=denied)
        with self.assertRaises(HTTPError): fetch("fixture")
        def missing(_): raise HTTPError("fixture", 404, "missing", None, None)
        with self.assertRaises(screen.bulk.CandidateExcluded):
            screen.fetcher("en", {}, get_ocr=missing)("fixture")

    def test_screening_exclusion_refills_the_queue_and_keeps_provenance(self):
        with tempfile.TemporaryDirectory() as tmp:
            from PIL import Image
            import io
            root = Path(tmp)
            queue = root/"queue.jsonl"
            rows = [screen.bulk.off.candidate({"code": str(9000000000000+i), "images": {"ingredients_en": {"imgid": "1"}, "1": {"uploader": "fixture"}}}, "en") for i in range(2)]
            queue.write_text(''.join(json.dumps(row)+'\n' for row in rows))
            image = io.BytesIO();Image.new("RGB", (10, 20), "red").save(image, "JPEG")
            def get_ocr(url):
                if "0000/" in url:return ocr("Ingredientes: azúcar", "es"), {"provider_ocr_url": "fixture"}
                return ocr("INGREDIENTS: water, sugar, salt", "en"), {"provider_ocr_url": "fixture"}
            result = screen.bulk.download(queue, root/"data", limit=1, delay=0, workers=2,
                                          fetch=screen.fetcher("en", {}, get_ocr=get_ocr, get_image=lambda _: image.getvalue()))
            self.assertEqual(result["downloaded_unique_images"], 1)
            self.assertEqual(result["excluded_candidates"], 1)
            downloaded = json.loads((root/"data/downloaded.jsonl").read_text())
            self.assertEqual(downloaded["annotation_status"], "unreviewed")
            self.assertFalse(downloaded["source_screening_UNVERIFIED"]["human_reviewed"])


if __name__ == "__main__":
    unittest.main()
