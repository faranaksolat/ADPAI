"""Optional Google Vision OCR benchmark. NOT a food-safety classifier.

Never sends a profile, child information, or a photo without --confirm-send.
The API key is read from a server/terminal environment variable only.
"""
import argparse
import base64
import json
import os
from pathlib import Path
import sys
from urllib.request import Request, urlopen

API_URL = "https://vision.googleapis.com/v1/images:annotate"
MAX_IMAGE_BYTES = 8 * 1024 * 1024


def check_photo(data):
    if not isinstance(data, bytes) or not data or len(data) > MAX_IMAGE_BYTES:
        raise ValueError("Image must be between 1 byte and 8 MiB")
    if not (data.startswith(b"\xff\xd8\xff") or data.startswith(b"\x89PNG\r\n\x1a\n")):
        raise ValueError("Only PNG or JPEG label photographs are accepted")


def read_google_vision(data, *, api_key, open_url=urlopen):
    """Send ONLY the supplied image; return unverified transcription."""
    check_photo(data)
    if not api_key or not api_key.strip():
        raise ValueError("GOOGLE_VISION_API_KEY is required")
    payload = {"requests": [{
        "image": {"content": base64.b64encode(data).decode("ascii")},
        "features": [{"type": "DOCUMENT_TEXT_DETECTION", "maxResults": 1}]
    }]}
    request = Request(API_URL, data=json.dumps(payload).encode("utf-8"),
                      headers={"Content-Type": "application/json",
                               "x-goog-api-key": api_key}, method="POST")
    with open_url(request, timeout=25) as response:
        result = json.load(response)
    responses = result.get("responses")
    if not isinstance(responses, list) or len(responses) != 1:
        raise RuntimeError("OCR service returned an invalid response")
    entry = responses[0]
    if entry.get("error"):
        raise RuntimeError("OCR provider failed; no result was verified")
    document = entry.get("fullTextAnnotation") or {}
    text = document.get("text")
    if not isinstance(text, str):
        text = ""
    return {"provider": "google-vision", "scope": "unverified_ocr_transcript",
            "text": text[:30000], "full_label_verified": False,
            "allergen_absence_verified": False}


def main(argv=None):
    parser = argparse.ArgumentParser(description="One optional paid, consented image OCR test")
    parser.add_argument("--image", required=True)
    parser.add_argument("--confirm-send", action="store_true",
                        help="I consent to sending this photograph to Google Vision for OCR")
    args = parser.parse_args(argv)
    if not args.confirm_send:
        parser.error("Photo will NOT be uploaded unless --confirm-send is supplied")
    image = Path(args.image).read_bytes()
    check_photo(image)
    key = os.environ.get("GOOGLE_VISION_API_KEY", "")
    result = read_google_vision(image, api_key=key)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
