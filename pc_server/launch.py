"""Start a paired loopback server, optionally behind a temporary HTTPS tunnel.

No router ports, global firewall rules, TLS bypasses or store publication.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import queue
import re
import secrets
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import venv
import webbrowser

ROOT = Path(__file__).resolve().parents[1]


def environment_python():
    directory = ROOT / ".venv-pc"
    executable = directory / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not executable.exists():
        venv.EnvBuilder(with_pip=True).create(directory)
    requirements = ROOT / "requirements.txt"
    fingerprint = hashlib.sha256(requirements.read_bytes()).hexdigest()
    marker = directory / "pc-requirements.sha256"
    if not marker.exists() or marker.read_text().strip() != fingerprint:
        subprocess.run([str(executable), "-m", "pip", "install", "-r", str(requirements)], check=True)
        marker.write_text(fingerprint + "\n")
    return str(executable)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--install", action="store_true", help="Create only the project .venv-pc and install pinned requirements")
    parser.add_argument("--python", default=sys.executable)
    parser.add_argument("--share", action="store_true", help="Run installed official cloudflared for a temporary HTTPS URL")
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Use a port between 1024 and 65535")
    tunnel_program = shutil.which("cloudflared") if args.share else None
    if args.share and not tunnel_program:
        raise SystemExit("Install official cloudflared first: winget install --id Cloudflare.cloudflared -e\nThen reopen the terminal and run again. No router/firewall changes are required.")
    python = environment_python() if args.install else args.python
    token = secrets.token_urlsafe(32)
    env = os.environ.copy()
    env["ADPAI_PC_TOKEN"] = token
    env.setdefault("PADDLE_PDX_MODEL_SOURCE", "BOS")
    env.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
    cache = (Path(os.environ.get("LOCALAPPDATA", str(ROOT / ".cache"))) / "ADPAI" / "models")
    env.setdefault("PADDLE_PDX_CACHE_HOME", str(cache))
    env.setdefault("OMP_NUM_THREADS", "2")
    server = tunnel = None
    origin = f"http://127.0.0.1:{args.port}"
    try:
        # Never publish a pre-existing unrelated service on the selected port.
        import socket
        with socket.socket() as check:
            if check.connect_ex(("127.0.0.1", args.port)) == 0:
                raise RuntimeError("Port is already in use; stop the other service or choose --port")
        server = subprocess.Popen([python, "-m", "uvicorn", "pc_server.main:app", "--host", "127.0.0.1", "--port", str(args.port), "--workers", "1", "--limit-concurrency", "8", "--timeout-keep-alive", "5", "--no-access-log"], cwd=ROOT, env=env)
        deadline = time.monotonic() + 60
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        while True:
            if server.poll() is not None:
                raise RuntimeError("The PC server failed to start; read its error above")
            try:
                with opener.open(origin + "/api/health", timeout=2) as response:
                    health = json.load(response)
                if health.get("service") == "ADPAI private PC pilot" and health.get("pairing_configured"):
                    break
            except OSError:
                pass
            if time.monotonic() >= deadline:
                raise RuntimeError("PC server startup timed out")
            time.sleep(.25)
        local_link = origin + "/#token=" + token
        print("PRIVATE PC LINK (do not post publicly): " + local_link, flush=True)
        if not args.no_browser:
            webbrowser.open(local_link)
        if args.share:
            print("Remote test mode: photos pass through Cloudflare to this PC. No cloud AI API is used. Keep this window and PC running.", flush=True)
            tunnel = subprocess.Popen([tunnel_program, "--no-autoupdate", "tunnel", "--url", origin], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            lines = queue.Queue(maxsize=128)

            def read_tunnel():
                for line in tunnel.stdout:
                    try:
                        lines.put_nowait(line)
                    except queue.Full:
                        pass

            threading.Thread(target=read_tunnel, daemon=True).start()
            deadline = time.monotonic() + 90
            remote = None
            while not remote:
                if tunnel.poll() is not None or server.poll() is not None:
                    raise RuntimeError("Remote tunnel or PC server stopped")
                try:
                    line = lines.get(timeout=.5)
                    match = re.search(r"https://[a-z0-9]+(?:-[a-z0-9]+){2,}\.trycloudflare\.com\b", line)
                    if match:
                        remote = match.group(0)
                except queue.Empty:
                    pass
                if time.monotonic() >= deadline:
                    raise RuntimeError("No temporary HTTPS link was returned. The local server will be stopped; do not open a router port.")
            print("PRIVATE PHONE LINK (copy the complete link, including #token): " + remote + "/#token=" + token, flush=True)
        print("Ctrl+C stops the server and tunnel. Recognition is experimental; no safe food result is provided.", flush=True)
        while server.poll() is None:
            if tunnel and tunnel.poll() is not None:
                raise RuntimeError("Tunnel stopped; restart to get a new private link")
            time.sleep(.5)
    except KeyboardInterrupt:
        pass
    finally:
        for child in (tunnel, server):
            if child and child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()


if __name__ == "__main__":
    main()
