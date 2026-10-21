"""Actual async-job OCR on an authored label; not package/device accuracy."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import secrets
import time

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, ImageFont
from .main import app


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=False)
    repo=Path(__file__).resolve().parents[1]
    names=['pc_server/main.py','pc_server/recognition.py','pc_server/static/core.js','pc_server/static/client.js','pc_server/smoke.py','requirements.txt']
    sha=lambda data:hashlib.sha256(data).hexdigest()
    hashes={name:sha((repo/name).read_bytes()) for name in names}
    image=Image.new('RGB',(1400,380),'white');draw=ImageDraw.Draw(image);font=ImageFont.load_default(size=48)
    draw.text((35,45),'INGREDIENTS: MILK, SUGAR, WHEAT',fill='black',font=font)
    draw.text((35,145),'CONTAINS: MILK',fill='black',font=font)
    stream=io.BytesIO();image.save(stream,'PNG');data=stream.getvalue()
    (args.output/'authored-label.png').write_bytes(data)
    token=secrets.token_urlsafe(32);os.environ['ADPAI_PC_TOKEN']=token;headers={'Authorization':'Bearer '+token}
    started=time.monotonic();polls=0
    with TestClient(app) as client:
        submission=client.post('/api/jobs',headers=headers,files={'images':('generated.png',data,'image/png')})
        submitted_ms=(time.monotonic()-started)*1000
        assert submission.status_code==202
        job_id=submission.json()['job_id']
        deadline=time.monotonic()+180
        while True:
            response=client.get('/api/jobs/'+job_id,headers=headers);polls+=1
            assert response.status_code==200,response.status_code
            state=response.json()
            if state['state']=='complete':break
            if time.monotonic()>deadline:raise RuntimeError('Generated-label recognition timed out')
            time.sleep(.5)
    result=state['result']
    report={'kind':__doc__,'generated_fixture_only':True,'image_sha256':sha(data),'source_sha256':hashes,
        'http_submit_status':submission.status_code,'submit_latency_ms':submitted_ms,
        'linux_inprocess_completion_ms':(time.monotonic()-started)*1000,'polls':polls,'response':result,
        'milk_read':any('MILK' in word['text'].upper() for source in result['sources'] for word in source['items']),
        'limitations':'Actual models through background-job API; no Windows, TCP/Cloudflare, camera or physical phone validation. Authored text is not a food-package benchmark.'}
    assert all(sha((repo/name).read_bytes())==digest for name,digest in hashes.items()),'Source changed during smoke'
    (args.output/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    assert result['status']=='unverified' and result['automatic_negative_results'] is False
    assert report['milk_read']
    print(json.dumps({key:report[key] for key in ['http_submit_status','submit_latency_ms','linux_inprocess_completion_ms','polls','milk_read']}))


if __name__=='__main__':main()
