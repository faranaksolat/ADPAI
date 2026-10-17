import json
import unittest
from pathlib import Path

from backend.analysis import semantic_result
from backend.nutrition import extract_calories_from_text, extract_best_calories

FIXTURES = json.loads((Path(__file__).resolve().parent.parent / "shared/regressions.json").read_text(encoding="utf-8"))


class RegressionTests(unittest.TestCase):
    def test_allergen_fixtures(self):
        for case in FIXTURES["allergens"]:
            with self.subTest(case=case["name"]):
                sources = {}
                for source in case["sources"]:
                    sources.setdefault(source["familyId"], []).extend(source["items"])
                result = semantic_result(1,sources,case["profile"])
                self.assertEqual(result["status"],case["status"])
                self.assertEqual(sorted({h["allergen_id"] for h in result["direct_matches"]}),case["direct"])
                self.assertEqual(sorted({h["allergen_id"] for h in result["caution_matches"]}),case["caution"])
                self.assertFalse(result["coverage"]["complete"])

    def test_nutrition_fixtures(self):
        for case in FIXTURES["nutrition"]:
            with self.subTest(case=case["name"]):
                self.assertEqual(extract_calories_from_text(case["text"])["package_kcal"],case["expected"])

    def test_conflicting_ocr(self):
        self.assertIsNone(extract_best_calories({"latin":["Net weight 100 g. Per 100 g 300 kcal"],"korean":["Net weight 100 g. Per 100 g 500 kcal"]})["package_kcal"])

    def test_photos_keep_their_context_and_numeric_scope(self):
        sources={"latin":[{"text":"INGREDIENTS: sugar", "score":.95, "photoIndex":0},
                          {"text":"Milk chocolate sold separately", "score":.95, "photoIndex":1}]}
        result=semantic_result(1,sources,{"allergens":["milk"]})
        self.assertEqual(result["status"],"unverified")
        self.assertEqual(result["direct_matches"],[])
        calories=extract_best_calories({"latin":[{"text":"Net weight 100 g", "photoIndex":0},
                                                {"text":"Per 100 g 500 kcal", "photoIndex":1}]})
        self.assertIsNone(calories["package_kcal"])


if __name__ == "__main__":
    unittest.main()
