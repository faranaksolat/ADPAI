"""Private PC companion, separate from Pages/native on-device processing."""
import asyncio
import hmac
import os
from pathlib import Path
import tempfile
import logging
import secrets
import time
from threading import Lock

from fastapi import FastAPI, File, UploadFile, Request, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from .recognition import prepare_image, local_ocr

ROOT = Path(__file__).resolve().parents[1]
MAX_BODY = 32 * 1024 * 1024
MAX_PHOTO = 10 * 1024 * 1024
UPLOAD_SECONDS = 45
JOB = Lock()
RESULT_SECONDS = 300
JOBS = {}


class InvalidPhoto(Exception):
    pass


def cleanup_files(paths):
    for path in paths:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            # An OS/antivirus lock must not leave the inference slot locked.
            logging.getLogger('adpai.pc').warning('Temporary image cleanup failed; no image path or content is logged')


class PrivateAccess:
    """Authenticate and bound uploads before multipart parsing or model loading."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def private_send(message):
            if message["type"] == "http.response.start":
                message.setdefault("headers", []).extend([
                    (b"cache-control", b"no-store"), (b"referrer-policy", b"no-referrer"),
                    (b"x-content-type-options", b"nosniff"),
                    (b"content-security-policy", b"default-src 'self'; img-src 'self' blob: data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"),
                ])
            await send(message)

        submit = scope["path"] in {"/api/read", "/api/jobs"}
        poll = scope["path"].startswith("/api/jobs/")
        if not submit and not poll:
            return await self.app(scope, receive, private_send)
        headers = dict(scope["headers"])
        token = os.environ.get("ADPAI_PC_TOKEN", "")
        expected = ("Bearer " + token).encode()
        if len(token) < 32:
            return await JSONResponse({"detail": "Server pairing is not configured"}, status_code=503)(scope, receive, private_send)
        if not hmac.compare_digest(headers.get(b"authorization", b""), expected):
            return await JSONResponse({"detail": "Pair this browser using the private link"}, status_code=401)(scope, receive, private_send)
        if headers.get(b"sec-fetch-site") == b"cross-site":
            return await JSONResponse({"detail": "Use the server's own page"}, status_code=403)(scope, receive, private_send)
        if poll:
            if scope["method"] != 'GET':
                return await JSONResponse({"detail":"GET required"},status_code=405)(scope,receive,private_send)
            return await self.app(scope,receive,private_send)
        if scope["method"] != "POST":
            return await JSONResponse({"detail": "POST required"}, status_code=405)(scope, receive, private_send)
        try:
            length = int(headers.get(b"content-length", b"0"))
            if length < 0 or length > MAX_BODY:
                raise ValueError()
        except ValueError:
            return await JSONResponse({"detail": "Upload too large"}, status_code=413)(scope, receive, private_send)
        if not JOB.acquire(blocking=False):
            return await JSONResponse({"detail": "PC is still reading another photo; retry after it finishes"}, status_code=429)(scope, receive, private_send)
        scope["pc_job"] = {"handed_to_worker": False}
        try:
            chunks, size = [], 0
            try:
                async with asyncio.timeout(UPLOAD_SECONDS):
                    while True:
                        message = await receive()
                        if message["type"] == "http.disconnect":
                            return
                        chunk = message.get("body", b"")
                        size += len(chunk)
                        if size > MAX_BODY:
                            return await JSONResponse({"detail": "Upload too large"}, status_code=413)(scope, receive, private_send)
                        chunks.append(chunk)
                        if not message.get("more_body"):
                            break
            except TimeoutError:
                return await JSONResponse({"detail": "Upload timed out"}, status_code=408)(scope, receive, private_send)
            body = b"".join(chunks)
            delivered = False

            async def buffered_receive():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {"type": "http.request", "body": body, "more_body": False}
                return await receive()

            await self.app(scope, buffered_receive, private_send)
        finally:
            if not scope["pc_job"]["handed_to_worker"]:
                JOB.release()


app = FastAPI(title="ADPAI private PC pilot", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(PrivateAccess)
app.mount("/assets", StaticFiles(directory=ROOT / "assets"), name="assets")
app.mount("/src", StaticFiles(directory=ROOT / "src"), name="shared-rules")
app.mount("/client", StaticFiles(directory=Path(__file__).parent / "static"), name="client")


@app.get("/")
def home():
    return FileResponse(Path(__file__).parent / "static/index.html")


@app.get("/api/health")
def health():
    return {"service": "ADPAI private PC pilot", "paired_access_required": True,
            "pairing_configured": len(os.environ.get("ADPAI_PC_TOKEN", "")) >= 32,
            "busy": JOB.locked(), "model_inference_verified": False, "automatic_negative_results": False}


@app.post("/api/read")
async def read(request: Request, images: list[UploadFile] = File(...)):
    return await submit_read(request, images, background=False)


@app.post('/api/jobs')
async def create_job(request: Request, images: list[UploadFile] = File(...)):
    return await submit_read(request, images, background=True)


@app.get('/api/jobs/{job_id}')
async def poll_job(job_id: str):
    state = JOBS.get(job_id)
    if not state:
        raise HTTPException(404, 'This result expired or is unavailable; take a fresh reading')
    if state['state'] == 'running':
        return {'state':'running'}
    if 'error' in state:
        raise HTTPException(state['code'], state['error'])
    return {'state':'complete', 'result':state['result']}


def retain_job(task):
    job_id = secrets.token_urlsafe(24)
    state = {'state':'running', 'task':task}
    JOBS[job_id] = state

    def finished(done):
        state.pop('task', None)
        try:
            state['result'] = done.result()
        except InvalidPhoto:
            state.update(error='Photo could not be decoded or is too large', code=422)
        except (Exception, asyncio.CancelledError):
            state.update(error='PC recognition failed; no result was verified', code=503)
        state.update(state='complete', completed_at=time.monotonic())
        # Keep at most two completed text results, never a photo archive.
        completed = sorted(((key, value) for key,value in JOBS.items() if value['state']=='complete'),key=lambda pair:pair[1]['completed_at'])
        for key,_ in completed[:-2]:
            JOBS.pop(key, None)
        asyncio.get_running_loop().call_later(RESULT_SECONDS, JOBS.pop, job_id, None)

    task.add_done_callback(finished)
    return job_id


async def submit_read(request, images, *, background):
    paths = []
    handed = False
    try:
        if not 1 <= len(images) <= 3:
            raise HTTPException(422, "Use one to three photos of the same label or menu")
        for upload in images:
            data = await upload.read(MAX_PHOTO + 1)
            if len(data) > MAX_PHOTO:
                raise HTTPException(413, "Photo exceeds 10 MiB")
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as file:
                paths.append(Path(file.name))
                file.write(data)

        def job():
            try:
                try:
                    sizes = [prepare_image(path.read_bytes(), path) for path in paths]
                except Exception:
                    raise InvalidPhoto() from None
                return local_ocr(paths, sizes)
            finally:
                try:
                    cleanup_files(paths)
                finally:
                    JOB.release()

        # A disconnected/aborted browser does not stop Paddle. Hold the busy
        # slot and temporary images until the real worker has finished.
        task = asyncio.create_task(run_in_threadpool(job))
        handed = request.scope["pc_job"]["handed_to_worker"] = True
        if background:
            job_id = retain_job(task)
            return JSONResponse({'state':'running', 'job_id':job_id}, status_code=202)
        try:
            return await asyncio.shield(task)
        except asyncio.CancelledError:
            task.add_done_callback(lambda done: done.exception() if not done.cancelled() else None)
            raise
        except InvalidPhoto:
            raise HTTPException(422, "Photo could not be decoded or is too large") from None
        except Exception:
            raise HTTPException(503, "PC recognition failed; no result was verified") from None
    finally:
        if not handed:
            cleanup_files(paths)
