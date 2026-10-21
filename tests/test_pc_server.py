import asyncio
import io
import os
from pathlib import Path
import threading
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from PIL import Image
from pc_server.main import app, JOB, JOBS, PrivateAccess
from pc_server.recognition import local_ocr

TOKEN = "fixture-only-" + "x" * 40
AUTH = {"Authorization": "Bearer " + TOKEN}


def photo():
    stream = io.BytesIO()
    Image.new("RGB", (40, 30), "white").save(stream, "PNG")
    return stream.getvalue()


class PcServerTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"ADPAI_PC_TOKEN": TOKEN})
        self.env.start()
        self.addCleanup(self.env.stop)
        JOBS.clear()
        self.client = self.enterContext(TestClient(app))

    def upload(self, data=None, **kwargs):
        return self.client.post('/api/read', headers=AUTH, files={'images': ('photo.png', photo() if data is None else data, 'image/png')}, **kwargs)

    def test_authentication_precedes_body_parsing_and_unknown_scores_remain_unknown(self):
        with patch('pc_server.main.local_ocr') as inference:
            response = self.client.post('/api/read', content=b'not multipart')
            self.assertEqual(response.status_code, 401)
            inference.assert_not_called()
        self.assertFalse(JOB.locked())
        self.assertEqual(self.client.get('/').headers['cache-control'], 'no-store')
        self.assertIn("frame-ancestors 'none'", self.client.get('/').headers['content-security-policy'])
        self.assertEqual(self.client.get('/.git/config').status_code, 404)
        self.assertEqual(self.client.get('/client/../main.py').status_code, 404)

    def test_disabled_pairing_and_cross_site_requests_fail_closed(self):
        with patch.dict(os.environ, {'ADPAI_PC_TOKEN': ''}):
            self.assertEqual(self.upload().status_code, 503)
        response = self.client.post('/api/read', headers={**AUTH, 'Sec-Fetch-Site': 'cross-site'}, content=b'x')
        self.assertEqual(response.status_code, 403)

    def test_invalid_oversized_images_release_slot_and_never_load_models(self):
        with patch('pc_server.main.local_ocr') as inference:
            self.assertEqual(self.upload(b'not an image').status_code, 422)
            with patch('pc_server.main.MAX_BODY', 8):
                self.assertEqual(self.upload().status_code, 413)
            inference.assert_not_called()
        self.assertFalse(JOB.locked())

    def test_streaming_size_limit_without_content_length(self):
        async def check():
            entered = False
            async def downstream(scope, receive, send):
                nonlocal entered
                entered = True
            messages = iter([{'type':'http.request','body':b'12345','more_body':True}, {'type':'http.request','body':b'6789','more_body':False}])
            sent = []
            async def receive(): return next(messages)
            async def send(message): sent.append(message)
            scope = {'type':'http','path':'/api/read','method':'POST','headers':[(b'authorization', ('Bearer '+TOKEN).encode())]}
            with patch('pc_server.main.MAX_BODY', 8):
                await PrivateAccess(downstream)(scope, receive, send)
            self.assertFalse(entered)
            self.assertEqual(sent[0]['status'], 413)
        asyncio.run(check())
        self.assertFalse(JOB.locked())

    def test_slow_upload_times_out_and_releases_slot(self):
        async def check():
            sent=[]
            async def downstream(scope,receive,send):self.fail('Timed-out body reached parser')
            async def receive():
                await asyncio.sleep(.05)
                return {'type':'http.request','body':b'x','more_body':True}
            async def send(message):sent.append(message)
            scope={'type':'http','path':'/api/read','method':'POST','headers':[(b'authorization',('Bearer '+TOKEN).encode())]}
            with patch('pc_server.main.UPLOAD_SECONDS',.01):await PrivateAccess(downstream)(scope,receive,send)
            self.assertEqual(sent[0]['status'],408)
        asyncio.run(check());self.assertFalse(JOB.locked())

    def test_windows_style_cleanup_error_does_not_deadlock_the_server(self):
        seen=[]
        def result(paths,sizes):
            seen.extend(paths)
            return {'status':'unverified','sources':[],'errors':[],'automatic_negative_results':False}
        try:
            with patch('pc_server.main.local_ocr',side_effect=result), patch.object(Path,'unlink',side_effect=PermissionError('fixture locked file')), self.assertLogs('adpai.pc',level='WARNING'):
                response=self.upload()
            self.assertEqual(response.status_code,200);self.assertEqual(response.json()['status'],'unverified')
            self.assertFalse(JOB.locked())
        finally:
            for path in seen:path.unlink(missing_ok=True)

    def test_busy_rejection_failure_and_temporary_file_cleanup(self):
        paths_seen = []
        def fail(paths, sizes):
            paths_seen.extend(paths)
            self.assertTrue(all(p.exists() for p in paths))
            self.assertEqual(sizes, [(40, 30)])
            raise RuntimeError('private model error must not be returned')
        with patch('pc_server.main.local_ocr', side_effect=fail):
            response = self.upload()
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private model error', response.text)
        self.assertTrue(paths_seen)
        self.assertTrue(all(not p.exists() for p in paths_seen))
        self.assertFalse(JOB.locked())
        JOB.acquire()
        try:
            self.assertEqual(self.upload().status_code, 429)
        finally:
            JOB.release()

    def test_local_line_score_is_retained_but_never_assigned_to_a_word(self):
        class Engine:
            def predict(self, input):
                yield {'rec_texts':['Ingredients: milk, sugar', 'may contain soy'], 'rec_scores':[.99, .1], 'rec_polys':[[[0,0],[100,0],[100,20],[0,20]], [[0,30],[100,30],[100,50],[0,50]]]}
        with patch('pc_server.recognition.make_pc_engine', return_value=Engine()):
            result = local_ocr([Path('fixture.png')], [(100,100)])
        self.assertEqual(result['status'], 'unverified')
        self.assertFalse(result['automatic_negative_results'])
        self.assertEqual([w['score'] for w in result['sources'][0]['items']], [0,0])
        self.assertEqual([w['raw_line_score'] for w in result['sources'][0]['items']], [.99,.1])

    def test_background_job_is_private_pollable_and_expires_without_a_disk_archive(self):
        value={'status':'unverified','sources':[],'errors':[],'automatic_negative_results':False}
        with patch('pc_server.main.local_ocr',return_value=value),patch('pc_server.main.RESULT_SECONDS',.1):
            response=self.client.post('/api/jobs',headers=AUTH,files={'images':('p.png',photo(),'image/png')})
            self.assertEqual(response.status_code,202);job_id=response.json()['job_id']
            self.assertEqual(self.client.get('/api/jobs/'+job_id).status_code,401)
            for _ in range(50):
                result=self.client.get('/api/jobs/'+job_id,headers=AUTH)
                if result.json().get('state')=='complete':break
                threading.Event().wait(.001)
            self.assertEqual(result.json()['result'],value)
            threading.Event().wait(.15)
            self.assertEqual(self.client.get('/api/jobs/'+job_id,headers=AUTH).status_code,404)
        self.assertFalse(JOB.locked())

    def test_background_decode_or_model_failure_never_returns_a_safe_result(self):
        for data,code in [(b'invalid photo',422),(photo(),503)]:
            with patch('pc_server.main.local_ocr',side_effect=RuntimeError('fixture failed')):
                response=self.client.post('/api/jobs',headers=AUTH,files={'images':('p.png',data,'image/png')})
                self.assertEqual(response.status_code,202);job_id=response.json()['job_id']
                for _ in range(100):
                    result=self.client.get('/api/jobs/'+job_id,headers=AUTH)
                    if result.status_code!=200:break
                    threading.Event().wait(.001)
                self.assertEqual(result.status_code,code)
                self.assertNotIn('fixture failed',result.text)
        self.assertFalse(JOB.locked())

    def test_disconnected_browser_does_not_release_a_running_job_or_delete_its_image(self):
        started, finish = threading.Event(), threading.Event()
        paths_seen = []
        def slow(paths, sizes):
            paths_seen.extend(paths); started.set(); finish.wait(5)
            return {'status':'unverified','sources':[],'errors':[],'automatic_negative_results':False}
        async def check():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                task = asyncio.create_task(client.post('/api/read', headers=AUTH, files={'images':('p.png',photo(),'image/png')}))
                for _ in range(200):
                    if started.is_set(): break
                    await asyncio.sleep(.01)
                self.assertTrue(started.is_set())
                task.cancel()
                with self.assertRaises(asyncio.CancelledError): await task
                self.assertTrue(JOB.locked())
                self.assertTrue(paths_seen[0].exists())
                response = await client.post('/api/read', headers=AUTH, content=b'x')
                self.assertEqual(response.status_code, 429)
                finish.set()
                for _ in range(200):
                    if not JOB.locked(): break
                    await asyncio.sleep(.01)
                self.assertFalse(JOB.locked())
                self.assertFalse(paths_seen[0].exists())
        try:
            with patch('pc_server.main.local_ocr', side_effect=slow): asyncio.run(check())
        finally:
            finish.set()


if __name__ == '__main__':
    unittest.main()
