"""Export separate BLANK human-review packets; never copy app/model transcripts."""
import argparse
import hashlib
import html
import json
from pathlib import Path
import shutil
from urllib.parse import urlsplit

from PIL import Image


def export(manifests, output, include=None):
    output = Path(output)
    rows, hashes, captures, duplicates = [], set(), set(), []
    images = []
    for manifest in map(Path, manifests):
        root = manifest.parent.resolve()
        for record in map(json.loads, filter(str.strip, manifest.read_text().splitlines())):
            capture = record.get('capture_id', record.get('source_id'))
            if include and capture not in include:
                continue
            if not capture or not all(c.isalnum() or c in '-_' for c in capture) or capture in captures:
                raise ValueError('Unsafe or duplicate capture identity')
            captures.add(capture)
            originals = record.get('images') or [record]
            if len(originals) != 1:
                raise ValueError('Review packet currently expects one image per capture')
            image = originals[0]
            path = (root / image['path']).resolve()
            if not path.is_relative_to(root) or hashlib.sha256(path.read_bytes()).hexdigest() != image['sha256']:
                raise ValueError('Image path or integrity failed')
            if not all(image.get(k) for k in ['source_url', 'license', 'attribution']):
                raise ValueError('Source rights must accompany each image')
            if urlsplit(image['source_url']).scheme != 'https':
                raise ValueError('Original source must use HTTPS')
            if image['sha256'] in hashes:
                duplicates.append(capture)
                continue
            hashes.add(image['sha256'])
            with Image.open(path) as decoded:
                width, height = decoded.size
                if decoded.format not in {'PNG', 'JPEG'}:
                    raise ValueError('Unsupported original image')
                extension = '.png' if decoded.format == 'PNG' else '.jpg'
            filename = capture + extension
            images.append((path, filename))
            # Earlier model-visual entries, allergen hints, OCR and venue guesses
            # are deliberately absent from both independent blank worksheets.
            rows.append({'schema': 'adpai-menu-human-review-v1', 'capture_id': capture,
                         'kind': 'real_menu_candidate', 'split': 'unassigned',
                         'restaurant_group_id': '', 'menu_edition_group_id': '',
                         'restaurant': {'name': '', 'country': '', 'location_evidence': {'source_url': '', 'quote': ''}},
                         'languages': [], 'images': [{'path': 'images/' + filename, 'sha256': image['sha256'],
                             'width': width, 'height': height, 'source_url': image['source_url'],
                             'license': image['license'], 'attribution': image['attribution'], 'transcript': ''}],
                         'entries': None, 'page_warnings': None, 'unreadable_regions': None,
                         'complete_visible_text_reviewed': None, 'required_abstention': None,
                         'annotation': {'status': 'unreviewed', 'reviewer_id': '', 'adjudicator_id': '', 'notes': ''}})
    if not rows:
        raise ValueError('Zero eligible captures; no review packet created')
    output.mkdir(parents=True, exist_ok=False)
    (output/'images').mkdir()
    for path, filename in images:
        shutil.copyfile(path, output/'images'/filename)
    for reviewer in ['reviewer-A', 'reviewer-B']:
        folder = output/reviewer
        folder.mkdir()
        (folder/'references-UNREVIEWED.jsonl').write_text(''.join(json.dumps(row, ensure_ascii=False)+'\n' for row in rows))
    cards = ['<!doctype html><meta charset="utf-8"><title>ADPAI unreviewed menu packet</title><h1>Independent review required</h1><p>Blank worksheets contain no OCR or previous model references. Language and country require verification. Do not infer ingredients from recipes or food photos.</p>']
    for row in rows:
        image = row['images'][0]
        cards.append(f'<h2>{html.escape(row["capture_id"])}</h2><p>{html.escape(image["attribution"])} · {html.escape(image["license"])}</p><p><a href="{html.escape(image["source_url"], quote=True)}">Original source</a></p><a href="{image["path"]}"><img src="{image["path"]}" width="600" alt="Menu candidate requiring independent review"></a>')
    (output/'index.html').write_text('\n'.join(cards))
    report = {'captures': len(rows), 'separate_blank_packets': 2, 'completed_human_reviewers': 0,
              'adjudicated_references': 0, 'train_records': 0, 'test_records': 0,
              'duplicate_images_excluded': duplicates,
              'status': 'UNREVIEWED; cannot train, score CER/WER or certify accuracy',
              'input_manifest_sha256': {str(p): hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in manifests}}
    (output/'packet-status.json').write_text(json.dumps(report, indent=2)+'\n')
    (output/'REVIEW-INSTRUCTIONS.txt').write_text('''Use two real independent Korean/English reviewers; A/B folders are not reviewer identities or proof of human review. Verify country from a cited source, not language. Transcribe original visible text, mark unreadable regions, printed titles/aliases, ingredient quotes and boxes, direct vs precautionary allergen words, negations and global cautions. Do not copy OCR/model answers into references. Do not infer ingredients from latte/ice cream/pasta names or food photos. Empty annotations mean unknown, never allergen-free. Keep both first drafts before adjudication. Assign actual restaurant/chain and menu-edition groups before a venue-separated split; keep repeated pages together. These blank records intentionally fail existing benchmark reference validators. No training or held-out accuracy is enabled by this export. Preserve original source rights.\n''')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', action='append', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--include-id', action='append')
    args = parser.parse_args()
    print(json.dumps(export(args.manifest, args.output, set(args.include_id or []))))
