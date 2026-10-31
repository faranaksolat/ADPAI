#!/usr/bin/env python3
"""Collect UNREVIEWED Korean cosmetic product-photo candidates, never references.

Public ProductOpener API, public Shopify catalogues, and optional product URLs.
No browser automation, accounts, proxy switching, OCR, inference or training.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import html
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
import sys
import time
import unicodedata
from urllib.error import HTTPError
from urllib.parse import urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from urllib.robotparser import RobotFileParser

AGENT = "ADPAI-Cosmetic-Crawler/0.1 (https://github.com/faranaksolat/ADPAI)"
BOT = "ADPAI-Cosmetic-Crawler"
VERSION = "0.1.0"
STORES = {
    "cosrx": ("https://www.cosrx.com", "COSRX"),
    "joseon": ("https://beautyofjoseon.com", "Beauty of Joseon"),
    "roundlab": ("https://roundlab.com", "Round Lab"),
}
BRANDS = ["COSRX", "Beauty of Joseon", "Round Lab", "Innisfree", "Etude",
          "Etude House", "Laneige", "Some By Mi", "Anua", "SKIN1004", "Isntree",
          "Torriden", "Dr. Jart+", "Missha", "Skinfood", "Aestura", "Illiyoon",
          "Pyunkang Yul", "Benton", "Purito", "Haruharu Wonder", "Tocobo"]
OBF = "https://world.openbeautyfacts.org"
OBF_IMAGES = {"images.openbeautyfacts.org", "images.openfoodfacts.org", "static.openbeautyfacts.org"}
FIELDS = ",".join(["code", "product_name", "product_name_ko", "brands", "brands_tags",
                   "manufacturing_places", "manufacturing_places_tags", "quantity", "images",
                   "selected_images", "ingredients_text_en", "ingredients_text_ko", "last_modified_t"])
MAX_METADATA = 4 * 1024 * 1024
MAX_IMAGE = 24 * 1024 * 1024
MAX_PIXELS = 40_000_000


def normalized(value):
    return re.sub(r"[^\w가-힣]", "", unicodedata.normalize("NFKC", str(value)).casefold())


def ingredient_hint(value):
    return bool(re.search(r"\bingredients?\b|전성분|성분표", str(value), re.I))


def safe_url(url):
    u = urlsplit(url)
    if (u.scheme != "https" or not u.hostname or u.username or u.password
            or u.port not in (None, 443) or u.fragment or "\\" in url
            or any(ord(c) < 33 for c in url)):
        raise ValueError("Use public HTTPS URLs without credentials, fragments or custom ports")
    host = u.hostname.lower()
    if (not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", host) or "." not in host
            or host.endswith((".localhost", ".local", ".internal", ".invalid"))
            or all(c.isdigit() or c == "." for c in host)):
        raise ValueError("Only public DNS hostnames are supported")
    return u


def clean_url(value, base):
    url = urljoin(base, str(value).strip())
    u = safe_url(url)
    return urlunsplit((u.scheme, u.netloc, u.path, u.query, ""))


class SourceBlocked(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise SourceBlocked("Redirect not followed: inspect and explicitly configure canonical source")


class PublicClient:
    """Single-threaded, bounded HTTPS transport with robots checks on every host."""
    def __init__(self, hosts, root, delay=1.0, max_requests=300, opener=None):
        self.hosts, self.root = set(hosts), Path(root)
        self.delay, self.max_requests = delay, max_requests
        self.opener = opener or build_opener(NoRedirect())
        self.requests, self.next_request = 0, 0.0
        self.robots, self.blocked = {}, set()
        self.log = self.root / "requests.jsonl"

    def raw(self, url, limit):
        host = safe_url(url).hostname
        if host not in self.hosts or host in self.blocked:
            raise SourceBlocked("Host not explicitly allowed or already blocked: " + host)
        if self.requests >= self.max_requests:
            raise SourceBlocked("Global request budget exhausted")
        time.sleep(max(0, self.next_request - time.monotonic()))
        self.requests += 1
        self.next_request = time.monotonic() + self.delay
        record = {"url": url, "requested_utc": utc(), "request_number": self.requests}
        try:
            with self.opener.open(Request(url, headers={"User-Agent": AGENT,
                    "Accept-Encoding": "identity"}), timeout=30) as response:
                record["status"] = response.status
                if response.status != 200:
                    raise SourceBlocked("Unexpected response status: " + str(response.status))
                if response.headers.get("Content-Encoding", "identity").lower() not in ("identity", ""):
                    raise SourceBlocked("Unexpected compressed HTTP response")
                declared = response.headers.get("Content-Length")
                if declared and int(declared) > limit:
                    raise SourceBlocked("Response exceeds byte limit")
                data = response.read(limit + 1)
                if len(data) > limit:
                    raise SourceBlocked("Response exceeds byte limit")
                record.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
                return data, response.headers.get("Content-Type", "")
        except HTTPError as exc:
            record.update(status=exc.code, error_type=type(exc).__name__)
            if exc.code not in (404, 410):
                self.blocked.add(host)
            raise
        except Exception as exc:
            record.update(error_type=type(exc).__name__, error=str(exc))
            self.blocked.add(host)
            raise
        finally:
            with self.log.open("a", encoding="utf8") as file:
                file.write(json.dumps(record, ensure_ascii=False) + "\n")

    def fetch(self, url, limit=MAX_METADATA):
        u = safe_url(url)
        if u.hostname not in self.hosts or u.hostname in self.blocked:
            raise SourceBlocked("Host not explicitly allowed or already blocked: " + u.hostname)
        origin = urlunsplit((u.scheme, u.netloc, "", "", ""))
        if origin not in self.robots:
            robots_url = origin + "/robots.txt"
            rules = RobotFileParser(robots_url)
            try:
                raw, mime = self.raw(robots_url, 512_000)
                if not mime.lower().startswith("text/plain"):
                    self.blocked.add(u.hostname)
                    raise SourceBlocked("robots.txt did not return plain text; access remains unconfirmed")
                rules.parse(raw.decode("utf-8-sig", "replace").splitlines())
                (self.root / "snapshots" / (hashlib.sha256(robots_url.encode()).hexdigest()+".robots.txt")).write_bytes(raw)
            except HTTPError as exc:
                if exc.code not in (404, 410):
                    raise
                rules.parse([])  # RFC 9309 unavailable robots; never an access-denial fallback.
            self.robots[origin] = rules
        rules = self.robots[origin]
        if not rules.can_fetch(BOT, url):
            self.blocked.add(u.hostname)
            raise SourceBlocked("robots.txt disallows this crawler at " + url)
        crawl_delay = rules.crawl_delay(BOT) or 0
        rate = rules.request_rate(BOT)
        requested_delay = max(self.delay, crawl_delay, rate.seconds/rate.requests if rate else 0)
        if u.hostname == "world.openbeautyfacts.org" and u.path.startswith("/api/v2/search"):
            requested_delay = max(requested_delay, 7.0)  # public ProductOpener search rate.
        if requested_delay > 60:
            self.blocked.add(u.hostname)
            raise SourceBlocked("Required crawl delay exceeds bounded runtime; schedule manually")
        self.next_request = max(self.next_request, time.monotonic() + max(0, requested_delay-self.delay))
        result = self.raw(url, limit)
        self.next_request = max(self.next_request, time.monotonic() + requested_delay)
        return result

    def json(self, url):
        raw, mime = self.fetch(url)
        if "json" not in mime.lower():
            raise SourceBlocked("Expected JSON, received " + mime)
        (self.root / "snapshots" / (hashlib.sha256(url.encode()).hexdigest()+".json")).write_bytes(raw)
        return json.loads(raw)


def utc():
    return datetime.now(timezone.utc).isoformat()


def korean_basis(product, known_brands):
    names = [x.strip() for x in str(product.get("brands", "")).split(",")]
    names += [str(x).split(":")[-1] for x in product.get("brands_tags", [])]
    matched = [x for x in names if normalized(x) in known_brands]
    if matched:
        return {"kind": "brand_name_match_UNVERIFIED", "matched_names": matched}
    places = [str(product.get("manufacturing_places", ""))] + product.get("manufacturing_places_tags", [])
    if any(normalized(x.removeprefix("en:")) in {"southkorea", "republicofkorea", "대한민국", "한국"} for x in places):
        return {"kind": "provider_manufacturing_place_UNVERIFIED", "values": places}
    return None  # country of sale or an 880 barcode is insufficient.


def obf_candidate(product, known_brands):
    basis = korean_basis(product, known_brands)
    code = str(product.get("code", ""))
    name = product.get("product_name_ko") or product.get("product_name")
    if not basis or not re.fullmatch(r"\d{8,14}", code) or not name:
        return None
    padded = code.lstrip("0").zfill(13)
    if len(padded) not in (13, 14) or int(padded) == 0:
        return None
    code = padded[-8:] if padded.startswith("00000") and len(padded) == 13 else padded
    folder = "/".join([padded[:3], padded[3:6], padded[6:9], padded[9:]])
    images, seen = [], set()
    mapping = product.get("images") or {}
    for language in ("ko", "en"):
        selected = mapping.get("ingredients_" + language) or {}
        image_id = str(selected.get("imgid", ""))
        original = mapping.get(image_id) or {}
        if not image_id.isdigit() or image_id in seen or not original.get("uploader"):
            continue
        seen.add(image_id)
        url = f"https://images.openbeautyfacts.org/images/products/{folder}/{image_id}.jpg"
        # Prefer a provider-returned URL's documented origin when available.
        display = (((product.get("selected_images") or {}).get("ingredients") or {}).get("display") or {}).get(language)
        if display and safe_url(display).hostname in OBF_IMAGES:
            base = urlsplit(display)
            url = urlunsplit((base.scheme, base.netloc, base.path.rsplit("/", 1)[0]+"/"+image_id+".jpg", "", ""))
        images.append({"url": url, "panel_hint": "provider_selected_ingredients_UNVERIFIED",
                       "language_hint_UNVERIFIED": language, "uploader": original["uploader"],
                       "source_image_id": image_id})
    if not images:
        return None
    return {"source": "openbeautyfacts", "source_id": "obf-"+code,
            "source_url": OBF+"/product/"+code, "name": name,
            "brand": product.get("brands", ""), "korean_connection_hint": basis,
            "source_license_claim_UNVERIFIED": "CC-BY-SA-3.0 photos; ODbL/DbCL metadata",
            "license_reference": OBF+"/terms-of-use", "redistribution_reviewed": False,
            "reference_hint_UNVERIFIED": {k: product.get(k, "") for k in ("ingredients_text_en", "ingredients_text_ko")},
            "images": images, "source_modified_at": product.get("last_modified_t")}


def shopify_candidate(product, source, ingredient_only):
    base, expected_brand = STORES[source]
    handle, name = product.get("handle", ""), product.get("title", "")
    if not re.fullmatch(r"[a-zA-Z0-9_-]+", handle) or not name:
        return None
    if normalized(product.get("vendor", "")) != normalized(expected_brand):
        return None
    photos = []
    for image in product.get("images", []):
        if not image.get("src"):
            continue
        url = clean_url(image.get("src", ""), base)
        alt = str(image.get("alt") or "")
        hint = ingredient_hint(alt) or ingredient_hint(urlsplit(url).path)
        if ingredient_only and not hint:
            continue
        photos.append({"url": url, "alt_UNVERIFIED": alt,
                       "panel_hint": "text_hint_ingredients_UNVERIFIED" if hint else "unknown"})
    photos.sort(key=lambda p: p["panel_hint"] == "unknown")
    return {"source": source, "source_id": source+"-"+handle,
            "source_url": base+"/products/"+handle, "name": name, "brand": expected_brand,
            "korean_connection_hint": {"kind": "configured_brand_store_UNVERIFIED"},
            "source_license_claim_UNVERIFIED": None, "license_reference": base+"/policies/terms-of-service",
            "redistribution_reviewed": False, "images": photos} if photos else None


class ProductHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.scripts, self.script, self.recording = [], [], False
        self.images = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script" and attrs.get("type", "").lower() == "application/ld+json":
            self.recording, self.script = True, []
        if tag == "img":
            src = attrs.get("data-src") or attrs.get("src")
            if src:
                self.images.append((src, attrs.get("alt", "")))

    def handle_data(self, data):
        if self.recording:
            self.script.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.recording:
            self.scripts.append("".join(self.script))
            self.recording = False


def product_objects(value, depth=0):
    if depth > 20:
        return
    if isinstance(value, list):
        for item in value:
            yield from product_objects(item, depth+1)
    elif isinstance(value, dict):
        types = value.get("@type", [])
        if "Product" in ([types] if isinstance(types, str) else types):
            yield value
        for key in ("@graph", "mainEntity"):
            yield from product_objects(value.get(key), depth+1)


def html_candidates(raw, url, known_brands, ingredient_only):
    page = ProductHTML()
    page.feed(raw.decode("utf8", "replace"))
    for script in page.scripts:
        try:
            data = json.loads(script)
        except ValueError:
            continue
        for product in product_objects(data):
            brand = product.get("brand", "")
            brand = brand.get("name", "") if isinstance(brand, dict) else brand
            if not isinstance(brand, str) or normalized(brand) not in known_brands or not product.get("name"):
                continue
            photo_data = product.get("image", [])
            if not isinstance(photo_data, list):
                photo_data = [photo_data]
            entries = [(x.get("url", "") if isinstance(x, dict) else x, "") for x in photo_data]
            entries += [(src, alt) for src, alt in page.images if ingredient_hint(alt) or ingredient_hint(src)]
            photos, seen = [], set()
            for src, alt in entries:
                if not src:
                    continue
                try:
                    image_url = clean_url(html.unescape(src), url)
                except ValueError:
                    continue
                hint = ingredient_hint(alt) or ingredient_hint(urlsplit(image_url).path)
                if image_url in seen or (ingredient_only and not hint):
                    continue
                seen.add(image_url)
                photos.append({"url": image_url, "alt_UNVERIFIED": alt,
                               "panel_hint": "text_hint_ingredients_UNVERIFIED" if hint else "unknown"})
            photos.sort(key=lambda p: p["panel_hint"] == "unknown")
            if photos:
                yield {"source": "product_page", "source_id": "page-"+hashlib.sha256((url+str(product["name"])).encode()).hexdigest()[:24],
                       "source_url": url, "name": product["name"], "brand": brand,
                       "korean_connection_hint": {"kind": "page_brand_name_match_UNVERIFIED"},
                       "source_license_claim_UNVERIFIED": None, "license_reference": None,
                       "redistribution_reviewed": False, "images": photos}


def image_info(data):
    from PIL import Image
    with Image.open(io.BytesIO(data)) as im:
        if im.format not in ("JPEG", "PNG", "WEBP") or im.width * im.height > MAX_PIXELS:
            raise ValueError("Unsupported image encoding or excessive dimensions")
        if getattr(im, "is_animated", False) or min(im.size) < 200:
            raise ValueError("Animation or thumbnail, not a useful label candidate")
        result = {"width": im.width, "height": im.height, "format": im.format,
                  "extension": {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}[im.format]}
        im.verify()
    with Image.open(io.BytesIO(data)) as im:
        # Detect identical decoded pixels even if metadata or compression differs.
        rgb = im.convert("RGB")
        result["pixel_sha256"] = hashlib.sha256(str(rgb.size).encode()+rgb.tobytes()).hexdigest()
    return result


def json_write(path, value):
    temporary = path.with_suffix(path.suffix+".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2)+"\n", encoding="utf8")
    temporary.replace(path)


class Collection:
    def __init__(self, root, args, client):
        self.root, self.args, self.client = Path(root), args, client
        self.ids, self.names, self.hashes, self.pixels = set(), set(), set(), set()
        self.report = {"crawler_version": VERSION, "started_utc": utc(), "status": "running",
            "target_products": args.limit, "sources": args.source,
            "ingredient_hints_only": args.ingredient_hints_only,
            "downloaded_products": 0, "downloaded_original_images": 0,
            "products_with_ingredient_hints_UNVERIFIED": 0, "human_verified_ingredient_panels": 0,
            "independent_human_references": 0, "benchmark_ready": False, "target_reached": False,
            "errors": [], "exclusions": [], "source_runs": [],
            "dedup_scope": "source_id; normalized brand+title; exact bytes; exact decoded pixels",
            "limitations": "Unreviewed candidates only. Korean provenance, true panels, family grouping, rights and label languages require review. Not training data or a safety/accuracy assessment."}

    def save(self):
        self.report["requests"] = self.client.requests
        json_write(self.root / "collection-report.json", self.report)
        manifest = self.root / "products-UNREVIEWED.jsonl"
        cards = []
        if manifest.exists():
            for line in manifest.read_text(encoding="utf8").splitlines():
                row = json.loads(line)
                images = "".join('<figure><img loading="lazy" src="'+html.escape(x["path"], quote=True)+
                    '"><figcaption>'+html.escape(x["panel_hint"])+"</figcaption></figure>" for x in row["images"])
                cards.append('<article><h2>'+html.escape(str(row["brand"]))+" — "+html.escape(str(row["name"]))+
                    '</h2><a rel="noreferrer" href="'+html.escape(row["source_url"], quote=True)+
                    '">Source / منبع</a><div class="images">'+images+"</div></article>")
        page = '''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ADPAI — Unreviewed cosmetic photos</title><style>body{font:16px system-ui;background:#f4f6fa;color:#172033;max-width:1100px;margin:2rem auto;padding:1rem}article{background:white;padding:1rem;border-radius:16px;margin:1rem 0}.images{display:flex;flex-wrap:wrap;gap:1rem}figure{margin:1rem 0;max-width:300px}img{max-width:100%;height:250px;object-fit:contain}figcaption{font-size:12px;overflow-wrap:anywhere}h2{font-size:18px}</style>
<h1>ADPAI — Unreviewed cosmetic photos</h1><p dir="rtl">عکس‌های گردآوری‌شده هنوز بازبینی نشده‌اند. حضور در این صفحه به معنی صحیح‌بودن مواد، مجوز بازنشر یا ایمنی محصول نیست.</p>'''
        page += '<p>Products: '+str(self.report["downloaded_products"])+" / "+str(self.args.limit)
        page += '; original photos: '+str(self.report["downloaded_original_images"])+"; independently verified panels: 0.</p>"
        page += "".join(cards) or '<p dir="rtl">هنوز عکس محصولی جمع‌آوری نشده است. collection-report.json را بررسی کنید.</p>'
        (self.root / "index.html").write_text(page, encoding="utf8")

    def admit(self, product):
        if not product:
            return
        identity = normalized(product["brand"])+":"+normalized(product["name"])
        source_id = product["source_id"]
        if source_id in self.ids or identity in self.names:
            self.report["exclusions"].append({"source_id": source_id, "reason": "duplicate product identity"})
            return
        downloaded, interrupted = [], False
        for image in product["images"]:
            if len(downloaded) >= self.args.images_per_product:
                break
            url = image["url"]
            try:
                data, mime = self.client.fetch(url, MAX_IMAGE)
                if not mime.lower().startswith("image/"):
                    raise ValueError("Non-image HTTP response")
                info = image_info(data)
                digest = hashlib.sha256(data).hexdigest()
                if digest in self.hashes or info["pixel_sha256"] in self.pixels:
                    self.report["exclusions"].append({"source_id": source_id, "url": url, "reason": "duplicate image"})
                    continue
                path = "images/"+digest+"."+info.pop("extension")
                (self.root / path).write_bytes(data)  # original bytes, no enhancement or re-encoding.
                self.hashes.add(digest)
                self.pixels.add(info["pixel_sha256"])
                downloaded.append({**image, **info, "path": path, "sha256": digest,
                                   "bytes": len(data), "downloaded_utc": utc(),
                                   "panel_verified": False, "visible_languages_verified": []})
            except KeyboardInterrupt:
                interrupted = True
                break
            except HTTPError as error:
                self.report["errors"].append({"source_id": source_id, "url": url, "error": str(error)})
                if error.code not in (404, 410):
                    break
            except Exception as error:
                self.report["errors"].append({"source_id": source_id, "url": url,
                                               "error_type": type(error).__name__, "error": str(error)})
                # A malformed/oversized image is not evidence; preserve previous downloads.
                if isinstance(error, SourceBlocked) and "budget" in str(error):
                    break
        if not downloaded:
            self.save()
            if interrupted:
                raise KeyboardInterrupt
            return
        self.ids.add(source_id)
        self.names.add(identity)
        row = {**product, "images": downloaded, "annotation_status": "unreviewed",
               "human_reviewed": False, "clinical_allergy_assessment": False,
               "complete_label_verified": False, "split": "unassigned", "family_id": None}
        with (self.root / "products-UNREVIEWED.jsonl").open("a", encoding="utf8") as file:
            file.write(json.dumps(row, ensure_ascii=False)+"\n")
        review = {"source_id": source_id, "source_url": product["source_url"],
                  "name": product["name"], "brand": product["brand"], "family_id": None,
                  "split": "unassigned", "reviewers": [], "adjudicated": False,
                  "rights_reviewed": False, "korean_connection_verified": False,
                  "images": [{"path": x["path"], "sha256": x["sha256"], "transcript": "",
                              "visible_languages": [], "ingredient_polygons": [],
                              "complete_panel": None, "quality_tags": []} for x in downloaded]}
        with (self.root / "review-UNREVIEWED.jsonl").open("a", encoding="utf8") as file:
            file.write(json.dumps(review, ensure_ascii=False)+"\n")
        self.report["downloaded_products"] += 1
        self.report["downloaded_original_images"] += len(downloaded)
        self.report["products_with_ingredient_hints_UNVERIFIED"] += int(any(x["panel_hint"] != "unknown" for x in downloaded))
        self.save()
        print(f"{self.report['downloaded_products']}/{self.args.limit}: {product['brand']} — {product['name']}", flush=True)
        if interrupted:
            raise KeyboardInterrupt


def crawl(args, client_factory=PublicClient):
    root = Path(args.output)
    root.mkdir(parents=True, exist_ok=False)  # protect existing evidence/annotations.
    (root / "images").mkdir()
    (root / "snapshots").mkdir()
    hosts = {"world.openbeautyfacts.org", *OBF_IMAGES, "cdn.shopify.com", *args.image_host}
    for source in args.source:
        if source in STORES:
            hosts.add(safe_url(STORES[source][0]).hostname)
    for url in args.url:
        hosts.add(safe_url(url).hostname)
    client = client_factory(hosts, root, delay=args.delay, max_requests=args.max_requests)
    collection = Collection(root, args, client)
    known = {normalized(x) for x in BRANDS+args.korean_brand}
    collection.save()
    stopping = False
    try:
        for source in args.source:
            print("Checking public source:", source, flush=True)
            run = {"source": source, "status": "running", "pages": 0, "products_seen": 0,
                   "eligible_candidates": 0, "starting_product_count": collection.report["downloaded_products"]}
            collection.report["source_runs"].append(run)
            try:
                for page in range(1, args.pages+1):
                    if source == "openbeautyfacts":
                        url = OBF+"/api/v2/search?"+urlencode({"countries_tags": "en:south-korea", "page": page,
                            "page_size": 100, "fields": FIELDS})
                    else:
                        url = STORES[source][0]+"/products.json?"+urlencode({"limit": 100, "page": page})
                    payload = client.json(url)
                    products = payload.get("products")
                    if not isinstance(products, list):
                        raise ValueError("Missing product array; do not count API error as an empty catalogue")
                    run["pages"] += 1
                    run["products_seen"] += len(products)
                    if not products:
                        break
                    for product in products:
                        try:
                            candidate = (obf_candidate(product, known) if source == "openbeautyfacts" else
                                         shopify_candidate(product, source, args.ingredient_hints_only))
                            run["eligible_candidates"] += int(candidate is not None)
                            collection.admit(candidate)
                        except (TypeError, ValueError, AttributeError) as error:
                            collection.report["exclusions"].append({"source": source,
                                "reason": "malformed product record", "error": str(error)})
                        if collection.report["downloaded_products"] >= args.limit:
                            stopping = True
                            break
                    if stopping:
                        break
                run["status"] = "finished_bounded_discovery"
            except Exception as error:
                run.update(status="blocked_or_failed", error_type=type(error).__name__, error=str(error))
                print(source+": "+str(error), flush=True)
            run["downloaded_products"] = collection.report["downloaded_products"] - run.pop("starting_product_count")
            collection.save()
            if stopping:
                break
        if not stopping:
            for url in args.url:
                run = {"source": "product_page", "url": url, "status": "running"}
                collection.report["source_runs"].append(run)
                try:
                    raw, mime = client.fetch(url)
                    if "html" not in mime.lower():
                        raise ValueError("Expected public HTML product page")
                    (root/"snapshots"/(hashlib.sha256(url.encode()).hexdigest()+".html")).write_bytes(raw)
                    for product in html_candidates(raw, url, known, args.ingredient_hints_only):
                        collection.admit(product)
                        if collection.report["downloaded_products"] >= args.limit:
                            stopping = True
                            break
                    run["status"] = "finished_bounded_discovery"
                except Exception as error:
                    run.update(status="blocked_or_failed", error_type=type(error).__name__, error=str(error))
                collection.save()
                if stopping:
                    break
    except KeyboardInterrupt:
        collection.report["interrupted"] = True
    finally:
        report = collection.report
        report["finished_utc"] = utc()
        report["target_reached"] = report["downloaded_products"] >= args.limit
        report["status"] = "unreviewed_target_reached" if report["target_reached"] else "incomplete"
        collection.save()
    return collection.report


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, help="New directory; existing evidence is never overwritten")
    parser.add_argument("--source", action="append", choices=["openbeautyfacts", *STORES], default=None)
    parser.add_argument("--url", action="append", default=[], help="Additional public product page with Product JSON-LD")
    parser.add_argument("--image-host", action="append", default=[], help="Additional exact HTTPS image CDN hostname")
    parser.add_argument("--korean-brand", action="append", default=[], help="Additional brand-name hint; not verified origin")
    parser.add_argument("--ingredient-hints-only", action="store_true", help="Skip images without provider/alt/filename ingredient hint; hints still need human review")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--images-per-product", type=int, default=3)
    parser.add_argument("--pages", type=int, default=5, help="Maximum catalogue pages per source")
    parser.add_argument("--max-requests", type=int, default=300)
    parser.add_argument("--delay", type=float, default=1.0)
    args = parser.parse_args(argv)
    args.source = list(dict.fromkeys(args.source or ([] if args.url else ["openbeautyfacts", *STORES])))
    if not (1 <= args.limit <= 200 and 1 <= args.images_per_product <= 5 and 1 <= args.pages <= 20
            and 1 <= args.max_requests <= 1000 and .5 <= args.delay <= 30):
        parser.error("Use 1–200 products, 1–5 photos/product, 1–20 pages/source, 1–1000 requests, delay 0.5–30s")
    for url in args.url:
        safe_url(url)
    for host in args.image_host:
        if safe_url("https://"+host).netloc != host:
            parser.error("--image-host must be an exact public hostname")
    return args


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    args = arguments()
    try:
        import PIL
    except ImportError:
        raise SystemExit("Install Pillow first: python -m pip install Pillow==12.3.0")
    try:
        report = crawl(args)
    except FileExistsError:
        raise SystemExit("Output already exists. Choose a new directory; existing evidence was preserved.")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["target_reached"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
