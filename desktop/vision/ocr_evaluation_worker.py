"""One offline EN candidate evaluation. VI is required but this model cannot cover it."""
import hashlib
import json
import math
import os
import re
import resource
import struct
import subprocess
import stat
import sys
import time
import traceback

_STAGE = 'ADMISSION'
_BLOCKED_EVENT = None

MODEL = 'en_PP-OCRv5_mobile_rec'
MODEL_ROOT = '/tmp/auto-p4-ocr-model-v1/english'
MODEL_FILES = {
    'inference.pdiparams': (7772315, '3ec8a97ed6cefe8568d3e2ee90bb193299b566a7661aa4fd52d224b96b59f66b'),
    'inference.json': (217712, 'fd1b6ec722ea841a72d3ba43e527df1d1066d5d7808e0503ee3eec7265188753'),
    'inference.yml': (3964, '27e91d0582f40168aa218303c76e184bc78fa7a5d105aad0cfbad8458b441067'),
}
MODEL_SHA256 = 'e595b4cf2ffad19fbb5a61ba345d63939577a3ab8717b6e5995642590c9101b4'
KEYS = ('version', 'kind', 'requestId', 'captureId', 'deviceId', 'bindingId',
        'generation', 'orientationEpoch', 'language', 'sourcePixelSha256',
        'inputSha256', 'width', 'height', 'inputBytes')


