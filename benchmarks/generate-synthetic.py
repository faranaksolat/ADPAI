#!/usr/bin/env python3
"""Generate explicit Korean debugging fixtures; NEVER real-package evidence."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

CASES = [
    ("milk-soy", ["원재료명: 설탕, 전지분유, 대두레시틴", "우유, 대두 함유"], ["설탕", "전지분유", "대두레시틴"], ["milk", "soy"], []),
    ("mixed-warning", ["원재료명: 밀가루, 대두유, 정제소금", "밀, 대두 함유", "우유, 계란, 새우 혼입가능"], ["밀가루", "대두유", "정제소금"], ["wheat", "soy"], ["milk", "egg", "shellfish"]),
    ("cocoa-fat", ["원재료명: 설탕, 코코아버터, 코코아매스, 레시틴"], ["설탕", "코코아버터", "코코아매스", "레시틴"], [], []),
    ("coconut-cream", ["원재료명: 정제수, 코코넛크림, 설탕"], ["정제수", "코코넛크림", "설탕"], [], []),
    ("peanut-butter", ["원재료명: 땅콩버터, 설탕, 정제소금", "땅콩 함유"], ["땅콩버터", "설탕", "정제소금"], ["peanut"], []),
    ("fish-shrimp", ["원재료명: 멸치, 새우, 정제소금", "새우 함유", "우유 혼입가능"], ["멸치", "새우", "정제소금"], ["fish", "shellfish"], ["milk"]),
    ("perilla", ["원재료명: 들깨가루, 정제수, 정제소금"], ["들깨가루", "정제수", "정제소금"], [], []),
    ("shared-facility", ["원재료명: 설탕, 구연산", "우유, 대두와 같은 제조시설에서 제조"], ["설탕", "구연산"], [], ["milk", "soy"]),
    ("nutrition-only", ["영양정보", "나트륨 100 mg", "탄수화물 20 g", "단백질 2 g"], [], [], []),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="benchmarks/generated/korean-debug-v1")
    parser.add_argument("--font", default="/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc")
    args = parser.parse_args()
    root = Path(args.output)
    if (root / "labels.jsonl").exists():
        raise SystemExit("Refusing to overwrite existing dataset")
    (root / "images").mkdir(parents=True, exist_ok=True)
    font = ImageFont.truetype(args.font, 43, index=1)
    rows = []
    for case_id, lines, ingredients, direct, caution in CASES:
        transcript = "합성 테스트 라벨\n" + "\n".join(lines)
        image = Image.new("RGB", (1300, 450), "white")
        ImageDraw.Draw(image).multiline_text((42, 40), transcript, font=font, fill="black", spacing=23)
        for variant in ["clear", "rotated-soft"]:
            photo = image if variant == "clear" else image.filter(ImageFilter.GaussianBlur(.6)).rotate(90, expand=True)
            name = f"images/{case_id}-{variant}.png"
            photo.save(root / name)
            rows.append({
                "product_id": case_id, "family_id": case_id,
                "capture_id": f"{case_id}-{variant}", "language": "ko",
                "split": "development", "kind": "synthetic",
                "annotation": {"status": "single_review", "reviewers": ["synthetic-template-author"], "method": "text specified before rendering and OCR; no real package"},
                "images": [{"path": name, "sha256": hashlib.sha256((root/name).read_bytes()).hexdigest(), "transcript": transcript,
                            "source_url": "generated:benchmarks/generate-synthetic.py", "license": "CC0-1.0", "attribution": "ADPAI synthetic fixture generator; rendered Noto Sans CJK font"}],
                "ingredients": ingredients, "direct_allergens": direct,
                "caution_allergens": caution,
                "required_abstention": not direct and not caution,
            })
    (root / "labels.jsonl").write_text("".join(json.dumps(row, ensure_ascii=False)+"\n" for row in rows), encoding="utf8")
    print(f"Generated {len(rows)} SYNTHETIC captures from {len(CASES)} templates; 0 real packages: {root}")


if __name__ == "__main__":
    main()
