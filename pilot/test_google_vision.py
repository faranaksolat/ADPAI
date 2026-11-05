import io
import json
import unittest
from urllib.request import Request

from pilot.google_vision import read_google_vision, check_photo

PNG = b"\x89PNG\r\n\x1a\n" + bytes(48)
JPEG = b"\xff\xd8\xff" + bytes(48)


class MockResponse:
    def __init__(self, value):
        self.value = value
    def __enter__(self):
        return io.BytesIO(json.dumps(self.value).encode())
    def __exit__(self, *args):
        return False


class CloudOcrContract(unittest.TestCase):
    def test_photo_type_and_size(self):
        for data in (b"", b"%PDF", b"<svg/>", JPEG + bytes(8 * 1024 * 1024)):
            with self.assertRaises(ValueError):
                check_photo(data)
        check_photo(PNG)
        check_photo(JPEG)

    def test_no_request_without_key(self):
        attempts = []
        def network(*args, **kwargs):
            attempts.append(True)
            raise RuntimeError("should not be called")
        with self.assertRaises(ValueError):
            read_google_vision(PNG, api_key="", open_url=network)
        self.assertEqual(attempts, [])

    def test_image_only_payload_and_unverified_result(self):
        seen = []
        def network(request, timeout):
            self.assertIsInstance(request, Request)
            self.assertEqual(timeout, 25)
            seen.append(json.loads(request.data))
            self.assertEqual(request.get_header("X-goog-api-key"), "TEST_ONLY")
            return MockResponse({"responses": [{"fullTextAnnotation": {
                "text": "밀, 대두 함유\n우유, 계란 혼입가능"
            }}]})
        result = read_google_vision(JPEG, api_key="TEST_ONLY", open_url=network)
        self.assertEqual(result["text"], "밀, 대두 함유\n우유, 계란 혼입가능")
        self.assertFalse(result["full_label_verified"])
        self.assertFalse(result["allergen_absence_verified"])
        self.assertEqual(seen[0]["requests"][0]["features"][0]["type"], "DOCUMENT_TEXT_DETECTION")
        self.assertEqual(set(seen[0]["requests"][0]), {"image", "features"})

    def test_empty_text_is_never_negative_evidence(self):
        result = read_google_vision(PNG, api_key="TEST_ONLY",
                                    open_url=lambda request, timeout:
                                    MockResponse({"responses": [{}]}))
        self.assertEqual(result["text"], "")
        self.assertFalse(result["allergen_absence_verified"])

    def test_provider_error_fails_without_safety_claim(self):
        with self.assertRaisesRegex(RuntimeError, "no result was verified"):
            read_google_vision(PNG, api_key="TEST_ONLY",
                               open_url=lambda request, timeout:
                               MockResponse({"responses": [{"error": {"code": 429}}]}))


if __name__ == "__main__":
    unittest.main()
