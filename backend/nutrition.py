"""Conservative package-energy parsing; parity fixtures live in shared/."""
import math
import re
import unicodedata

NUMBER = r"[0-9]+(?:[.,][0-9]+)*"
ENERGY = r"(?:kcal|킬로칼로리|千卡(?:路里)?|キロカロリー)"
TOTAL_WEIGHT = r"(?:[총종]\s*내\s*용\s*[량양랑]|net\s*(?:wt\.?|weight)|total\s*(?:content|weight)|poids\s*net|peso\s*neto|nettogewicht|peso\s*liquido|peso\s*líquido|وزن\s*خالص|内容量|正味量|净含量|淨含量)"
SERVING = re.compile(r"per\s*serving|per\s*portion|par\s*portion|1\s*회|serving\s*size", re.I)


def normalize_calorie_ocr(text):
    s = unicodedata.normalize("NFKC", str(text or "")).lower().replace("×", "x")
    s = re.sub(r"\bk\s*c\s*a\s*[l1i|!]\b", "kcal", s)
    return re.sub(r"\s+", " ", s).strip()


def number_of(raw):
    if re.fullmatch(r"\d+,\d{1,2}", raw):
        return float(raw.replace(",", "."))
    if re.fullmatch(r"\d{1,3}(?:,\d{3})+(?:\.\d+)?", raw):
        return float(raw.replace(",", ""))
    if re.fullmatch(r"\d+(?:\.\d+)?", raw):
        return float(raw)
    return math.nan


def matches(text, pattern):
    return list(re.finditer(pattern, text, re.I))


def unique(values):
    return list(dict.fromkeys(v for v in values if math.isfinite(v)))


def unknown(method=None):
    return dict(package_kcal=None, basis=None, total_weight_g=None,
                reference_kcal=None, reference_g=None, method=method)


def package_weight(text):
    multipacks = unique(
        round(number_of(m[1]) * int(m[2]), 4)
        for m in matches(text, rf"({NUMBER})\s*g\s*x\s*(\d+)\s*(?:봉지|개|팩|packs?|pcs?|pieces?|sachets?|bars?|sticks?)")
        if number_of(m[1]) > 0 and 2 <= int(m[2]) <= 1000
    )
    if len(multipacks) > 1:
        return None, None, True
    multi = multipacks[0] if multipacks else None
    weights = [number_of(m[1]) for m in matches(text, rf"{TOTAL_WEIGHT}\s*[:：]?\s*({NUMBER})\s*g(?![a-z])")]
    if any(not math.isfinite(v) or not .5 <= v <= 50000 for v in weights):
        return None, None, True
    resolved = []
    for weight in weights:
        if multi is None or abs(weight-multi) <= max(3, multi*.02):
            resolved.append(weight)
        else:
            raw = f"{weight:g}"
            candidates = unique(float(raw[cut:]) for cut in (1, 2, 3)
                                if len(raw)-cut >= 2 and re.fullmatch(r"\d+(?:\.\d+)?", raw[cut:]))
            candidates = [v for v in candidates if v >= .5 and abs(v-multi) <= max(3, multi*.02)]
            if len(candidates) != 1:
                return None, None, True
            resolved.append(candidates[0])
    totals = unique(resolved)
    if len(totals) > 1:
        return None, None, True
    value = totals[0] if totals else multi
    if value is not None and (value < .5 or value > 5000 and multi is None or value > 50000):
        return None, None, True
    return value, "explicit_total_weight" if totals else "multipack_weight", False


def extract_calories_from_text(text):
    n = normalize_calorie_ocr(text)
    weight, weight_method, conflict = package_weight(n)
    if conflict:
        return unknown("conflicting_or_implausible_weight")
    refs = []
    for pattern, reverse in [
        (rf"(?:per|pour|por|pro)\s*({NUMBER})\s*g\s*[:：]?\s*({NUMBER})\s*{ENERGY}", False),
        (rf"({NUMBER})\s*g\s*(?:당|per|pour|por|pro)\s*[:：]?\s*({NUMBER})\s*{ENERGY}", False),
        (rf"({NUMBER})\s*{ENERGY}\s*(?:/|per|pour|por|pro)\s*({NUMBER})\s*g", True),
    ]:
        for m in matches(n, pattern):
            pair = (number_of(m[2]), number_of(m[1])) if reverse else (number_of(m[1]), number_of(m[2]))
            if pair not in refs:
                refs.append(pair)
    if any(not math.isfinite(g) or not math.isfinite(k) or g < .5 or k <= 0 or k/g > 10 for g, k in refs):
        return unknown("invalid_energy_basis")
    if len(refs) > 1 and any(abs(k/g-refs[0][1]/refs[0][0]) > .01 for g, k in refs):
        return unknown("conflicting_energy_basis")
    ref_g, ref_kcal = refs[0] if refs else (None, None)
    explicit = unique(number_of(m[1]) for m in matches(n, rf"(?:energy\s*per\s*pack(?:age)?|(?:total\s*)?package\s*(?:energy|calories)|total\s*package\s*(?:energy|calories)|총\s*(?:열량|칼로리)|总热量|總熱量)\s*[:：]?\s*({NUMBER})\s*{ENERGY}")
                      if not SERVING.search(n[max(0,m.start()-35):m.end()+35]))
    if len(explicit) > 1:
        return unknown("conflicting_total_energy")
    computed = ref_kcal*weight/ref_g if weight is not None and ref_g is not None else None
    if explicit and computed is not None and abs(explicit[0]-computed) > max(2, computed*.02):
        return unknown("conflicting_total_energy")
    value = explicit[0] if explicit else computed
    if value is None:
        return unknown()
    if not 0 < value <= 25000:
        return unknown("rejected_implausible_energy")
    return dict(package_kcal=math.floor(value+.5), total_weight_g=weight, reference_g=ref_g, reference_kcal=ref_kcal,
                basis=f"Label states package energy: {value:g} kcal" if explicit else f"Calculated from {ref_kcal:g} kcal / {ref_g:g} g × {weight:g} g",
                method="explicit_total_energy" if explicit else weight_method+"+direct_reference_pair")


def extract_best_calories(source_texts):
    blocks = []
    for lines in source_texts.values():
        photos = {}
        for line in lines:
            photos.setdefault(line.get("photoIndex") if isinstance(line, dict) else None, []).append(line.get("text", "") if isinstance(line, dict) else line)
        blocks.extend(photos.values())
    results = [extract_calories_from_text("\n".join(lines)) for lines in blocks if lines]
    values = [c for c in results if c["package_kcal"] is not None]
    if any((c["method"] or "").startswith("conflicting") for c in results) or len(unique(c["package_kcal"] for c in values)) > 1:
        return unknown("conflicting_ocr_readings")
    return values[0] if values else unknown()
