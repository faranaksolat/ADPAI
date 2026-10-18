#!/usr/bin/env python3
"""Prepare unreviewed KO/EN ingredient-photo queues from an OFF bulk export.

Uses the provider's documented AWS bulk route, never shop scraping or OCR as
ground truth. Selection streams a local/export catalog; photo downloading is
a separate resumable step.
"""
import argparse
import bz2
from contextlib import contextmanager
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import time
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

spec = importlib.util.spec_from_file_location("off_candidates", Path(__file__).with_name("collect-off.py"))
off = importlib.util.module_from_spec(spec)
spec.loader.exec_module(off)
CATALOG_URL = "https://openfoodfacts-ds.s3.eu-west-3.amazonaws.com/openfoodfacts-products.jsonl.gz"
IMAGE_HOST = "openfoodfacts-images.s3.eu-west-3.amazonaws.com"
MAX_IMAGE_BYTES = 32 * 1024 * 1024


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+"\n", encoding="utf8")


class CatalogRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Unexpected catalog redirect; use the documented export URL")


@contextmanager
def catalog_stream(catalog):
    if catalog == CATALOG_URL:
        request = Request(catalog, headers={"User-Agent": off.AGENT})
        with build_opener(CatalogRedirect()).open(request, timeout=45) as response:
            snapshot = {"etag": response.headers.get("ETag"), "last_modified": response.headers.get("Last-Modified")}
            with gzip.GzipFile(fileobj=response) as source:
                yield source, snapshot
    else:
        if str(catalog).startswith(("https:", "http:")):
            raise ValueError("Only the documented official catalog URL is supported")
        opener = gzip.open if str(catalog).endswith(".gz") else bz2.open if str(catalog).endswith(".bz2") else open
        with opener(catalog, "rb") as source:
            yield source, {}


def prepare(catalog, output, targets=None, max_records=1_000_000):
    targets = targets or {"ko": 1000, "en": 10000}
    if set(targets) != {"ko", "en"} or any(not isinstance(n, int) or not 0 <= n <= 10000 for n in targets.values()) or not any(targets.values()):
        raise ValueError("Use ko/en targets between 0 and 10000, with at least one positive target")
    if max_records < 1:
        raise ValueError("max_records must be positive")
    root = Path(output)
    # Exclusive directory creation keeps old queues/provenance immutable.
    root.mkdir(parents=True, exist_ok=False)
    counts = {lang: 0 for lang in targets}
    seen = {lang: set() for lang in targets}
    catalog_hash = hashlib.sha256()
    report = {"state": "incomplete", "kind": "unreviewed_candidate_queue",
              "targets": targets, "selected_candidates": counts, "records_scanned": 0,
              "downloaded_images": 0, "annotated_images": 0,
              "stop_reason": None, "source": catalog if catalog == CATALOG_URL else str(Path(catalog).resolve()),
              "catalog_documentation": "https://github.com/openfoodfacts/openfoodfacts-server/blob/main/conf/nginx/snippets/off.locations-redirects.include",
              "metadata_license": "ODbL-1.0 / DbCL-1.0", "photos_license": "CC-BY-SA-3.0"}
    write_json(root/"selection.json", report)
    files = {lang: (root/f"{lang}-candidates.jsonl").open("w", encoding="utf8") for lang in targets}
    try:
        with catalog_stream(catalog) as (source, snapshot):
            report["catalog_snapshot"] = snapshot
            for index, line in enumerate(source, 1):
                catalog_hash.update(line)
                report["records_scanned"] = index
                if not line.strip():
                    continue
                try:
                    product = json.loads(line)
                except (ValueError, UnicodeDecodeError) as exc:
                    raise ValueError(f"Invalid catalog JSON at line {index}") from exc
                for lang, target in targets.items():
                    if counts[lang] >= target:
                        continue
                    item = off.candidate(product, lang)
                    if not item or item["product_id"] in seen[lang]:
                        continue
                    seen[lang].add(item["product_id"])
                    item["catalog_line"] = index
                    files[lang].write(json.dumps(item, ensure_ascii=False)+"\n")
                    counts[lang] += 1
                if all(counts[lang] >= n for lang, n in targets.items()):
                    report["stop_reason"] = "targets_reached"
                    break
                if index >= max_records:
                    report["stop_reason"] = "max_records_reached"
                    break
            else:
                report["stop_reason"] = "catalog_exhausted"
        report["state"] = "complete"
    except Exception as exc:
        report["stop_reason"] = "catalog_error"
        report["error_type"] = type(exc).__name__
        raise
    finally:
        for file in files.values():
            file.close()
        # This is deliberately a prefix fingerprint, not a claim to hash an
        # entire multi-GB export when selection stopped early.
        report["scanned_uncompressed_prefix_sha256"] = catalog_hash.hexdigest()
        report["queue_sha256"] = {lang: hashlib.sha256((root/f"{lang}-candidates.jsonl").read_bytes()).hexdigest() for lang in targets}
        write_json(root/"selection.json", report)
    return report


