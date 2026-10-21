"""Actual local Paddle through the PC ASGI API; not Windows/tunnel/camera timing."""
import argparse
import hashlib
from importlib.metadata import version
import json
import os
from pathlib import Path
import secrets
import time

from fastapi.testclient import TestClient
from pc_server.main import app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    manifest = args.dataset.read_bytes()
    rows = [json.loads(line) for line in manifest.splitlines() if line.strip()]
    if not rows or any(r.get('reference_method') != 'model_visual_before_app_ocr' or r.get('human_reviewed') is not False for r in rows):
        raise ValueError('This is a model-visual development diagnostic, not human-reference scoring')
    root = args.dataset.parent.resolve()
    sha = lambda data: hashlib.sha256(data).hexdigest()
    images = {}
    for row in rows:
        if row['capture_id'] in images:
            raise ValueError('Duplicate capture')
        images[row['capture_id']] = []
        for image in row['images']:
            path = (root/image['path']).resolve()
            if not path.is_relative_to(root) or sha(path.read_bytes()) != image['sha256']:
                raise ValueError('Original image integrity failed')
            images[row['capture_id']].append((path, image['sha256']))
    repo = Path(__file__).resolve().parents[1]
    names = ['pc_server/main.py','pc_server/recognition.py','pc_server/static/core.js','src/menu.js','src/engine.js','requirements.txt','benchmarks/diagnose-pc.py']
    fingerprints = {name: sha((repo/name).read_bytes()) for name in names}
    args.output.mkdir(parents=True, exist_ok=False)
    for name in names:
        target=args.output/'source-snapshot'/name
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes((repo/name).read_bytes())
    (args.output/'initial-metadata.json').write_text(json.dumps({'status':'running; not a completed comparison','dataset_sha256':sha(manifest),'source_sha256':fingerprints,'cpu_threads':2},indent=2)+'\n')
    os.environ['ADPAI_PC_TOKEN'] = secrets.token_urlsafe(32)
    returned = []
    with TestClient(app) as client:
        for row in rows:
            start = time.monotonic()
            try:
                response = client.post('/api/read', headers={'Authorization':'Bearer '+os.environ['ADPAI_PC_TOKEN']},
                    files=[('images',(path.name,path.read_bytes(),'image/png' if path.suffix=='.png' else 'image/jpeg')) for path,_ in images[row['capture_id']]])
                value = response.json() if response.status_code == 200 else {'status':'unverified','sources':[],'errors':[]}
                error = None if response.status_code == 200 else 'http_'+str(response.status_code)
                if not error and not any(w['text'].strip() for s in value['sources'] for w in s['items']):
                    error = 'no_text_read'
            except Exception as failure:
                value={'status':'unverified','sources':[],'errors':[]};error=type(failure).__name__
            prediction = {'capture_id':row['capture_id'],**value,'ocr_errors':value['errors'],'error':error,
                          'api_inprocess_latency_ms':(time.monotonic()-start)*1000}
            returned.append(prediction)
            with (args.output/'predictions.jsonl').open('a') as file:
                file.write(json.dumps(prediction,ensure_ascii=False)+'\n')
            print(json.dumps({'capture_id':row['capture_id'],'error':error,'lines':sum(len(s['items']) for s in value['sources']),'latency_ms':prediction['api_inprocess_latency_ms']}),flush=True)
    assert args.dataset.read_bytes() == manifest
    for capture in images.values():
        for path,digest in capture:assert sha(path.read_bytes()) == digest
    if not all(sha((repo/name).read_bytes())==digest for name,digest in fingerprints.items()):
        (args.output/'INVALID.json').write_text(json.dumps({'status':'invalid_source_changed_during_run','no_final_accuracy_claim':True})+'\n')
        raise RuntimeError('Source changed during diagnostic; preserve partial output, do not claim final-source accuracy')
    metadata = {'kind':__doc__,'reference':'partial model-visual development, zero independent humans, no holdout or training',
        'dataset_sha256':sha(manifest),'source_sha256':fingerprints,'expected_captures':len(rows),'returned_captures':len(returned),
        'implementation':'TestClient -> real private /api/read -> normalization -> actual local Korean/Latin Paddle; saved-word menu scoring separate',
        'line_confidence_policy':'raw_line_score retained; word score zero, never manufactured calibration',
        'versions':{name:version(name) for name in ['paddlepaddle','paddleocr','paddlex','fastapi']},
        'latency':'Linux in-process API request only; includes decode/model startup. Not phone, Windows, real TCP gateway, Cloudflare or camera latency.'}
    cache = Path(os.environ.get('PADDLE_PDX_CACHE_HOME','/workspace/.cache/paddlex'))/'official_models'
    metadata['model_files_sha256']={str(p.relative_to(cache)):sha(p.read_bytes()) for model in ['PP-OCRv5_mobile_det','korean_PP-OCRv5_mobile_rec','latin_PP-OCRv5_mobile_rec'] for p in (cache/model).rglob('*') if p.is_file()}
    (args.output/'metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')


if __name__=='__main__':main()
