import gzip
import importlib.util
import io
import json
from pathlib import Path
import tempfile
from threading import Barrier, Lock
import time
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError
from PIL import Image

spec = importlib.util.spec_from_file_location("bulk_off", Path(__file__).resolve().parent.parent / "benchmarks/bulk-off.py")
bulk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bulk)
review_spec = importlib.util.spec_from_file_location("export_review", Path(__file__).resolve().parent.parent / "benchmarks/export-review.py")
review = importlib.util.module_from_spec(review_spec)
review_spec.loader.exec_module(review)


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
    def test_image_transport_preserves_tls_limits_bytes_and_never_follows_redirects(self):
        session, response = MagicMock(), MagicMock()
        session.get.return_value.__enter__.return_value = response
        response.status_code = 200
        response.headers = {"Content-Type": "image/jpeg"}
        response.raw.read.return_value = photo("red")
        url = bulk.off.candidate(product(1))["bulk_image_url"]
        with patch.object(bulk._http_session, "session", session, create=True):
            self.assertEqual(bulk.fetch_image(url), photo("red"))
            self.assertTrue(session.get.call_args.kwargs["verify"])
            self.assertFalse(session.get.call_args.kwargs["allow_redirects"])
            self.assertEqual(response.raw.read.call_args.args, (bulk.MAX_IMAGE_BYTES+1,))
            response.status_code = 307
            with self.assertRaises(HTTPError) as error:
                bulk.fetch_image(url)
            self.assertEqual(error.exception.code, 307)
            response.status_code = 200
            with patch.object(bulk, "MAX_IMAGE_BYTES", 5):
                with self.assertRaisesRegex(ValueError, "size limit"):
                    bulk.fetch_image(url)

    def test_review_export_does_not_invent_references_and_preserves_annotator_work(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = queue(root, 1)
            bulk.download(source, root/"downloaded", limit=1, delay=0, fetch=lambda _: photo("red"))
            result = review.export_review(root/"downloaded")
            row = json.loads(Path(result["worksheet"]).read_text())
            self.assertEqual(result["reviewed_references"], 0)
            self.assertEqual(row["annotation"]["status"], "unreviewed")
            self.assertIsNone(row["direct_allergens"])
            self.assertIsNone(row["required_abstention"])
            self.assertEqual(row["images"][0]["transcript"], "")
            self.assertEqual(row["split"], "unassigned")
            with self.assertRaises(FileExistsError):
                review.export_review(root/"downloaded")

    def test_review_export_rejects_a_changed_image(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bulk.download(queue(root, 1), root/"downloaded", limit=1, delay=0, fetch=lambda _: photo("red"))
            next((root/"downloaded/images").iterdir()).write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "integrity"):
                review.export_review(root/"downloaded")

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

    def test_remote_prefilter_keeps_escaped_keys_and_counts_unrelated_records(self):
        with tempfile.TemporaryDirectory() as tmp:
            row = json.dumps(product(1)).replace('ingredients_ko', r'ingredients_\u006b\u006f')
            response = io.BytesIO(gzip.compress(('{}\n'+row+'\n').encode()))
            response.headers = {}
            with patch.object(bulk, "build_opener") as opener:
                opener.return_value.open.return_value = response
                report = bulk.prepare(bulk.CATALOG_URL, Path(tmp)/"selected", {"ko": 1, "en": 0})
            self.assertEqual(report["records_scanned"], 2)
            self.assertEqual(report["selected_candidates"], {"ko": 1, "en": 0})

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

    def test_parallel_requests_are_bounded_stop_at_limit_and_keep_queue_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = queue(root, 10)
            lock, barrier = Lock(), Barrier(3)
            active, peak, calls = [0], [0], []
            def fetch(url):
                index = int(url.split('/')[-2])
                with lock:
                    calls.append(index)
                    active[0] += 1
                    peak[0] = max(peak[0], active[0])
                try:
                    if index < 3:
                        barrier.wait(timeout=3)
                    time.sleep(.01)
                    return photo((index*30, 50, 90))
                finally:
                    with lock:
                        active[0] -= 1
            report = bulk.download(source, root/"downloaded", limit=5, delay=0, workers=3, fetch=fetch)
            self.assertEqual(report["downloaded_unique_images"], 5)
            self.assertEqual(len(calls), 5)
            self.assertEqual(peak[0], 3)
            rows = [json.loads(line) for line in (root/"downloaded/downloaded.jsonl").read_text().splitlines()]
            self.assertEqual([row["product_id"] for row in rows], [bulk.off.candidate(product(i))["product_id"] for i in range(5)])

    def test_parallel_failure_does_not_dispatch_another_wave(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = queue(root, 10)
            barrier, calls = Barrier(3), []
            def fetch(url):
                index = int(url.split('/')[-2])
                calls.append(index)
                barrier.wait(timeout=3)
                if index == 0:
                    raise HTTPError(url, 429, "Fixture limit", None, None)
                time.sleep(.01)
                return photo((index*30, 50, 90))
            with self.assertRaises(HTTPError):
                bulk.download(source, root/"downloaded", limit=10, delay=0, workers=3, fetch=fetch)
            self.assertEqual(sorted(calls), [0, 1, 2])
            self.assertEqual(json.loads((root/"downloaded/download.json").read_text())["state"], "incomplete")

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
