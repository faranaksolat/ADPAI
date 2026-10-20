"""Label evidence, independent of OCR/model downloads.

Keep behavior aligned with src/engine.js through shared/regressions.json.
No current OCR adapter proves full-panel completeness: negative results abstain.
"""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ONTOLOGY = json.loads((ROOT / "backend/ontology.json").read_text(encoding="utf-8"))
NON_DAIRY_PHRASES = json.loads((ROOT / "shared/non-dairy.json").read_text(encoding="utf-8"))
ALLERGENS = ONTOLOGY["allergens"]
MARKERS = ONTOLOGY["label_markers"]
STOP_HEADINGS = MARKERS["nutrition_headings"] + ["storage", "best before", "customer service", "barcode", "보관방법", "고객상담실", "保存方法", "保管方法"]


def normalize_arabic_persian(s):
    s = s.translate(str.maketrans({"ي":"ی", "ى":"ی", "ئ":"ی", "ك":"ک", "ؤ":"و", "ة":"ه", "ۀ":"ه", "أ":"ا", "إ":"ا", "ٱ":"ا"}))
    return re.sub(r"[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]", "", s)


def fold(s):
    s = normalize_arabic_persian(unicodedata.normalize("NFKC", str(s or "")).lower())
    s = "".join(ch for ch in unicodedata.normalize("NFKD", s) if not unicodedata.category(ch).startswith("M"))
    return re.sub(r"\s+", " ", s.replace("’", "'").replace("`", "'")).strip()


def compact(s):
    return re.sub(r"[\s\u200b\u200c\u200d]+", "", fold(s))


def label_pattern(term):
    chars = list(unicodedata.normalize("NFC", fold(term)))
    hangul = lambda ch: bool(ch and "\uac00" <= ch <= "\ud7a3")
    out, i = "", 0
    while i < len(chars):
        if chars[i].isspace():
            previous = chars[i-1] if i else ""
            while i+1 < len(chars) and chars[i+1].isspace():
                i += 1
            following = chars[i+1] if i+1 < len(chars) else ""
            out += r"\s*" if hangul(previous) and hangul(following) else r"\s+"
        else:
            out += re.escape(fold(chars[i]))
            if i+1 < len(chars) and hangul(chars[i]) and hangul(chars[i+1]):
                out += r"\s*"
        i += 1
    return out


SUFFIX_CAUTION = re.compile('|'.join(label_pattern(x) for x in ["혼입가능", "혼입 가능", "함유가능", "함유 가능", "같은 제조시설", "동일 제조시설", "含む可能性", "同一工場", "可能含有"]))
SUFFIX_DIRECT = re.compile('|'.join(label_pattern(x) for x in ["함유", "含有", "含む"]))


def match_spans(text, term):
    q = fold(term)
    if not q:
        return []
    pattern = label_pattern(term)
    if q == fold("굴"):
        suffixes = "|".join(label_pattern(x) for x in ["을", "은", "이", "과", "의", "로", "에", "도", "만", "무침", "국", "전", "소스", "라멘", "우동"])
        pattern = r"(?<!\w)" + pattern + r"(?=$|[^\w]|" + suffixes + ")"
    elif re.search(r"[a-z\u0370-\u03ff\u0400-\u052f\u0900-\u097f]", q) or q in [fold(x) for x in ["밀", "깨", "게"]]:
        pattern = r"(?<!\w)" + pattern + r"(?!\w)"
    excluded_terms = ["밀크", "밀크초콜릿", "밀크파우더"] if q == fold("밀") else ["들깨"] if q == fold("깨") else []
    excluded = [(m.start(), m.end()) for word in excluded_terms for m in re.finditer(r"(?<!\w)"+label_pattern(word)+r"(?!\w)", text)]
    return [(m.start(), m.end()) for m in re.finditer(pattern, text) if not any(start <= m.start() and end >= m.end() for start, end in excluded)]


def contains_term(text, term):
    return bool(match_spans(fold(text), term))


def contains_any(text, terms):
    return any(contains_term(text, term) for term in terms)


def context_events(text):
    events = [(start, end, kind) for kind, terms in [
        ("direct", MARKERS["ingredient_headings"]), ("direct", MARKERS["direct_markers"]),
        ("caution", MARKERS["caution_markers"]), ("mention", STOP_HEADINGS)
    ] for term in terms for start, end in match_spans(text, term)]
    for subject in ["이 제품은", "본 제품은"]:
        for start, end in match_spans(text, subject):
            following = re.split(r"[.!?。]", "\n".join(text[end:end+350].split("\n")[:5]))[0]
            if SUFFIX_CAUTION.search(following):
                events.append((start, end, "caution"))
    return sorted([e for e in events if not any(other != e and other[0] <= e[0] and other[1] >= e[1]
                   and (other[1]-other[0] > e[1]-e[0] or other[2] == "caution" and e[2] != "caution") for other in events)])


