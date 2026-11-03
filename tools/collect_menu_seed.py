"""Download a revision-pinned public menu seed; never invent OCR labels.
Run: python tools/collect_menu_seed.py --output benchmarks/data/menu-seed
Requires Pillow. Output directory must be new; partial failures are reported.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import time
import urllib.parse
import urllib.request
from PIL import Image

REPO = 'HumynLabs/Korean_Menus_Image_Dataset'
REV = '7e4d633bcd59b16278f43219e1df212a56916832'
BASE = f'https://huggingface.co/datasets/{REPO}/resolve/{REV}/'
LIMIT = 15 * 1024 * 1024

def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'ADPAI-dataset-preparation/1.0'})
    with urllib.request.urlopen(request, timeout=45) as response:
        data = response.read(LIMIT + 1)
    if len(data) > LIMIT:
        raise ValueError('Download exceeds size limit')
    return data

def image_info(data):
    with Image.open(io.BytesIO(data)) as im:
        if im.width * im.height > 20_000_000:
            raise ValueError('Image exceeds pixel limit')
        im.verify()
    with Image.open(io.BytesIO(data)) as im:
        im.load()
        return im.size

def collect(output, fetcher=fetch, count=18, pause=1):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    (output / 'images').mkdir()
    records, seen = [], {}
    try:
        card = fetcher(BASE + 'README.md')
        (output / 'SOURCE-README.md').write_bytes(card)
    except Exception as exc:
        (output / 'source-error.json').write_text(json.dumps({'error_type': type(exc).__name__}))
        raise RuntimeError('Source card unavailable; collection stopped') from exc
    for n in range(1, count + 1):
        name = f'Kgen_Korean Menus_1005_{n}.JPEG'
        url = BASE + urllib.parse.quote(name)
        row = {'image_id': f'humyn-{n:03d}', 'source_url': url,
               'source_dataset': REPO, 'source_revision': REV,
               'creator': 'HumynLabs (publisher)', 'license_declared': 'CC-BY-4.0',
               'license_url': 'https://creativecommons.org/licenses/by/4.0/',
               'restaurant_id': None, 'split': 'unassigned', 'human_reviewed': False,
               'training_ready': False, 'regions': [], 'ingredient_evidence': []}
        try:
            data = fetcher(url)
            width, height = image_info(data)
            digest = hashlib.sha256(data).hexdigest()
            row.update(sha256=digest, width=width, height=height)
            if digest in seen:
                row.update(status='duplicate', duplicate_of=seen[digest])
            else:
                filename = f'images/{digest}.jpg'
                (output / filename).write_bytes(data)
                row.update(status='downloaded', image_path=filename)
                seen[digest] = row['image_id']
        except Exception as exc:
            row.update(status='failed', error_type=type(exc).__name__)
        records.append(row)
        with (output / 'manifest.jsonl').open('a', encoding='utf-8') as stream:
            stream.write(json.dumps(row, ensure_ascii=False) + '\n')
        time.sleep(pause)
    summary = {key: sum(r['status'] == key for r in records)
               for key in ('downloaded', 'duplicate', 'failed')}
    summary.update(annotated=0, trained=False, complete=summary['failed'] == 0)
    (output / 'summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    return summary

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    result = collect(args.output)
    print(json.dumps(result))
    raise SystemExit(0 if result['complete'] else 1)
