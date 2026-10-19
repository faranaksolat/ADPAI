import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("collect_menus", Path(__file__).resolve().parent.parent / "benchmarks/collect-menus.py")
menus = importlib.util.module_from_spec(spec)
spec.loader.exec_module(menus)


def metadata(license_url="https://creativecommons.org/licenses/by-sa/4.0/"):
    return {"pageid": 123, "title": "File:Schema fixture only.png", "imageinfo": [{
        "url": "https://upload.wikimedia.org/fixture.png", "descriptionurl": "https://commons.wikimedia.org/wiki/File:Fixture.png",
        "mime": "image/png", "size": 100,
        "extmetadata": {key: {"value": value} for key, value in {
            "LicenseUrl": license_url, "LicenseShortName": "CC BY-SA4.0", "Artist": "fixture author"}.items()}}]}


class MenuCollectionTests(unittest.TestCase):
    def test_missing_author_nonreusable_license_and_foreign_hosts_are_rejected(self):
        self.assertIsNotNone(menus.candidate(metadata()))
        for license_url in ["https://example.org/CC-BY-SA-4.0", "https://creativecommons.org/licenses/by-nc/4.0/", ""]:
            self.assertIsNone(menus.candidate(metadata(license_url)))
        row = metadata()
        row["imageinfo"][0]["extmetadata"].pop("Artist")
        self.assertIsNone(menus.candidate(row))
        self.assertFalse(menus.approved("https://upload.wikimedia.org.evil.invalid/image"))
        self.assertFalse(menus.approved("http://upload.wikimedia.org/image"))

    def test_access_failure_stops_without_retry_and_does_not_forge_a_dataset(self):
        calls = []
        def denied(url):
            calls.append(url)
            raise OSError("fixture network403")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)/"new"
            result = menus.collect(root, 10, getter=denied, delay=0)
            self.assertEqual(len(calls), 1)
            self.assertEqual(result["status"], "blocked_or_failed")
            self.assertEqual(result["downloaded_original_images"], 0)
            self.assertEqual(result["scored_real_menus"], 0)
            self.assertFalse((root/"candidates-UNREVIEWED.jsonl").exists())
            self.assertEqual(json.loads((root/"collection-report.json").read_text())["status"], "blocked_or_failed")
            with self.assertRaises(FileExistsError):
                menus.collect(root, 10, getter=denied, delay=0)


if __name__ == "__main__":
    unittest.main()