def canonical(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            raise ValueError('DUPLICATE_KEY')
        result[key] = value
    return result


def integer(value, low, high):
    return type(value) is int and low <= value <= high


def envelope(stream):
    prefix = stream.read(4)
    if len(prefix) != 4:
        raise ValueError('FRAME')
    length = struct.unpack('<I', prefix)[0]
    if not 1 <= length <= 4096:
        raise ValueError('FRAME')
    raw = stream.read(length)
    header = json.loads(raw.decode('utf-8'), object_pairs_hook=pairs,
                        parse_constant=lambda _: (_ for _ in ()).throw(ValueError('NUMBER')))
    if type(header) is not dict or tuple(header) != KEYS or canonical(header) != raw:
        raise ValueError('HEADER')
    if type(header['version']) is not int or header['version'] != 1 or header['kind'] != 'OCR_EVALUATION':
        raise ValueError('VERSION')
    for key in ('requestId', 'captureId', 'deviceId', 'bindingId'):
        if type(header[key]) is not str or re.fullmatch(r'[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}', header[key]) is None:
            raise ValueError('ID')
    for key in ('sourcePixelSha256', 'inputSha256'):
        if type(header[key]) is not str or re.fullmatch(r'[0-9a-f]{64}', header[key]) is None:
            raise ValueError('HASH')
    if not all(integer(header[k], 0, 9007199254740991) for k in ('generation', 'orientationEpoch')):
        raise ValueError('GENERATION')
    w, h = header['width'], header['height']
    if not integer(w, 1, 2048) or not integer(h, 1, 256) or w*h > 524288:
        raise ValueError('IMAGE_LIMIT')
    if not integer(header['inputBytes'], 4, 2097152) or header['inputBytes'] != w*h*4:
        raise ValueError('IMAGE_LIMIT')
    if header['language'] not in ('EN', 'VI') or type(header['language']) is not str:
        raise ValueError('LANGUAGE')
    data = stream.read(header['inputBytes'] + 1)
    if len(data) != header['inputBytes'] or stream.read(1) or hashlib.sha256(data).hexdigest() != header['inputSha256']:
        raise ValueError('PAYLOAD')
    if any(value != 255 for value in data[3::4]):
        raise ValueError('ALPHA')
    return header, data


def admit_model():
    if os.path.realpath(MODEL_ROOT) != MODEL_ROOT or set(os.listdir(MODEL_ROOT)) != set(MODEL_FILES):
        raise ValueError('MODEL_UNAVAILABLE')
    for name, (length, expected) in MODEL_FILES.items():
        path = os.path.join(MODEL_ROOT, name)
        before = os.lstat(path)
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            opened = os.fstat(fd)
            if not stat.S_ISREG(opened.st_mode) or opened.st_size != length:
                raise ValueError('MODEL_UNAVAILABLE')
            data = bytearray()
            while len(data) < length:
                part = os.read(fd, min(65536, length-len(data)))
                if not part:
                    raise ValueError('MODEL_UNAVAILABLE')
                data.extend(part)
            if os.read(fd, 1) or hashlib.sha256(data).hexdigest() != expected:
                raise ValueError('MODEL_UNAVAILABLE')
            def identity(s):
                return s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns
            if identity(before) != identity(opened) or identity(os.fstat(fd)) != identity(opened) or identity(os.lstat(path)) != identity(opened):
                raise ValueError('MODEL_UNAVAILABLE')
        finally:
            os.close(fd)


PROBE_TOOLS = (
    ('/bin/sh', '/usr/bin/dash', 'a6f559e00b69a4aa4d8cb607be18d9386c5aee55c509e2c075549dcf00e00fc7'),
    ('/bin/bash', '/usr/bin/bash', '223fe8564b60636bc738b6178d3ba9a50ef7d791266b0efae6363bb716e4c47f'),
    ('/usr/bin/ldd', '/usr/bin/ldd', '7bcd61a279946cb376d36fd91f4938ab4f4aba48e793c652a9797319d23f8dd3'),
    ('/usr/bin/awk', '/usr/bin/mawk', 'eff9f2b711eb5bee1b58d4d33b891e8da8f6534655d3854a45bd10217dbb28e6'),
    ('/usr/bin/cat', '/usr/bin/cat', '8a5c20c3400a4058a487cd806111cc5138ef4d0fbc6714ff67c9432e38c2705a'),
    ('/usr/bin/grep', '/usr/bin/grep', 'bd6686bf7a650a9717fd7e73fdb07dc63b70547a1da41bce093c56df937a66eb'),
)
PROBE_COUNTS = {"ldd --version | awk '/ldd/{print $NF}'": 0,
                'cat /proc/cpuinfo | grep -i avx': 0}
_PROBE_ROOT = None
_PROBE_IDENTITIES = None


def verify_probe_tools():
    # Installed container tool owner is the observed mapped uid 65534, not host root.
    for path, real, expected in PROBE_TOOLS:
        if os.path.realpath(path) != real:
            raise ValueError('PROBE_TOOL')
        fd = os.open(real, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            before = os.fstat(fd)
            if not stat.S_ISREG(before.st_mode) or before.st_uid != 65534 or before.st_mode & 0o022 or not 1 <= before.st_size <= 2097152:
                raise ValueError('PROBE_TOOL')
            digest = hashlib.sha256()
            remaining = before.st_size
            while remaining:
                block = os.read(fd, min(65536, remaining))
                if not block:
                    raise ValueError('PROBE_TOOL')
                remaining -= len(block)
                digest.update(block)
            after = os.fstat(fd)
            current = os.stat(real, follow_symlinks=False)
            identity = lambda v: (v.st_dev, v.st_ino, v.st_size, v.st_mtime_ns, v.st_ctime_ns)
            if os.read(fd, 1) or identity(before) != identity(after) or identity(after) != identity(current) or digest.hexdigest() != expected or os.path.realpath(path) != real:
                raise ValueError('PROBE_TOOL')
        finally:
            os.close(fd)


def validate_probe_context(startup=True):
    root = _PROBE_ROOT
    if root is None or os.getcwd() != root or os.path.realpath(root) != root:
        raise ValueError('PROBE_CONTEXT')
    if os.getpid() != os.getpgrp() or os.getpid() != os.getsid(0):
        raise ValueError('PROBE_GROUP')
    fixed = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8',
             'HOME': root+'/home', 'TMPDIR': root+'/tmp', 'TMP': root+'/tmp',
             'TEMP': root+'/tmp', 'PADDLE_PDX_CACHE_HOME': root+'/cache'}
    if any(os.environ.get(key) != value for key, value in fixed.items()):
        raise ValueError('PROBE_ENV')
    if startup and any(key in os.environ for key in ('BASH_ENV','ENV','SHELLOPTS','BASHOPTS','LD_PRELOAD','LD_LIBRARY_PATH','LD_AUDIT','GCONV_PATH','PYTHONPATH','PYTHONHOME')):
        raise ValueError('PROBE_ENV')
    if startup and any(key.startswith('BASH_FUNC_') for key in os.environ):
        raise ValueError('PROBE_ENV')
    for path, identity in _PROBE_IDENTITIES.items():
        current = os.lstat(path)
        if not stat.S_ISDIR(current.st_mode) or (current.st_dev, current.st_ino) != identity:
            raise ValueError('PROBE_CONTEXT')
    verify_probe_tools()


def prepare_probe_context():
    global _PROBE_ROOT, _PROBE_IDENTITIES
    root = os.getcwd()
    if re.fullmatch(r'/tmp/auto-p4-ocr-(?:job|smoke)-[A-Za-z0-9_-]+', root) is None:
        raise ValueError('PROBE_CONTEXT')
    _PROBE_ROOT = root
    _PROBE_IDENTITIES = {}
    for path in (root, root+'/home', root+'/tmp', root+'/cache'):
        current = os.lstat(path)
        if not stat.S_ISDIR(current.st_mode) or os.path.realpath(path) != path:
            raise ValueError('PROBE_CONTEXT')
        _PROBE_IDENTITIES[path] = (current.st_dev, current.st_ino)
    validate_probe_context()



def clean_probe_environment():
    root = _PROBE_ROOT
    if type(root) is not str:
        raise ValueError('PROBE_CONTEXT')
    return {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8',
            'HOME': root+'/home', 'TMPDIR': root+'/tmp', 'TMP': root+'/tmp',
            'TEMP': root+'/tmp', 'PADDLE_PDX_CACHE_HOME': root+'/cache'}


def probe_popen_class(base):
    class ProbePopen(base):
        def __init__(self, *args, **kwargs):
            global _BLOCKED_EVENT
            if args and type(args[0]) is str and args[0] in PROBE_COUNTS:
                valid = len(args) == 1 and kwargs.get('shell') is True
                if args[0] == "ldd --version | awk '/ldd/{print $NF}'":
                    valid = valid and set(kwargs) == {'stdout','stderr','shell'} and type(kwargs['stdout']) is int and kwargs['stdout'] == subprocess.PIPE and type(kwargs['stderr']) is int and kwargs['stderr'] == subprocess.PIPE
                else:
                    valid = valid and set(kwargs) == {'shell','text','stdout','bufsize'} and kwargs['text'] is True and type(kwargs['stdout']) is int and kwargs['stdout'] == subprocess.PIPE and type(kwargs['bufsize']) is int and kwargs['bufsize'] == -1
                if not valid:
                    _BLOCKED_EVENT = 'PROCESS'
                    raise RuntimeError('PROBE_CALL_SHAPE')
                kwargs['env'] = clean_probe_environment()
            super().__init__(*args, **kwargs)
    return ProbePopen


def audit(event, args):
    global _BLOCKED_EVENT
    if event == 'subprocess.Popen' and type(args) is tuple and len(args) == 4:
        executable, argv, cwd, env = args
        if executable == '/bin/sh' and type(argv) is list and len(argv) == 3 and argv[:2] == ['/bin/sh', '-c'] and type(argv[2]) is str and argv[2] in PROBE_COUNTS and cwd is None and type(env) is dict and all(type(k) is str and type(v) is str for k,v in env.items()) and env == clean_probe_environment():
            validate_probe_context(startup=False)
            if PROBE_COUNTS[argv[2]] == 0:
                PROBE_COUNTS[argv[2]] = 1
                return
    if event.startswith('socket.') or event in ('subprocess.Popen', 'os.system', 'os.exec', 'os.posix_spawn', 'os.fork', 'os.forkpty'):
        _BLOCKED_EVENT = 'SOCKET' if event.startswith('socket.') else 'PROCESS'
        raise RuntimeError('EXTERNAL_ACCESS_REFUSED')


def bgr_pixels(data, width, height, np):
    # PaddleX ndarray input is BGR; the model's DecodeImage config is also BGR.
    rgba = np.frombuffer(data, dtype=np.uint8).reshape(height, width, 4)
    return np.ascontiguousarray(rgba[:, :, 2::-1])


def evaluate(header, data):
    global _STAGE
    if header['language'] == 'VI':
        return 'UNAVAILABLE', 'VI_CHARACTER_REPERTOIRE_UNSUPPORTED', None, None, None
    admit_model()
    prepare_probe_context()
    subprocess.Popen = probe_popen_class(subprocess.Popen)
    sys.addaudithook(audit)
    _STAGE = 'IMPORT_NUMPY'
    import numpy as np
    _STAGE = 'IMPORT_PADDLEOCR'
    from paddleocr import TextRecognition
    _STAGE = 'CREATE_PREDICTOR'
    predictor = TextRecognition(model_name=MODEL, model_dir=MODEL_ROOT,
                                engine='paddle_static', device='cpu', enable_mkldnn=False,
                                cpu_threads=1, use_tensorrt=False)
    image = bgr_pixels(data, header['width'], header['height'], np)
    started = time.monotonic_ns()
    _STAGE = 'PREDICT'
    outputs = predictor.predict(image, batch_size=1)
    iterator = iter(outputs)
    result = next(iterator, None)
    if result is None or next(iterator, None) is not None:
        raise ValueError('RESULT_COUNT')
    elapsed = (time.monotonic_ns()-started)/1_000_000
    _STAGE = 'VALIDATE_RESULT'
    text, score = result['rec_text'], result['rec_score']
    if type(text) is not str or len(text) > 1024 or len(text.encode('utf-8')) > 4096:
        raise ValueError('RESULT_TEXT')
    score = float(score)
    if not math.isfinite(score) or not 0 <= score <= 1:
        raise ValueError('RESULT_SCORE')
    return ('TEXT' if text else 'NO_TEXT'), 'OK', text, score, elapsed


def reply(header, outcome):
    status, code, text, score, elapsed = outcome
    result = {'version': 1, 'kind': 'OCR_EVALUATION_RESULT', 'scope': 'EVALUATION_ONLY',
              'capability': 'UNQUALIFIED'}
    for key in ('requestId', 'captureId', 'deviceId', 'bindingId', 'generation',
                'orientationEpoch', 'language', 'sourcePixelSha256', 'inputSha256'):
        result[key] = header[key]
    result.update(status=status, code=code, model=MODEL if header['language']=='EN' else None,
                  modelSha256=MODEL_SHA256 if header['language']=='EN' else None,
                  text=text, rawScore=score, modelLatencyMs=elapsed,
                  peakRssBytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024)
    raw = canonical(result)
    if len(raw) > 16380:
        raise ValueError('OUTPUT_LIMIT')
    return struct.pack('<I', len(raw))+raw


def main():
    try:
        header, data = envelope(sys.stdin.buffer)
    except BaseException:
        return 2
    # Vendor Python/native informational output must not enter the protocol stream.
    saved = os.dup(1)
    try:
        os.dup2(2, 1)
        try:
            outcome = evaluate(header, data)
        except BaseException as error:
            # Never emit exception text, user input, full paths or environment.
            frames = list(traceback.walk_tb(error.__traceback__))
            last = frames[-1] if frames else None
            name = type(error).__name__
            source = last[0].f_code.co_filename if last else ''
            owned = source == __file__ or source.startswith('/tmp/auto-p4-ocr-runtime-v1/lib/python3.12/site-packages/')
            basename = os.path.basename(source)
            diagnostic = {'stage': _STAGE, 'type': name if re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,63}', name) else 'Exception', 'blockedEvent': _BLOCKED_EVENT, 'source': basename if owned and re.fullmatch(r'[A-Za-z0-9_.-]{1,80}', basename) else None, 'line': last[1] if last and 0 <= last[1] <= 10000000 else None}
            diagnostic_bytes = canonical(diagnostic)
            if len(diagnostic_bytes) > 512:
                diagnostic_bytes = b'{"stage":"DIAGNOSTIC_LIMIT"}'
            sys.stderr.buffer.write(diagnostic_bytes+b'\n')
            sys.stderr.buffer.flush()
            outcome = ('UNAVAILABLE', 'WORKER_UNAVAILABLE', None, None, None)
        sys.stdout.flush()
    finally:
        os.dup2(saved, 1)
        os.close(saved)
    try:
        sys.stdout.buffer.write(reply(header, outcome))
        sys.stdout.buffer.flush()
        return 0
    except BaseException:
        return 3


if __name__ == '__main__':
    raise SystemExit(main())
