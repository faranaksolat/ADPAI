#!/usr/bin/env python3
"""Collect unreviewed Korean label candidates from the public OFF API.

Images are never automatically accepted as ground truth. API/rights metadata
is preserved for manual review. No OCR service or private image upload is used.
"""
import argparse
import hashlib
import json
import re
import time
from pathlib import Path
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

AGENT = "ADPAI-Label-Benchmark/0.1 (https://github.com/faranaksolat/ADPAI)"
FIELDS = "code,product_name,product_name_ko,lang,languages_codes,ingredients_text_ko,allergens_tags,traces_tags,images,selected_images,last_modified_t"
HOSTS = {"world.openfoodfacts.org", "images.openfoodfacts.org"}


def approved_url(url):
    return urlsplit(url).scheme == "https" and urlsplit(url).hostname in HOSTS


class ApprovedRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not approved_url(newurl):
            raise ValueError("Unexpected redirect host or protocol")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def get(url):
    # Exact, documented providers only. Do not follow redirects to arbitrary
    # hosts or use alternate relays when the environment blocks a provider.
    if not approved_url(url):
        raise ValueError("Unexpected data host")
    with build_opener(ApprovedRedirect()).open(Request(url, headers={"User-Agent": AGENT}), timeout=45) as response:
        return response.read()


def candidate(product, language="ko"):
    if language not in {"ko", "en"}:
        raise ValueError("Supported label languages: ko, en")
    if not isinstance(product, dict):
        return None
    code = str(product.get("code", ""))
    if not re.fullmatch(r"\d{8,14}", code):
        return None
    # Match ProductOpener::Products::normalize_code_zeroes/split_code.
    # UPC-12 and zero-prefixed versions must not become separate products.
    significant = code.lstrip("0")
    if len(significant) < 4:
        return None
    padded = significant.zfill(13)
    code = padded[-8:] if len(padded) == 13 and padded.startswith("00000") else padded
    images = product.get("images") or {}
    if not isinstance(images, dict):
        return None
    selected = images.get("ingredients_"+language) or {}
    if not isinstance(selected, dict):
        return None
    imgid = str(selected.get("imgid", ""))
    original = images.get(imgid) or {}
    if not isinstance(original, dict):
        return None
    uploader = original.get("uploader")
    if not imgid.isdigit() or not isinstance(uploader, str) or not uploader.strip():
        return None  # missing author attribution is a review blocker
    folder = "/".join([padded[:3], padded[3:6], padded[6:9], padded[9:]])
    url = f"https://images.openfoodfacts.org/images/products/{folder}/{imgid}.jpg"
    return {"product_id": "off-"+code, "source_url": "https://world.openfoodfacts.org/product/"+code,
            "product_name": product.get("product_name_"+language) or product.get("product_name"),
            "language": language, "panel": "ingredients",
            "image_url": url, "uploader": uploader, "image_id": imgid,
            "bulk_image_url": f"https://openfoodfacts-images.s3.eu-west-3.amazonaws.com/data/{folder}/{imgid}.jpg",
            "reference_hint_UNVERIFIED": product.get("ingredients_text_"+language, ""),
            "allergen_tags_UNVERIFIED": product.get("allergens_tags", []),
            "trace_tags_UNVERIFIED": product.get("traces_tags", []),
            "annotation_status": "unreviewed", "license": "CC-BY-SA-3.0",
            "license_url": "https://creativecommons.org/licenses/by-sa/3.0/",
            "attribution": f"{uploader} / Open Food Facts; CC BY-SA 3.0; {url}",
            "modified_at": product.get("last_modified_t")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="benchmarks/data/off-korean-candidates")
    parser.add_argument("--pages", type=int, default=3)
    parser.add_argument("--limit", type=int, default=40)
    parser.add_argument("--metadata-only", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.pages <= 20 or not 1 <= args.limit <= 200:
        raise SystemExit("Use 1–20 pages and 1–200 candidates")
    root = Path(args.output)
    root.mkdir(parents=True, exist_ok=True)
    if (root/"candidates.jsonl").exists():
        raise SystemExit("Use a new output directory; do not overwrite provenance")
    found, seen = [], set()
    for page in range(1, args.pages+1):
        params = {"countries_tags": "en:south-korea", "page": page, "page_size": 100, "fields": FIELDS}
        payload = get("https://world.openfoodfacts.org/api/v2/search?"+urlencode(params))
        (root/f"api-page-{page}.json").write_bytes(payload)
        for product in json.loads(payload).get("products", []):
            item = candidate(product)
            if not item or item["product_id"] in seen:
                continue
            seen.add(item["product_id"])
            if not args.metadata_only:
                data = get(item["image_url"])
                # Decode before admission, not just trusting a JPEG extension.
                from PIL import Image
                import io
                image = Image.open(io.BytesIO(data))
                image.verify()
                (root/"images").mkdir(exist_ok=True)
                item["path"] = f"images/{item['product_id']}-{item['image_id']}.jpg"
                (root/item["path"]).write_bytes(data)
                item["sha256"] = hashlib.sha256(data).hexdigest()
                time.sleep(.3)
            found.append(item)
            if len(found) >= args.limit:
                break
        if len(found) >= args.limit:
            break
        time.sleep(7)  # public search API: avoid bursts
    (root/"candidates.jsonl").write_text("".join(json.dumps(item, ensure_ascii=False)+"\n" for item in found), encoding="utf8")
    if not found:
        raise SystemExit("No attributable Korean ingredient photos found; no dataset or accuracy claim created.")
    print(f"Collected {len(found)} UNREVIEWED candidates. Manually verify Korean text, rights, panels and allergy contexts before scoring.")


if __name__ == "__main__":
    main()
