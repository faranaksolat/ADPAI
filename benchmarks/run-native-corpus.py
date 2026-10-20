"""Optional Android engine diagnostic on an explicitly selected test device.
Installs already-built debug APKs without uninstalling or wiping user profiles.
Prepared licensed development images remain separate from APK assets.
"""
import argparse, hashlib, io, json, os, re, subprocess, tarfile, time
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', required=True, type=Path)
parser.add_argument('--output', required=True, type=Path)
parser.add_argument('--serial', required=True)
parser.add_argument('--kind', choices=['menu', 'label'], required=True)
parser.add_argument('--adb', default=os.environ.get('ANDROID_HOME', '') + '/platform-tools/adb')
args = parser.parse_args()
repo = Path(__file__).resolve().parent.parent
root = args.input.resolve()
manifest_bytes = (root / 'manifest.json').read_bytes()
records = [row for row in json.loads(manifest_bytes) if row['kind'] == args.kind]
if not records:
    raise SystemExit('Selected corpus has zero images')
sha = lambda data: hashlib.sha256(data).hexdigest()
images = {}
for row in records:
    name = row['file']
    if not re.fullmatch(r'[a-zA-Z0-9_-]+\.(png|jpg|jpeg)', name):
        raise SystemExit('Invalid prepared filename')
    data = (root / name).read_bytes()
    if sha(data) != row['sha256']:
        raise SystemExit('Prepared image hash mismatch')
    images[name] = data

def adb(*command, input=None, timeout=180):
    return subprocess.run([args.adb, '-s', args.serial, *command], input=input,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, check=True).stdout

if adb('shell', 'getprop', 'sys.boot_completed').decode().strip() != '1':
    raise SystemExit('Test Android has not completed boot; no inference was run')
args.output.mkdir(parents=True, exist_ok=False)
apk = repo / 'android/app/build/outputs/apk/debug/app-debug.apk'
tests = repo / 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'
started = time.time()
for package in [apk, tests]:
    result = adb('install', '-r', str(package), timeout=300).decode()
    if 'Success' not in result:
        raise SystemExit('Install was not confirmed; no automatic uninstall is attempted')
adb('shell', 'run-as', 'io.github.faranaksolat.adpai', 'mkdir', '-p', 'files/recognition-corpus')
stream = io.BytesIO()
with tarfile.open(fileobj=stream, mode='w') as archive:
    for name, data in {**images, 'manifest.json': (json.dumps(records) + '\n').encode()}.items():
        info = tarfile.TarInfo(name); info.size = len(data)
        archive.addfile(info, io.BytesIO(data))
adb('exec-in', 'run-as', 'io.github.faranaksolat.adpai', 'tar', '-x', '-C', 'files/recognition-corpus', input=stream.getvalue())
failure = None
try:
    result = adb('shell', 'am', 'instrument', '-w', '-r', '-e', 'class',
                 'io.github.faranaksolat.adpai.RecognitionCorpusTest', '-e', 'adpaiCorpus', 'true',
                 'io.github.faranaksolat.adpai.test/androidx.test.runner.AndroidJUnitRunner', timeout=max(300, len(records) * 150)).decode()
except subprocess.SubprocessError as error:
    failure = str(error)
    result = (getattr(error, 'stdout', None) or b'').decode(errors='replace')
(args.output / 'instrumentation.txt').write_text(result)
try:
    raw = adb('exec-out', 'run-as', 'io.github.faranaksolat.adpai', 'cat', 'files/recognition-corpus/predictions.jsonl')
except subprocess.SubprocessError as error:
    failure = (failure or '') + '\nRaw predictions unavailable: ' + str(error)
    raw = b''
(args.output / 'predictions.jsonl').write_bytes(raw)
predictions = [json.loads(line) for line in raw.splitlines() if line.strip()]
if len({p['capture_id'] for p in predictions}) != len(predictions):
    raise SystemExit('Duplicate native prediction; incomplete diagnostic')
for key in ['capture_id', 'image_sha256']:
    if any(prediction[key] != next(row['sha256' if key == 'image_sha256' else key] for row in records if row['capture_id'] == prediction['capture_id']) for prediction in predictions):
        raise SystemExit('Native result identity/integrity failure')
files = ['android/app/src/main/java/io/github/faranaksolat/adpai/NativeTextReader.java',
         'android/app/src/main/java/io/github/faranaksolat/adpai/AdpaiTextPlugin.java',
         'android/app/src/androidTest/java/io/github/faranaksolat/adpai/RecognitionCorpusTest.java',
         'src/image.js', 'src/native-ocr.js', 'src/engine.js', 'src/menu.js']
metadata = {'kind': 'Android native ENGINE diagnostic; shared-rule replay is separate; not phone/camera or full Capacitor UI timing',
            'reference': 'Frozen partial model-visual development only; zero independent human reviewers',
            'test_target': 'Android emulator' if args.serial.startswith('emulator-') else 'explicit test device',
            'sdk': adb('shell', 'getprop', 'ro.build.version.sdk').decode().strip(),
            'expected_captures': len(records), 'returned_captures': len(predictions),
            'instrumentation_success': not failure and 'OK (1 test)' in result and 'FAILURES' not in result,
            'runner_failure': failure,
            'missing_captures': sorted({r['capture_id'] for r in records} - {p['capture_id'] for p in predictions}),
            'prepared_manifest_sha256': sha(manifest_bytes), 'raw_predictions_sha256': sha(raw),
            'apk_sha256': sha(apk.read_bytes()), 'test_apk_sha256': sha(tests.read_bytes()),
            'source_sha256': {name: sha((repo / name).read_bytes()) for name in files},
            'elapsed_host_ms': (time.time() - started) * 1000,
            'limitations': 'Software emulator timings are not phone latency. Browser-preprocessed PNGs use the same resize/decoder function; native bridge, camera and WebView inference routing require separate validation. Failed/missing captures stay in denominators.'}
(args.output / 'metadata.json').write_text(json.dumps(metadata, indent=2) + '\n')
print(json.dumps({key: metadata[key] for key in ['expected_captures', 'returned_captures', 'instrumentation_success']}), flush=True)
if not metadata['instrumentation_success'] or len(predictions) != len(records):
    raise SystemExit('Native diagnostic incomplete; preserve partial output')
