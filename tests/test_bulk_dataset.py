import gzip
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from PIL import Image

spec = importlib.util.spec_from_file_location("bulk_off", Path(__file__).resolve().parent.parent / "benchmarks/bulk-off.py")
bulk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bulk)


def product(index, languages=("ko", "en")):
    return {"code": str(9000000000000+index), "images": {
        **{"ingredients_"+lang: {"imgid": "2"} for lang in languages},
        "2": {"uploader": "synthetic-api-fixture"}}}


def queue(root, count=3):
    file = root/"queue.jsonl"
    file.write_text("".join(json.dumps(bulk.off.candidate(product(i)))+"\n" for i in range(count)))
    return file


def photo(color):
    image = Image.new("RGB", (20, 30), color)
    target = io.BytesIO()
    image.save(target, "JPEG")
    return target.getvalue()


class BulkDatasetTests(unittest.TestCase):
    def test_official_remote_catalog_is_streamed_and_snapshot_headers_are_kept(self):
        with tempfile.TemporaryDirectory() as tmp:
            response = io.BytesIO(gzip.compress((json.dumps(product(1))+"\n").encode()))
            response.headers = {"ETag": '"fixture-export"', "Last-Modified": "fixture-date"}
            with patch.object(bulk, "build_opener") as opener:
                opener.return_value.open.return_value = response
                report = bulk.prepare(bulk.CATALOG_URL, Path(tmp)/"selected", {"ko": 1, "en": 1})
                self.assertEqual(opener.return_value.open.call_args.args[0].full_url, bulk.CATALOG_URL)
            self.assertEqual(report["catalog_snapshot"]["etag"], '"fixture-export"')
            with self.assertRaisesRegex(ValueError, "official catalog"):
                with bulk.catalog_stream("https://example.com/export.gz"):
                    self.fail("Unapproved remote catalog accepted")

    def test_1000_korean_and_10000_english_candidates_are_not_downloaded_or_reviewed_photos(self):
        # Entirely fabricated API fixtures, not actual food products/images.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            catalog = root/"fixture.jsonl.gz"
            with gzip.open(catalog, "wt", encoding="utf8") as target:
                for i in range(10000):
                    row = product(i, ("ko", "en") if i < 1000 else ("en",))
                    target.write(json.dumps(row)+"\n")
                    if i == 0:
                        target.write(json.dumps(row)+"\n")  # duplicate SKU
            result = bulk.prepare(catalog, root/"selected")
            self.assertEqual(result["selected_candidates"], {"ko": 1000, "en": 10000})
            self.assertEqual(result["downloaded_images"], 0)
            self.assertEqual(result["annotated_images"], 0)
            self.assertEqual(result["stop_reason"], "targets_reached")
            rows = [json.loads(x) for x in (root/"selected/en-candidates.jsonl").read_text().splitlines()]
            self.assertEqual(len({r["product_id"] for r in rows}), 10000)
            self.assertTrue(all(r["annotation_status"] == "unreviewed" for r in rows))
            with self.assertRaises(FileExistsError):
                bulk.prepare(catalog, root/"selected")

    def test_failed_catalog_keeps_partial_provenance_and_never_claims_completion(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            file = root/"broken.jsonl"
            file.write_text(json.dumps(product(1))+"\nnot json\n")
            with self.assertRaisesRegex(ValueError, "line 2"):
                bulk.prepare(file, root/"selected")
            report = json.loads((root/"selected/selection.json").read_text())
            self.assertEqual(report["state"], "incomplete")
            self.assertEqual(report["selected_candidates"], {"ko": 1, "en": 1})

    def test_download_resume_deduplicates_real_bytes_and_rechecks_integrity(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = queue(root)
            calls = []
            def fetch(url):
                calls.append(url)
                return photo("red" if len(calls) < 3 else "blue")
            result = bulk.download(source, root/"downloaded", limit=2, delay=0, fetch=fetch)
            self.assertEqual(result["downloaded_unique_images"], 2)
            self.assertEqual(result["excluded_candidates"], 1)
            self.assertEqual(len(calls), 3)
            bulk.download(source, root/"downloaded", limit=2, delay=0, fetch=lambda _: self.fail("Resume fetched existing image"))
            original = next((root/"downloaded/images").iterdir())
            original.write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "integrity"):
                bulk.download(source, root/"downloaded", limit=3, delay=0, fetch=fetch)

    def test_access_denial_stops_immediately_and_preserves_completed_records(self):
        for status in [403, 429, 503]:
            with self.subTest(status=status), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                source = queue(root)
                calls = []
                def fetch(url):
                    calls.append(url)
                    if len(calls) == 2:
                        raise HTTPError(url, status, "Fixture service failure", None, None)
                    return photo("red")
                with self.assertRaises(HTTPError):
                    bulk.download(source, root/"downloaded", delay=0, fetch=fetch)
                self.assertEqual(len(calls), 2)
                report = json.loads((root/"downloaded/download.json").read_text())
                self.assertEqual(report["state"], "incomplete")
                self.assertEqual(report["downloaded_unique_images"], 1)
                self.assertEqual(report["error_type"], "HTTPError")

    def test_bad_hosts_credentials_paths_and_modified_queues_are_rejected(self):
        prefix = "https://"+bulk.IMAGE_HOST
        for url in ["http://"+bulk.IMAGE_HOST+"/data/900/000/000/0001/2.jpg", prefix+".evil.test/data/900/000/000/0001/2.jpg", prefix+"/data/../x", prefix+"/data/900/000/000/0001/2.jpg?x=1", "https://user@"+bulk.IMAGE_HOST+"/data/900/000/000/0001/2.jpg"]:
            self.assertFalse(bulk.approved_image_url(url))
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = queue(root, 1)
            bulk.download(source, root/"downloaded", limit=1, delay=0, fetch=lambda _: photo("red"))
            source.write_text(source.read_text()+json.dumps(bulk.off.candidate(product(5)))+"\n")
            with self.assertRaisesRegex(ValueError, "Queue changed"):
                bulk.download(source, root/"downloaded", delay=0, fetch=lambda _: self.fail("Network requested"))
            item = bulk.off.candidate(product(9))
            item["bulk_image_url"] = "https://example.com/photo.jpg"
            source.write_text(json.dumps(item)+"\n")
            with self.assertRaisesRegex(ValueError, "provenance"):
                bulk.download(source, root/"unsafe-output", fetch=lambda _: self.fail("Unsafe URL fetched"))
            self.assertFalse((root/"unsafe-output").exists())


if __name__ == "__main__":
    unittest.main()
