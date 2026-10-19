#!/usr/bin/env python3
"""Bounded Commons discovery of UNREVIEWED menu photographs in Korea.

Metadata/location/language hints are not references. Stop on access/service
errors; never use alternate hosts or publish raw photographs automatically.
"""
import argparse
import hashlib
import html
import io
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

HOSTS = {"commons.wikimedia.org", "upload.wikimedia.org"}
AGENT = "ADPAI-menu-development/1.6.3 (https://github.com/faranaksolat/ADPAI)"
QUERIES = ['intitle:menu Seoul', 'intitle:menu Busan', 'intitle:menu "South Korea"',
           'intitle:메뉴판', 'intitle:menu Jeju', 'intitle:menu Incheon']
MAX_BYTES = 32 * 1024 * 1024


def approved(url):
    u = urlsplit(url)
    return u.scheme == "https" and u.hostname in HOSTS and not u.username and not u.password and u.port in (None, 443)


class RestrictedRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not approved(newurl):
            raise ValueError("Unexpected source redirect; no host fallback")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url):
    if not approved(url):
        raise ValueError("Unexpected source URL")
    with build_opener(RestrictedRedirect()).open(Request(url, headers={"User-Agent": AGENT}), timeout=30) as response:
        data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError("Source exceeds byte limit")
        return data


def plain(value):
    return html.unescape(re.sub(r"<[^>]*>", " ", str(value))).strip()


def candidate(page):
    info = (page.get("imageinfo") or [{}])[0]
    meta = info.get("extmetadata") or {}
    value = lambda key: plain((meta.get(key) or {}).get("value", ""))
    license_url = value("LicenseUrl")
    short = value("LicenseShortName")
    # Admit only an explicit reusable license, not "all rights reserved", NC,
    # ND, or an arbitrary URL claiming to describe a license.
    license_ok = bool(re.fullmatch(r"https?://creativecommons\.org/(?:licenses/by(?:-sa)?/[1-4]\.0|publicdomain/(?:zero|mark)/1\.0)/?", license_url))
    if not license_ok or not value("Artist") or info.get("mime") not in {"image/jpeg", "image/png"}:
        return None
    url = info.get("url", "")
    page_url = info.get("descriptionurl", "")
    if not approved(url) or not approved(page_url):
        return None
    if int(info.get("size", MAX_BYTES + 1)) > MAX_BYTES:
        return None
    return {"source_id": "commons-" + str(page["pageid"]), "title": page["title"],
            "image_url": url, "source_url": page_url, "license": short,
            "license_url": license_url, "attribution": value("Artist"),
            "description_UNVERIFIED": value("ImageDescription"),
            "source_revision_timestamp": info.get("timestamp"),
            "mime": info["mime"], "restaurant_country_UNVERIFIED": None,
            "languages_UNVERIFIED": [], "annotation_status": "unreviewed",
            "complete_menu_verified": False, "human_reviewed": False}


def collect(root, limit, getter=fetch, delay=.5):
    root = Path(root)
    root.mkdir(parents=True, exist_ok=False)
    (root / "images").mkdir()
    report = {"started_utc": datetime.now(timezone.utc).isoformat(), "requested_limit": limit,
              "downloaded_original_images": 0, "independently_reviewed_references": 0,
              "scored_real_menus": 0, "status": "running", "queries": QUERIES,
              "exclusions": [], "limitations": "Discovery only; verify actual menu, restaurant in Korea, visible languages and printed ingredients before annotation. No source hints are ground truth."}
    rows, seen_ids, hashes = [], set(), set()
    try:
        for qi, query in enumerate(QUERIES):
            params = {"action": "query", "format": "json", "generator": "search", "gsrsearch": query,
                      "gsrnamespace": 6, "gsrlimit": min(50, limit * 2), "prop": "imageinfo",
                      "iiprop": "url|mime|size|timestamp|extmetadata"}
            raw = getter("https://commons.wikimedia.org/w/api.php?" + urlencode(params))
            (root / f"discovery-{qi}.json").write_bytes(raw)
            payload = json.loads(raw)
            if payload.get("error"):
                raise ValueError("Commons API error: " + str(payload["error"].get("code")))
            for page in payload.get("query", {}).get("pages", {}).values():
                if page.get("pageid") in seen_ids:
                    continue
                seen_ids.add(page.get("pageid"))
                row = candidate(page)
                if not row:
                    report["exclusions"].append({"title": page.get("title"), "reason": "missing compatible rights/author/image type/source"})
                    continue
                data = getter(row["image_url"])
                from PIL import Image
                image = Image.open(io.BytesIO(data))
                if image.format not in {"JPEG", "PNG"} or image.width * image.height > 40_000_000:
                    raise ValueError("Unexpected image encoding/dimensions")
                image.verify()
                digest = hashlib.sha256(data).hexdigest()
                if digest in hashes:
                    report["exclusions"].append({"title": page.get("title"), "reason": "duplicate original bytes"})
                    continue
                hashes.add(digest)
                extension = "jpg" if row["mime"] == "image/jpeg" else "png"
                row.update(path=f"images/{row['source_id']}.{extension}", sha256=digest)
                (root / row["path"]).write_bytes(data)
                rows.append(row)
                # Append provenance as each photo finishes, even if a later
                # service request fails. Never invent empty reference labels.
                with (root / "candidates-UNREVIEWED.jsonl").open("a", encoding="utf8") as f:
                    f.write(json.dumps(row, ensure_ascii=False) + "\n")
                time.sleep(delay)
                if len(rows) >= limit:
                    break
            if len(rows) >= limit:
                break
            time.sleep(delay)
        report["status"] = "unreviewed_candidates" if rows else "no_candidates"
    except Exception as error:
        report["status"] = "blocked_or_failed"
        report["error"] = str(error)
    finally:
        report["finished_utc"] = datetime.now(timezone.utc).isoformat()
        report["downloaded_original_images"] = len(rows)
        (root / "collection-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True)
    parser.add_argument("--limit", type=int, default=24)
    args = parser.parse_args()
    if not 1 <= args.limit <= 50:
        parser.error("Use1–50 images for the bounded discovery pilot")
    result = collect(args.output, args.limit)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["status"] == "unreviewed_candidates" else 2)
