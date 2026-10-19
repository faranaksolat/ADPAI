#!/usr/bin/env python3
"""Create deliberately unscorable review worksheets from downloaded photos.

No provider ingredient/allergen hints or OCR are copied into reference fields.
"""
import argparse
import hashlib
import json
from pathlib import Path


def export_review(directory):
    root = Path(directory).resolve()
    manifest = root/"downloaded.jsonl"
    rows = [json.loads(line) for line in manifest.read_text(encoding="utf8").splitlines() if line.strip()]
    if not rows:
        raise ValueError("No downloaded photographs to review")
    references, ids = [], set()
    for row in rows:
        path = (root/row["path"]).resolve()
        if not path.is_relative_to(root) or hashlib.sha256(path.read_bytes()).hexdigest() != row["sha256"]:
            raise ValueError("Image integrity failed before review export")
        capture = row["product_id"]+"-image-"+str(row["image_id"])
        if capture in ids:
            raise ValueError("Duplicate capture in downloaded manifest")
        ids.add(capture)
        references.append({
            "product_id": row["product_id"], "capture_id": capture,
            "family_id": "", "split": "unassigned", "kind": "real_package",
            "language": row["language"],
            "annotation": {"status": "unreviewed", "reviewers": [],
                           "notes": "Verify actual language, family, visible text, panel completeness and allergen context independently."},
            "images": [{"path": row["path"], "sha256": row["sha256"], "transcript": "",
                        "source_url": row["source_url"], "download_url": row["download_url"],
                        "license": row["license"], "attribution": row["attribution"]}],
            "ingredients": None, "direct_allergens": None, "caution_allergens": None,
            "required_abstention": None,
        })
    target = root/"labels-UNREVIEWED.jsonl"
    # Do not replace an annotator's work, including a partially edited file.
    with target.open("x", encoding="utf8") as file:
        for row in references:
            file.write(json.dumps(row, ensure_ascii=False)+"\n")
    return {"worksheet": str(target), "photos": len(references), "reviewed_references": 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", help="Output directory containing downloaded.jsonl and images/")
    print(json.dumps(export_review(parser.parse_args().directory)))


if __name__ == "__main__":
    main()
