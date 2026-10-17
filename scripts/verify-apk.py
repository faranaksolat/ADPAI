"""Check the APK contains every final web asset, with the right name and bytes.

Compilation alone does not catch AAPT transformations of assets such as .gz.
Run after build:android:debug, before uploading or distributing the APK.
"""
import argparse
import hashlib
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--apk", type=Path, default=root / "android/app/build/outputs/apk/debug/app-debug.apk")
args = parser.parse_args()
files = [path for path in (root / "dist").rglob("*") if path.is_file()]
if not files:
    raise SystemExit("Build dist/ first")
with zipfile.ZipFile(args.apk) as archive:
    for path in files:
        name = "assets/public/" + path.relative_to(root / "dist").as_posix()
        if name not in archive.namelist():
            raise SystemExit(f"Missing APK asset: {name}")
        if archive.read(name) != path.read_bytes():
            raise SystemExit(f"APK asset differs from build: {name}")
    if any("/.env" in name or "/backend/" in name or "/.git/" in name for name in archive.namelist()):
        raise SystemExit("Private/source-only file in APK")
print(f"PASS: {len(files)} APK web assets match dist/ exactly")
print(f"APK SHA-256: {hashlib.sha256(args.apk.read_bytes()).hexdigest()}")