def occurrence_kind(text, span, events):
    start, end = span
    line_start = text.rfind("\n", 0, start)+1
    line_end = text.find("\n", end)
    if line_end < 0:
        line_end = len(text)
    line = text[line_start:line_end]
    if (re.search(r"\b(?:no|without|free from|sans|sin)\s+[^,;:.]*$", text[line_start:start])
            or re.match(r"(?:[- ]free|[- ]frei|\s+free)\b", text[end:])):
        return "mention"
    before = [e for e in events if e[0] <= start]
    current = before[-1] if before else None
    kind = current[2] if current and not re.search(r"[.;!?。；]", text[current[1]:start]) else "mention"
    line_has_direct = any(e[2] == "direct" and line_start <= e[0] <= start for e in events)
    if not line_has_direct and SUFFIX_CAUTION.search(line):
        kind = "caution"
    elif kind == "mention" and SUFFIX_DIRECT.search(line) and not SUFFIX_CAUTION.search(line):
        kind = "direct"
    return kind


def scan_evidence(source_texts, profile):
    hits = []
    blocks = []
    for family, raw_lines in source_texts.items():
        photos = {}
        for line in raw_lines:
            photos.setdefault(line.get("photoIndex") if isinstance(line, dict) else None, []).append(line)
        blocks.extend((family, lines) for lines in photos.values())
    for family, raw_lines in blocks:
        lines = [line if isinstance(line, dict) else {"text": line, "score": 1} for line in raw_lines]
        normalized = ["\n".join(fold(part) for part in str(line.get("text", "")).split("\n")) for line in lines]
        text = "".join(("" if i == 0 else " " if lines[i].get("lineId") is not None and lines[i].get("lineId") == lines[i-1].get("lineId") else "\n") + value for i, value in enumerate(normalized))
        events = context_events(text)
        milk_text = text
        for phrase in NON_DAIRY_PHRASES:
            for start, end in match_spans(milk_text, phrase):
                milk_text = milk_text[:start] + " "*(end-start) + milk_text[end:]
        terms = [(key, lang, alias, ALLERGENS[key]["label"]) for key in profile.get("allergens", []) if key in ALLERGENS
                 for lang, aliases in ALLERGENS[key]["aliases"].items() for alias in aliases]
        terms += [("custom", "user", str(term), "Custom avoid") for term in profile.get("custom_avoid", []) if str(term).strip()]
        for key, lang, alias, label in terms:
            for span in match_spans(milk_text if key == "milk" else text, alias):
                offset, index = 0, 0
                while index < len(normalized)-1 and offset+len(normalized[index]) < span[0]:
                    offset += len(normalized[index])+1
                    index += 1
                cursor, confidence = 0, 1.0
                for item, value in zip(lines, normalized):
                    end = cursor+len(value)
                    if end > span[0] and cursor < span[1] and value:
                        confidence = min(confidence, float(item.get("score", 0)))
                    cursor = end+1
                hits.append(dict(kind=occurrence_kind(text, span, events), allergen_id=key, allergen=label, term=alias,
                                 language=lang, score=confidence, family=family,
                                 ocr_family=family, text=lines[index].get("text", "")))
    groups = {}
    for hit in hits:
        if hit["kind"] != "mention":
            key = (hit["kind"], hit["allergen_id"], fold(hit["term"]) if hit["allergen_id"] == "custom" else "")
            groups.setdefault(key, []).append(hit)
    strong = []
    for group in groups.values():
        if any(h["score"] >= .58 for h in group) or len({h["family"] for h in group if h["score"] >= .45}) >= 2:
            strong.append(max(group, key=lambda h: h["score"]))
    direct = [h for h in strong if h["kind"] == "direct"]
    def same(a, b):
        return a["allergen_id"] == b["allergen_id"] and (a["allergen_id"] != "custom" or fold(a["term"]) == fold(b["term"]))
    caution = [h for h in strong if h["kind"] == "caution" and not any(same(h,d) for d in direct)]
    unresolved = [h for h in hits if h["kind"] == "mention" or not any(same(h,s) for s in direct+caution)]
    return direct, caution, unresolved


def scan_profile(source_texts, profile):
    direct, caution, _ = scan_evidence(source_texts, profile)
    return direct, caution


def label_evidence(source_texts):
    text = "\n".join(line.get("text", "") if isinstance(line, dict) else line for lines in source_texts.values() for line in lines)
    return dict(ingredient=contains_any(text, MARKERS["ingredient_headings"]),
                nutrition=contains_any(text, MARKERS["nutrition_headings"]),
                declaration=contains_any(text, MARKERS["direct_markers"]+MARKERS["caution_markers"]),
                readable=len(compact(text)) >= 18)


def semantic_result(pid, source_texts, profile, exhaustive=False):
    direct, caution, unresolved = scan_evidence(source_texts, profile)
    status = "conflict" if direct else "caution" if caution else "unverified"
    reason = {"conflict": "A selected ingredient or direct declaration was recognized.",
              "caution": "A precautionary cross-contact statement was recognized.",
              "unverified": "Complete ingredient-panel coverage is not verified. Do not interpret this as absence of allergens."}[status]
    return dict(product_id=pid, label=f"Product {pid}", status=status, message=reason, reason=reason,
                direct_matches=direct, caution_matches=caution, mention_matches=unresolved,
                ocr_families_used=[key for key, lines in source_texts.items() if lines],
                multilingual_exhaustive=False,
                coverage={"complete": False, "panel_completeness_verified": False})
