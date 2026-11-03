import unittest
from tools.offline_dish_lookup import build_index, lookup

class LookupTests(unittest.TestCase):
    def setUp(self):
        # Fictional fixtures: never food/allergen ground truth.
        self.rows = [{"dish_id": "fixture-1", "aliases": ["테스트 음식"],
                      "typical_ingredients": ["fixture ingredient"],
                      "sources": ["test fixture"]}]

    def test_matching_does_not_claim_actual_ingredients(self):
        result = lookup("  테스트   음식 ", build_index(self.rows))
        self.assertEqual(result["match_status"], "matched")
        self.assertFalse(result["actual_ingredients_verified"])
        self.assertTrue(result["requires_restaurant_confirmation"])

    def test_unseen_or_negated_dish_is_unknown(self):
        index = build_index(self.rows)
        for text in ["unknown", "테스트 음식 제외", ""]:
            self.assertEqual(lookup(text, index)["match_status"], "unknown")

    def test_ambiguous_alias_does_not_choose_recipe(self):
        rows = self.rows + [dict(self.rows[0], dish_id="fixture-2")]
        result = lookup("테스트 음식", build_index(rows))
        self.assertEqual(result["match_status"], "ambiguous")
        self.assertEqual(result["typical_ingredients"], [])

    def test_unsourced_records_rejected(self):
        with self.assertRaises(ValueError):
            build_index([dict(self.rows[0], sources=[])])

if __name__ == "__main__":
    unittest.main()
