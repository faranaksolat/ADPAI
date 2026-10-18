#!/usr/bin/env python3
"""Screen source language/panel hints using OFF's public OCR, not ground truth.

This intentionally selects easier-to-read panels and cannot certify OCR recall,
complete ingredients, product safety, or even the correctness of its own hints.
"""
import argparse
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import ssl
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location("screened_bulk", Path(__file__).with_name("bulk-off.py"))
bulk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bulk)
SCREEN_VERSION = "2"
NON_FOOD_EN = re.compile(r"\b(?:shampoo|detergent|modelling foam|modeling foam|modelling clay|modeling clay|hti toys|fabric softener|cosmetics?|sunscreen|shower gel|toothpaste|dishwashing|laundry|disinfectant|for external use only)\b")
NON_FOOD_KO = ("화장품", "파운데이션", "샴푸", "주방세제", "세탁세제", "손소독제")
FOOD_WORDS = set("water sugar salt flour wheat milk cream cocoa chocolate coconut corn maize soy lecithin yeast starch oil butter egg eggs honey orange juice cheese oats oat rice almond almonds peanut peanuts hazelnut hazelnuts cashew cashews walnut walnuts fish prawns shrimp tomato tomatoes beef pork chicken gelatin coffee tea vanilla acid flavour flavor preservative emulsifier protein sorbitol sucralose stevia syrup mustard vinegar barley rye".split())


def screen_text(payload, language):
    responses = payload.get("responses") if isinstance(payload, dict) else None
    result = responses[0] if isinstance(responses, list) and responses else payload
    result = result if isinstance(result, dict) else {}
    annotations = result.get("textAnnotations") or []
    first = annotations[0] if annotations else {}
    text = result.get("fullTextAnnotation", {}).get("text") or first.get("description", "")
    locale = first.get("locale")
    lower = text.casefold()
    compact = re.sub(r"\s+", "", lower)
    words = set(re.findall(r"\b[a-z]+\b", lower))
    food_words = sorted(words & FOOD_WORDS)
    heading = bool(re.search(r"\bingredients?\b", lower))
    # Food also contains technical chemical names. Only explicit product-use
    # phrases are rejected; propylene glycol/acid/etc. alone are not evidence.
    non_food = bool(NON_FOOD_EN.search(lower) or any(x in compact for x in NON_FOOD_KO))
    if language == "en":
        strong_panel = heading and bool(food_words) and (locale == "en" or len(food_words) >= 3)
        partial_panel = locale == "en" and len(food_words) >= 3 and len(re.findall(r"[a-z]", lower)) >= 25
        keep = (strong_panel or partial_panel) and not non_food
    elif language == "ko":
        strong_panel = len(re.findall(r"[가-힣]", text)) >= 10 and any(x in compact for x in ["원재료", "원료명"])
        partial_panel = len(re.findall(r"[가-힣]", text)) >= 20 and "함유" in compact
        keep = (strong_panel or partial_panel) and not non_food
    else:
        raise ValueError("Expected ko/en language")
    return {"screen_version": SCREEN_VERSION, "method": "provider_OCR_heuristic_not_reference",
            "candidate_language": language, "provider_locale_hint": locale, "text_characters": len(text),
            "english_food_word_count": len(food_words), "english_heading_seen": heading,
            "non_food_hint": non_food, "likely_requested_label": keep,
            "panel_hint": "ingredient_heading" if strong_panel else "partial_or_unconfirmed",
            "human_reviewed": False, "complete_panel_verified": False}


def provider_ocr(image_url, cache=None):
    if not bulk.approved_image_url(image_url):
        raise ValueError("Unapproved image origin")
    url = image_url[:-4]+".json.gz"
    key = hashlib.sha256(url.encode()).hexdigest()
    stored = Path(cache)/f"{key}.json.gz" if cache else None
    if stored and stored.exists():
        raw = stored.read_bytes()
        meta = json.loads(stored.with_suffix('.provenance.json').read_text())
        if meta != {"url": url, "sha256": hashlib.sha256(raw).hexdigest()}:
            raise ValueError("Provider OCR cache integrity failed")
    else:
        raw = fetch_provider_bytes(url)
        if stored:
            stored.parent.mkdir(parents=True, exist_ok=True)
            temporary = stored.with_suffix('.part')
            temporary.write_bytes(raw)
            temporary.replace(stored)
            stored.with_suffix('.provenance.json').write_text(json.dumps({"url":url,"sha256":hashlib.sha256(raw).hexdigest()}))
    if len(raw) > 8*1024*1024:
        raise ValueError("Provider OCR compressed size limit")
    with gzip.GzipFile(fileobj=io.BytesIO(raw)) as source:
        decoded = source.read(16*1024*1024+1)
    if len(decoded) > 16*1024*1024:
        raise ValueError("Provider OCR decoded size limit")
    return json.loads(decoded), {"provider_ocr_url": url, "provider_ocr_gzip_sha256": hashlib.sha256(raw).hexdigest()}


