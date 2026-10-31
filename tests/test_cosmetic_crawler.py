"""Synthetic transport/schema fixtures only; NOT real cosmetic label evidence."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from PIL import Image

spec = importlib.util.spec_from_file_location("cosmetic_crawler", Path(__file__).resolve().parent.parent / "benchmarks/crawl-cosmetics.py")
crawler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(crawler)


def photo(color="red", size=(250, 320), **kwargs):
    out = io.BytesIO()
    Image.new("RGB", size, color).save(out, "PNG", **kwargs)
    return out.getvalue()


def obf(code="8800000000011", name="AUTHORED SCHEMA FIXTURE, NOT A PRODUCT"):
    return {"code": code, "product_name": name, "brands": "COSRX",
            "ingredients_text_en": "UNREVIEWED PROVIDER TEXT",
            "images": {"ingredients_ko": {"imgid": "2"},
                       "2": {"uploader": "fixture_author"}}}


def shop(handle="schema-fixture", name="AUTHORED SCHEMA FIXTURE, NOT A PRODUCT", url=None, alt=""):
    return {"handle": handle, "title": name, "vendor": "COSRX", "images": [
        {"src": url or "https://cdn.shopify.com/fixture.png", "alt": alt}]}


class FakeClient:
    def __init__(self, hosts, root, **kwargs):
        self.hosts, self.root, self.requests = hosts, root, 0
        self.catalogues, self.photos = [], {}

    def json(self, url):
        self.requests += 1
        value = self.catalogues.pop(0)
        if isinstance(value, Exception):
            raise value
        return value

    def fetch(self, url, limit=None):
        self.requests += 1
        value = self.photos[url]
        if isinstance(value, Exception):
            raise value
        return value, "image/png"


class Response(io.BytesIO):
    def __init__(self, data, mime="text/plain", status=200):
        super().__init__(data)
        self.status, self.headers = status, {"Content-Type": mime}


class SequenceOpener:
    def __init__(self, responses):
        self.responses, self.urls, self.requests = list(responses), [], []

    def open(self, request, timeout):
        self.urls.append(request.full_url)
        self.requests.append(request)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class CosmeticCrawlerTests(unittest.TestCase):
    def setUp(self):
        self.known = {crawler.normalized(x) for x in crawler.BRANDS}

    def test_korean_country_of_sale_and_880_barcode_alone_do_not_prove_korean_product(self):
        product = obf()
        product.update(brands="Foreign fixture", countries_tags=["en:south-korea"])
        self.assertIsNone(crawler.obf_candidate(product, self.known))
        product["manufacturing_places_tags"] = ["en:south-korea"]
        row = crawler.obf_candidate(product, self.known)
        self.assertEqual(row["korean_connection_hint"]["kind"], "provider_manufacturing_place_UNVERIFIED")

    def test_obf_requires_attribution_and_preserves_unverified_source_text(self):
        product = obf()
        row = crawler.obf_candidate(product, self.known)
        self.assertEqual(row["images"][0]["uploader"], "fixture_author")
        self.assertIn("/880/000/000/0011/2.jpg", row["images"][0]["url"])
        self.assertEqual(row["reference_hint_UNVERIFIED"]["ingredients_text_en"], "UNREVIEWED PROVIDER TEXT")
        self.assertFalse(row["redistribution_reviewed"])
        product["images"]["2"] = {}
        self.assertIsNone(crawler.obf_candidate(product, self.known))

    def test_same_obf_original_under_two_languages_is_one_photo(self):
        product = obf()
        product["images"]["ingredients_en"] = {"imgid": "2"}
        self.assertEqual(len(crawler.obf_candidate(product, self.known)["images"]), 1)

    def test_selected_obf_url_uses_only_explicit_provider_image_origin(self):
        product = obf()
        product["selected_images"] = {"ingredients": {"display": {"ko":
            "https://images.openfoodfacts.org/images/products/880/000/000/0011/ingredients_ko.4.400.jpg"}}}
        self.assertEqual(crawler.obf_candidate(product, self.known)["images"][0]["url"],
            "https://images.openfoodfacts.org/images/products/880/000/000/0011/2.jpg")

    def test_shopify_filters_other_vendors_and_prioritizes_hints_without_certifying_them(self):
        product = shop()
        product["images"].append({"src": "https://cdn.shopify.com/ingredients-fixture.png", "alt": "전성분"})
        row = crawler.shopify_candidate(product, "cosrx", True)
        self.assertEqual(len(row["images"]), 1)
        self.assertIn("UNVERIFIED", row["images"][0]["panel_hint"])
        product["vendor"] = "Different shop item"
        self.assertIsNone(crawler.shopify_candidate(product, "cosrx", False))

    def test_html_product_jsonld_and_lazy_ingredient_image_without_executing_scripts(self):
        raw = b'''<script type="application/ld+json">{"@graph":[{"@type":"Product","name":"Fixture","brand":{"name":"COSRX"},"image":"/front.png"}]}</script>
        <img data-src="/ingredients.png" alt="ingredients"><script>throw new Error("never execute");</script>'''
        rows = list(crawler.html_candidates(raw, "https://www.cosrx.com/products/fixture", self.known, True))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["images"][0]["url"], "https://www.cosrx.com/ingredients.png")
        self.assertIsNone(rows[0]["source_license_claim_UNVERIFIED"])

    def test_url_checks_reject_local_credentials_non_https_ports_and_lookalike_is_not_approved(self):
        for url in ["http://www.cosrx.com/a", "https://127.0.0.1/a", "https://localhost/a",
                    "https://host.local/a", "https://user:secret@www.cosrx.com/a", "https://www.cosrx.com:8443/a"]:
            with self.assertRaises(ValueError):
                crawler.safe_url(url)
        with tempfile.TemporaryDirectory() as tmp:
            client = crawler.PublicClient({"www.cosrx.com"}, tmp, opener=SequenceOpener([]))
            with self.assertRaises(crawler.SourceBlocked):
                client.fetch("https://www.cosrx.com.evil.example/a")
            self.assertEqual(client.requests, 0)

    def test_robots_disallow_never_fetches_catalogue_or_retries(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp)/"snapshots").mkdir()
            opener = SequenceOpener([Response(b"User-agent: *\nDisallow: /products.json\n")])
            client = crawler.PublicClient({"www.cosrx.com"}, tmp, delay=0, opener=opener)
            with self.assertRaises(crawler.SourceBlocked):
                client.fetch("https://www.cosrx.com/products.json")
            with self.assertRaises(crawler.SourceBlocked):
                client.fetch("https://www.cosrx.com/products.json")
            self.assertEqual(opener.urls, ["https://www.cosrx.com/robots.txt"])

    def test_html_challenge_in_place_of_robots_is_not_treated_as_permission(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp)/"snapshots").mkdir()
            opener = SequenceOpener([Response(b"<html>challenge</html>", "text/html")])
            client = crawler.PublicClient({"www.cosrx.com"}, tmp, delay=0, opener=opener)
            with self.assertRaises(crawler.SourceBlocked):
                client.fetch("https://www.cosrx.com/products.json")
            self.assertEqual(len(opener.urls), 1)

    def test_proxy_denial_at_robots_stops_host_without_requesting_products(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp)/"snapshots").mkdir()
            error = HTTPError("https://www.cosrx.com/robots.txt", 403, "fixture denied", {}, None)
            opener = SequenceOpener([error])
            client = crawler.PublicClient({"www.cosrx.com"}, tmp, delay=0, opener=opener)
            with self.assertRaises(HTTPError):
                client.fetch("https://www.cosrx.com/products.json")
            with self.assertRaises(crawler.SourceBlocked):
                client.fetch("https://www.cosrx.com/products.json")
            self.assertEqual(len(opener.urls), 1)

    def test_robots_404_is_recorded_and_request_budget_is_enforced(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp)/"snapshots").mkdir()
            error = HTTPError("https://www.cosrx.com/robots.txt", 404, "fixture absent", {}, None)
            opener = SequenceOpener([error, Response(b'{"products":[]}', "application/json")])
            client = crawler.PublicClient({"www.cosrx.com"}, tmp, delay=0, max_requests=2, opener=opener)
            self.assertEqual(client.json("https://www.cosrx.com/products.json"), {"products": []})
            with self.assertRaises(crawler.SourceBlocked):
                client.fetch("https://www.cosrx.com/another-page")
            self.assertEqual(client.requests, 2)
            log = [json.loads(x) for x in (Path(tmp)/"requests.jsonl").read_text().splitlines()]
            self.assertEqual([x["status"] for x in log], [404, 200])
            self.assertEqual(opener.requests[-1].get_header("Accept-encoding"), "identity")

    def test_redirect_is_not_followed_and_too_large_reply_does_not_enter_dataset(self):
        with self.assertRaises(crawler.SourceBlocked):
            crawler.NoRedirect().redirect_request(None, None, 302, "", {}, "https://unexpected.example/a")
        with tempfile.TemporaryDirectory() as tmp:
            opener = SequenceOpener([Response(b"too large")])
            client = crawler.PublicClient({"www.cosrx.com"}, tmp, delay=0, opener=opener)
            with self.assertRaises(crawler.SourceBlocked):
                client.raw("https://www.cosrx.com/image", 3)
            self.assertEqual(client.requests, 1)

    def test_decoding_rejects_fake_images_thumbnails_and_excessive_pixel_count(self):
        with self.assertRaises(Exception):
            crawler.image_info(b"<html>not an image</html>")
        with self.assertRaises(ValueError):
            crawler.image_info(photo(size=(20, 30)))
        with patch.object(crawler, "MAX_PIXELS", 1_000):
            with self.assertRaises(Exception):
                crawler.image_info(photo())

    def run_collection(self, tmp, products, photos, **overrides):
        args = crawler.arguments(["--output", str(Path(tmp)/"new"), "--source", "cosrx", "--pages", "1"])
        for key, value in overrides.items():
            setattr(args, key, value)
        def factory(*a, **kw):
            client = FakeClient(*a, **kw)
            client.catalogues = [{"products": products}]
            client.photos = photos
            return client
        with contextlib.redirect_stdout(io.StringIO()):
            return crawler.crawl(args, factory)

    def test_unique_original_bytes_manifest_and_empty_reference_worksheet_are_preserved(self):
        data = photo()
        with tempfile.TemporaryDirectory() as tmp:
            report = self.run_collection(tmp, [shop()], {"https://cdn.shopify.com/fixture.png": data}, limit=1)
            root = Path(tmp)/"new"
            row = json.loads((root/"products-UNREVIEWED.jsonl").read_text())
            review = json.loads((root/"review-UNREVIEWED.jsonl").read_text())
            self.assertEqual((root/row["images"][0]["path"]).read_bytes(), data)
            self.assertEqual(report["downloaded_products"], 1)
            self.assertEqual(report["human_verified_ingredient_panels"], 0)
            self.assertFalse(report["benchmark_ready"])
            self.assertTrue(report["target_reached"])
            self.assertEqual(review["images"][0]["transcript"], "")
            self.assertIsNone(review["images"][0]["complete_panel"])
            self.assertEqual(review["reviewers"], [])
            self.assertFalse(row["complete_label_verified"])
            self.assertFalse(row["clinical_allergy_assessment"])
            with self.assertRaises(FileExistsError):
                crawler.crawl(crawler.arguments(["--output", str(root)]))

    def test_duplicate_product_and_different_file_with_same_pixels_are_not_counted_twice(self):
        data = photo()
        # Valid second encoding with the exact same pixels, not a second real photograph.
        other = photo(compress_level=0)
        self.assertNotEqual(data, other)
        products = [shop(), shop(handle="same-name"), shop(handle="second", name="Fixture 2", url="https://cdn.shopify.com/other.png")]
        with tempfile.TemporaryDirectory() as tmp:
            report = self.run_collection(tmp, products, {"https://cdn.shopify.com/fixture.png": data,
                                                        "https://cdn.shopify.com/other.png": other})
            self.assertEqual(report["downloaded_products"], 1)
            self.assertEqual(report["downloaded_original_images"], 1)
            self.assertFalse(report["target_reached"])
            self.assertEqual({x["reason"] for x in report["exclusions"]}, {"duplicate product identity", "duplicate image"})

    def test_later_failure_retains_previously_downloaded_evidence_and_reports_shortfall(self):
        products = [shop(), shop(handle="second", name="Fixture 2", url="https://cdn.shopify.com/missing.png")]
        with tempfile.TemporaryDirectory() as tmp:
            report = self.run_collection(tmp, products, {"https://cdn.shopify.com/fixture.png": photo(),
                "https://cdn.shopify.com/missing.png": OSError("fixture failure")})
            self.assertEqual(report["downloaded_products"], 1)
            self.assertEqual(report["status"], "incomplete")
            self.assertTrue(report["errors"])
            self.assertTrue((Path(tmp)/"new/products-UNREVIEWED.jsonl").exists())

    def test_one_product_with_multiple_photos_counts_as_one_product(self):
        product = shop()
        product["images"].append({"src": "https://cdn.shopify.com/ingredients.png", "alt": "Ingredients"})
        with tempfile.TemporaryDirectory() as tmp:
            report = self.run_collection(tmp, [product], {"https://cdn.shopify.com/fixture.png": photo(),
                "https://cdn.shopify.com/ingredients.png": photo("blue")})
            self.assertEqual(report["downloaded_products"], 1)
            self.assertEqual(report["downloaded_original_images"], 2)
            self.assertEqual(report["products_with_ingredient_hints_UNVERIFIED"], 1)
            self.assertEqual(report["human_verified_ingredient_panels"], 0)

    def test_interrupt_during_second_photo_preserves_first_photo_and_its_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root/"images").mkdir()
            args = crawler.arguments(["--output", tmp, "--source", "cosrx"])
            client = FakeClient(set(), root)
            client.photos = {"https://cdn.shopify.com/fixture.png": photo()}
            original_fetch = client.fetch
            def interrupt_second(url, limit):
                if url.endswith("interrupt.png"):
                    raise KeyboardInterrupt
                return original_fetch(url, limit)
            client.fetch = interrupt_second
            collection = crawler.Collection(root, args, client)
            product = shop()
            product["images"].append({"src": "https://cdn.shopify.com/interrupt.png", "alt": ""})
            with self.assertRaises(KeyboardInterrupt), contextlib.redirect_stdout(io.StringIO()):
                collection.admit(crawler.shopify_candidate(product, "cosrx", False))
            self.assertEqual(collection.report["downloaded_products"], 1)
            row = json.loads((root/"products-UNREVIEWED.jsonl").read_text())
            self.assertEqual(len(row["images"]), 1)
            self.assertEqual((root/row["images"][0]["path"]).read_bytes(), photo())

    def test_failed_catalogue_produces_zero_count_report_and_no_fabricated_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = crawler.arguments(["--output", str(Path(tmp)/"new"), "--source", "cosrx"])
            def factory(*a, **kw):
                client = FakeClient(*a, **kw)
                client.catalogues = [crawler.SourceBlocked("fixture access denial")]
                return client
            report = crawler.crawl(args, factory)
            self.assertEqual(report["downloaded_products"], 0)
            self.assertEqual(report["status"], "incomplete")
            self.assertEqual(report["source_runs"][0]["status"], "blocked_or_failed")
            self.assertFalse((Path(tmp)/"new/products-UNREVIEWED.jsonl").exists())

    def test_product_budget_stops_before_downloading_more_products(self):
        products = [shop(), shop(handle="second", name="Fixture 2", url="https://cdn.shopify.com/second.png")]
        with tempfile.TemporaryDirectory() as tmp:
            report = self.run_collection(tmp, products, {"https://cdn.shopify.com/fixture.png": photo()}, limit=1)
            self.assertEqual(report["downloaded_products"], 1)
            self.assertEqual(report["source_runs"][0]["eligible_candidates"], 1)
            self.assertFalse(report["errors"])

    def test_full_transport_catalogue_image_and_gallery_path_offline(self):
        data = photo()
        opener = SequenceOpener([
            Response(b"User-agent: *\nDisallow:\n"),
            Response(json.dumps({"products": [shop()]}).encode(), "application/json"),
            Response(b"User-agent: *\nDisallow:\n"),
            Response(data, "image/png")])
        with tempfile.TemporaryDirectory() as tmp:
            args = crawler.arguments(["--output", str(Path(tmp)/"new"), "--source", "cosrx", "--limit", "1"])
            def factory(*a, **kw):
                return crawler.PublicClient(*a, **kw, opener=opener)
            with patch.object(crawler.time, "sleep"), contextlib.redirect_stdout(io.StringIO()):
                report = crawler.crawl(args, factory)
            self.assertEqual(report["downloaded_products"], 1)
            self.assertEqual(report["requests"], 4)
            self.assertFalse(report["benchmark_ready"])
            root = Path(tmp)/"new"
            row = json.loads((root/"products-UNREVIEWED.jsonl").read_text())
            self.assertEqual((root/row["images"][0]["path"]).read_bytes(), data)
            self.assertIn(row["images"][0]["path"], (root/"index.html").read_text())
            self.assertEqual(len(list((root/"snapshots").iterdir())), 3)


if __name__ == "__main__":
    unittest.main()