def approved_image_url(url):
    value = urlsplit(url)
    return (value.scheme == "https" and value.hostname == IMAGE_HOST
            and value.netloc == IMAGE_HOST and not value.query and not value.fragment
            and bool(re.fullmatch(r"/data/\d{3}/\d{3}/\d{3}/\d{4,5}/\d+\.jpg", value.path)))


class BulkRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not approved_image_url(newurl):
            raise ValueError("Unexpected image redirect; no alternate hosts are used")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch_image(url):
    if not approved_image_url(url):
        raise ValueError("Only the documented OFF image bucket is supported")
    request = Request(url, headers={"User-Agent": off.AGENT})
    with build_opener(BulkRedirect()).open(request, timeout=45) as response:
        if not response.headers.get("Content-Type", "").lower().startswith("image/"):
            raise ValueError("Non-image response; collection stopped")
        data = response.read(MAX_IMAGE_BYTES+1)
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError("Image exceeds size limit; collection stopped")
    return data


def download(queue, output, limit=1000, delay=1.0, fetch=fetch_image):
    if not 1 <= limit <= 10000 or delay < 0:
        raise ValueError("Invalid download limit/delay")
    queue_bytes = Path(queue).read_bytes()
    queue_hash = hashlib.sha256(queue_bytes).hexdigest()
    items = [json.loads(line) for line in queue_bytes.splitlines() if line.strip()]
    # Validate the entire queue before any request or filesystem mutation.
    keys = set()
    for item in items:
        key = item.get("product_id")
        if not isinstance(key, str) or not re.fullmatch(r"off-\d{8,14}", key) or key in keys:
            raise ValueError("Invalid/duplicate product in queue")
        keys.add(key)
        url = item.get("bulk_image_url", "")
        rebuilt = off.candidate({"code": key[4:], "images": {
            "ingredients_"+item.get("language", ""): {"imgid": item.get("image_id")},
            str(item.get("image_id")): {"uploader": item.get("uploader")}}}, item.get("language"))
        if not rebuilt or rebuilt["product_id"] != key or rebuilt["bulk_image_url"] != url or not approved_image_url(url):
            raise ValueError("Image URL does not match product/image provenance")
        if item.get("license") != "CC-BY-SA-3.0" or not item.get("attribution") or item.get("annotation_status") != "unreviewed":
            raise ValueError("Missing rights/attribution or invalid review state")
    root = Path(output)
    root.mkdir(parents=True, exist_ok=True)
    state_path = root/"download.json"
    old = json.loads(state_path.read_text()) if state_path.exists() else None
    if old and old.get("queue_sha256") != queue_hash:
        raise ValueError("Queue changed; use a new output directory")
    done, hashes, excluded = {}, {}, set()
    manifest = root/"downloaded.jsonl"
    if not old and (manifest.exists() or (root/"excluded.jsonl").exists()):
        raise ValueError("Existing records have no pinned queue provenance")
    if manifest.exists():
        for line in manifest.read_text(encoding="utf8").splitlines():
            item = json.loads(line)
            if item["product_id"] not in keys or item["product_id"] in done or item["sha256"] in hashes:
                raise ValueError("Previously downloaded manifest has invalid/duplicate identities")
            image_path = (root/item["path"]).resolve()
            if not image_path.is_relative_to(root.resolve()) or hashlib.sha256(image_path.read_bytes()).hexdigest() != item["sha256"]:
                raise ValueError("Previously downloaded image failed integrity check")
            done[item["product_id"]] = item
            hashes[item["sha256"]] = item["product_id"]
    exclusions = root/"excluded.jsonl"
    if exclusions.exists():
        excluded = {json.loads(line)["product_id"] for line in exclusions.read_text(encoding="utf8").splitlines()}
    report = {"state": "incomplete", "queue_sha256": queue_hash,
              "downloaded_unique_images": len(done), "excluded_candidates": len(excluded),
              "reviewed_images": 0, "requested_limit": limit, "stop_reason": None}
    write_json(state_path, report)
    (root/"images").mkdir(exist_ok=True)
    try:
        for item in items:
            if len(done) >= limit:
                break
            key = item["product_id"]
            if key in done or key in excluded:
                continue
            try:
                data = fetch(item["bulk_image_url"])
            except HTTPError as exc:
                if exc.code != 404:
                    raise  # 403/429/5xx: stop, never retry or switch hosts
                with exclusions.open("a", encoding="utf8") as target:
                    target.write(json.dumps({"product_id": key, "reason": "not_in_monthly_bucket_404"})+"\n")
                excluded.add(key)
                time.sleep(delay)
                continue
            from PIL import Image
            with Image.open(io.BytesIO(data)) as image:
                width, height = image.size
                image.verify()
            digest = hashlib.sha256(data).hexdigest()
            if digest in hashes:
                with exclusions.open("a", encoding="utf8") as target:
                    target.write(json.dumps({"product_id": key, "reason": "identical_image_bytes", "duplicate_of": hashes[digest]})+"\n")
                excluded.add(key)
            else:
                result = {**item, "path": f"images/{key}-{item['image_id']}.jpg", "sha256": digest,
                          "width": width, "height": height, "download_url": item["bulk_image_url"]}
                temp = root/(result["path"]+".part")
                temp.write_bytes(data)
                temp.replace(root/result["path"])
                with manifest.open("a", encoding="utf8") as target:
                    target.write(json.dumps(result, ensure_ascii=False)+"\n")
                done[key] = result
                hashes[digest] = key
            report["downloaded_unique_images"] = len(done)
            report["excluded_candidates"] = len(excluded)
            write_json(state_path, report)
            time.sleep(delay)
        report["state"] = "complete"
        report["stop_reason"] = "target_reached" if len(done) >= limit else "queue_exhausted"
    except Exception as exc:
        report["stop_reason"] = "request_or_integrity_error"
        report["error_type"] = type(exc).__name__
        raise
    finally:
        report["downloaded_unique_images"] = len(done)
        report["excluded_candidates"] = len(excluded)
        write_json(state_path, report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    select = commands.add_parser("prepare", help="Stream a local JSONL/.gz/.bz2 export or the documented official export URL")
    select.add_argument("--catalog", required=True)
    select.add_argument("--output", required=True)
    select.add_argument("--ko-products", type=int, default=1000)
    select.add_argument("--en-images", type=int, default=10000)
    select.add_argument("--max-records", type=int, default=1_000_000)
    fetch = commands.add_parser("download", help="Use the official public AWS bucket; resume same queue/output")
    fetch.add_argument("--queue", required=True)
    fetch.add_argument("--output", required=True)
    fetch.add_argument("--limit", type=int, default=1000)
    args = parser.parse_args()
    if args.command == "prepare":
        report = prepare(args.catalog, args.output, {"ko": args.ko_products, "en": args.en_images}, args.max_records)
    else:
        report = download(args.queue, args.output, args.limit)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