def fetch_provider_bytes(url):
    with bulk.http_session().get(url, timeout=(20, 45), stream=True,
                                       verify=ssl.get_default_verify_paths().cafile or True,
                                       allow_redirects=False) as response:
        if response.status_code != 200:
            raise HTTPError(url, response.status_code, "Provider OCR request failed", response.headers, None)
        raw = response.raw.read(8*1024*1024+1)
    return raw


def cache_index(directories):
    cache = {}
    for directory in directories:
        root = Path(directory).resolve()
        for line in (root/"downloaded.jsonl").read_text(encoding="utf8").splitlines():
            item = json.loads(line)
            path = (root/item["path"]).resolve()
            if not path.is_relative_to(root) or hashlib.sha256(path.read_bytes()).hexdigest() != item["sha256"]:
                raise ValueError("Cached image integrity failed")
            cache[item["bulk_image_url"]] = (path, item["sha256"])
    return cache


def fetcher(language, cache, get_ocr=provider_ocr, get_image=bulk.fetch_image):
    def fetch(url):
        try:
            payload, provenance = get_ocr(url)
        except HTTPError as exc:
            if exc.code != 404:
                raise
            raise bulk.CandidateExcluded("provider_ocr_unavailable_needs_review", {"human_reviewed": False}) from exc
        screen = {**screen_text(payload, language), **provenance}
        if not screen["likely_requested_label"]:
            raise bulk.CandidateExcluded("source_language_or_panel_unconfirmed_needs_review", screen)
        if url in cache:
            path, digest = cache[url]
            data = path.read_bytes()
            if hashlib.sha256(data).hexdigest() != digest:
                raise ValueError("Cached image changed")
            screen["image_transport"] = "verified_local_cache"
        else:
            data = get_image(url)
            screen["image_transport"] = "official_public_bucket"
        return bulk.FetchedImage(data, screen)
    return fetch


def pin_screening(output, language):
    root = Path(output)
    root.mkdir(parents=True, exist_ok=True)
    target = root/"screening-provenance.json"
    expected = {"screen_version": SCREEN_VERSION, "language": language,
                "source_sha256": {name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
                                  for name in ["screen-off.py", "bulk-off.py", "collect-off.py"]},
                "independent_reference": False,
                "selection_bias": "Provider-OCR-readable ingredient panels; not a representative accuracy holdout."}
    if target.exists():
        if json.loads(target.read_text()) != expected:
            raise ValueError("Screening code/language changed; use a new output and the verified image cache")
    else:
        if (root/"downloaded.jsonl").exists() or (root/"download.json").exists():
            raise ValueError("Existing collection has no pinned screening provenance; use a new output")
        target.write_text(json.dumps(expected, indent=2)+"\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--queue", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--language", choices=["ko", "en"], required=True)
    parser.add_argument("--limit", type=int, required=True)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--delay", type=float, default=.2)
    parser.add_argument("--cache", action="append", default=[])
    parser.add_argument("--provider-ocr-cache", help="Verified public source-OCR cache; never reference annotations")
    args = parser.parse_args()
    rows = [json.loads(line) for line in Path(args.queue).read_text(encoding="utf8").splitlines() if line.strip()]
    if any(row.get("language") != args.language for row in rows):
        raise ValueError("Queue language mismatch")
    cache = cache_index(args.cache)
    pin_screening(args.output, args.language)
    report = bulk.download(args.queue, args.output, args.limit, args.delay,
                           fetch=fetcher(args.language, cache, get_ocr=lambda url: provider_ocr(url, args.provider_ocr_cache)), workers=args.workers)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
