"""Offline lookup of curated dish records. No network and no recipe generation.
Input knowledge JSON is a list of {dish_id, aliases, typical_ingredients, sources}.
Typical ingredients are possibilities, never restaurant-specific facts.
"""
import argparse
import json
import unicodedata


def normalize(text):
    return " ".join(unicodedata.normalize("NFKC", text).casefold().split())


def build_index(records):
    index = {}
    for record in records:
        if not record.get("dish_id") or not record.get("sources"):
            raise ValueError("Every dish needs an ID and evidence sources")
        for alias in record["aliases"]:
            key = normalize(alias)
            if key:
                index.setdefault(key, []).append(record)
    return index


def lookup(text, index):
    matches = {r["dish_id"]: r for r in index.get(normalize(text), [])}
    result = {
        "input_text": text,
        "match_status": "unknown",
        "dish_id": None,
        "typical_ingredients": [],
        "actual_ingredients_verified": False,
        "requires_restaurant_confirmation": True,
        "sources": [],
    }
    if len(matches) > 1:
        result["match_status"] = "ambiguous"
    elif len(matches) == 1:
        record = next(iter(matches.values()))
        result.update(match_status="matched", dish_id=record["dish_id"],
                      typical_ingredients=record.get("typical_ingredients", []),
                      sources=record["sources"])
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--knowledge", required=True)
    parser.add_argument("--text", required=True, help="One OCR-extracted dish name")
    args = parser.parse_args()
    with open(args.knowledge, encoding="utf-8") as stream:
        index = build_index(json.load(stream))
    print(json.dumps(lookup(args.text, index), ensure_ascii=False, indent=2))
