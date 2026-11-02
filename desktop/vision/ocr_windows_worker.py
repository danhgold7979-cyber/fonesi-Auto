"""Windows-only, supplied EN evaluation; native custody remains supervisor-owned.

Request framing is v1. Reply is v2 and labels Windows peak working set. Module
import and protocol/policy tests need only stdlib; no WinAPI is loaded until an
explicit actual Windows evaluation. Fake API tests are not native evidence.
"""
import ctypes
from ctypes import wintypes
import hashlib
import json
import math
import ntpath
import os
import re
import struct
import sys
import time
from typing import NamedTuple

_STAGE = 'ADMISSION'
_BLOCKED_EVENT = None
MEMORY_KIND = 'WINDOWS_PEAK_WORKING_SET'
MODEL = 'en_PP-OCRv5_mobile_rec'
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


# Exactly the process-local values constructed by the native owner. PATH is
# checked before imports; admitted cv2/Paddle may subsequently add DLL paths,
# but no subprocess or socket audit event receives an exception.
FIXED_ENV = {
    'PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK': 'True',
    'PADDLE_PDX_DISABLE_DEVICE_FALLBACK': 'True',
    'HF_HUB_OFFLINE': '1', 'TRANSFORMERS_OFFLINE': '1',
    'SETUPTOOLS_USE_DISTUTILS': 'local', 'OMP_NUM_THREADS': '1',
    'OPENBLAS_NUM_THREADS': '1', 'MKL_NUM_THREADS': '1',
    'NUMEXPR_NUM_THREADS': '1', 'OPENCV_FOR_THREADS_NUM': '1',
    'GLOG_MINLOGLEVEL': '2',
}
UUID = re.compile(r'[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\Z')
REPARSE = 0x400
DIRECTORY = 0x10


class Context(NamedTuple):
    root: str
    job: str
    model: str


class FileIdentity(NamedTuple):
    attributes: int
    volume: int
    index: int
    size: int
    created: int
    modified: int
    changed: int
    links: int


def windows_path(value):
    if type(value) is not str or not 3 <= len(value) <= 240:
        raise ValueError('CONTEXT_PATH')
    if any(ord(c) < 32 for c in value) or '/' in value:
        raise ValueError('CONTEXT_PATH')
    try:
        value.encode('utf-16-le')
    except UnicodeEncodeError:
        raise ValueError('CONTEXT_PATH') from None
    drive, rest = ntpath.splitdrive(value)
    if re.fullmatch(r'[A-Z]:', drive) is None or not rest.startswith('\\'):
        raise ValueError('CONTEXT_PATH')
    if ntpath.normpath(value) != value:
        raise ValueError('CONTEXT_PATH')
    for part in rest.split('\\')[1:]:
        if not part and rest == '\\':
            continue
        if (not part or part.endswith((' ', '.')) or any(c in part for c in '<>:"|?*')
                or part.split('.')[0].upper() in {
                    'CON', 'PRN', 'AUX', 'NUL',
                    *(f'COM{i}' for i in range(1, 10)),
                    *(f'LPT{i}' for i in range(1, 10)),
                }):
            raise ValueError('CONTEXT_PATH')
    return value


def context_from_environment(environment, cwd, source):
    # Windows environment keys are case-insensitive; reject ambiguous supplied
    # test dictionaries rather than choosing one case variant.
    env = {}
    for key, value in environment.items():
        if type(key) is not str or type(value) is not str or key.upper() in env:
            raise ValueError('CONTEXT_ENV')
        env[key.upper()] = value
    root = windows_path(env.get('FONESI_VISION_ROOT'))
    job = windows_path(env.get('FONESI_VISION_JOB'))
    windows = windows_path(env.get('SYSTEMROOT'))
    if (root == ntpath.splitdrive(root)[0] + '\\'
            or ntpath.dirname(job) != ntpath.join(root, 'work')
            or UUID.fullmatch(ntpath.basename(job)) is None
            or cwd != job or source != ntpath.join(root, 'source', 'ocr_windows_worker.py')):
        raise ValueError('CONTEXT_PATH')
    expected = {
        **FIXED_ENV, 'FONESI_VISION_ROOT': root, 'FONESI_VISION_JOB': job,
        'SYSTEMROOT': windows, 'WINDIR': windows,
        'PATH': ntpath.join(windows, 'System32'),
        'HOME': ntpath.join(job, 'home'), 'USERPROFILE': ntpath.join(job, 'home'),
        'TMP': ntpath.join(job, 'tmp'), 'TEMP': ntpath.join(job, 'tmp'),
        'PADDLE_PDX_CACHE_HOME': ntpath.join(job, 'cache'),
        'HF_HOME': ntpath.join(job, 'cache', 'hf'),
    }
    if env != expected:
        raise ValueError('CONTEXT_ENV')
    return Context(root, job, ntpath.join(root, 'model', 'english'))


class WinApi:
    """Actual Win32 only; loaded from System32, never a POSIX substitute."""
    def __init__(self):
        if os.name != 'nt' or ctypes.sizeof(ctypes.c_void_p) != 8:
            raise ValueError('PLATFORM_UNAVAILABLE')
        self.kernel = ctypes.WinDLL('kernel32.dll', use_last_error=True, winmode=0x800)
        k = self.kernel
        k.CreateFileW.argtypes = (wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                                 ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD,
                                 wintypes.HANDLE)
        k.CreateFileW.restype = wintypes.HANDLE
        k.CloseHandle.argtypes = (wintypes.HANDLE,)
        k.CloseHandle.restype = wintypes.BOOL
        k.GetFileType.argtypes = (wintypes.HANDLE,)
        k.GetFileType.restype = wintypes.DWORD
        k.GetFinalPathNameByHandleW.argtypes = (wintypes.HANDLE, wintypes.LPWSTR,
                                               wintypes.DWORD, wintypes.DWORD)
        k.GetFinalPathNameByHandleW.restype = wintypes.DWORD
        k.ReadFile.argtypes = (wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD,
                              ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p)
        k.ReadFile.restype = wintypes.BOOL

        class Information(ctypes.Structure):
            _fields_ = [('attributes', wintypes.DWORD), ('created', wintypes.FILETIME),
                        ('accessed', wintypes.FILETIME), ('modified', wintypes.FILETIME),
                        ('volume', wintypes.DWORD), ('sizeHigh', wintypes.DWORD),
                        ('sizeLow', wintypes.DWORD), ('links', wintypes.DWORD),
                        ('indexHigh', wintypes.DWORD), ('indexLow', wintypes.DWORD)]

        class Basic(ctypes.Structure):
            _fields_ = [('created', ctypes.c_longlong), ('accessed', ctypes.c_longlong),
                        ('modified', ctypes.c_longlong), ('changed', ctypes.c_longlong),
                        ('attributes', wintypes.DWORD)]

        class Memory(ctypes.Structure):
            _fields_ = [('cb', wintypes.DWORD), ('PageFaultCount', wintypes.DWORD),
                        ('PeakWorkingSetSize', ctypes.c_size_t),
                        ('WorkingSetSize', ctypes.c_size_t),
                        ('QuotaPeakPagedPoolUsage', ctypes.c_size_t),
                        ('QuotaPagedPoolUsage', ctypes.c_size_t),
                        ('QuotaPeakNonPagedPoolUsage', ctypes.c_size_t),
                        ('QuotaNonPagedPoolUsage', ctypes.c_size_t),
                        ('PagefileUsage', ctypes.c_size_t),
                        ('PeakPagefileUsage', ctypes.c_size_t)]

        self.Information, self.Basic, self.Memory = Information, Basic, Memory
        k.GetFileInformationByHandle.argtypes = (wintypes.HANDLE, ctypes.POINTER(Information))
        k.GetFileInformationByHandle.restype = wintypes.BOOL
        k.GetFileInformationByHandleEx.argtypes = (wintypes.HANDLE, ctypes.c_int,
                                                  ctypes.c_void_p, wintypes.DWORD)
        k.GetFileInformationByHandleEx.restype = wintypes.BOOL
        k.GetCurrentProcess.argtypes = ()
        k.GetCurrentProcess.restype = wintypes.HANDLE
        k.K32GetProcessMemoryInfo.argtypes = (wintypes.HANDLE, ctypes.POINTER(Memory),
                                             wintypes.DWORD)
        k.K32GetProcessMemoryInfo.restype = wintypes.BOOL

    def open(self, path, directory):
        # FILE_SHARE_READ only: writers/deleters cannot coexist. OPEN_REPARSE_POINT
        # exposes rather than traverses a final reparse point; every ancestor is
        # separately admitted and retained before descending.
        access = 0x81 if directory else 0x80000000
        handle = self.kernel.CreateFileW(path, access, 1, None, 3,
                                         0x00200000 | 0x02000000, None)
        if not handle or handle == ctypes.c_void_p(-1).value:
            raise ctypes.WinError(ctypes.get_last_error())
        return handle

    def close(self, handle):
        if not self.kernel.CloseHandle(handle):
            raise ctypes.WinError(ctypes.get_last_error())

    def info(self, handle):
        if self.kernel.GetFileType(handle) != 1:
            raise ValueError('FILE_TYPE')
        value, basic = self.Information(), self.Basic()
        if not self.kernel.GetFileInformationByHandle(handle, ctypes.byref(value)):
            raise ctypes.WinError(ctypes.get_last_error())
        if not self.kernel.GetFileInformationByHandleEx(handle, 0, ctypes.byref(basic),
                                                       ctypes.sizeof(basic)):
            raise ctypes.WinError(ctypes.get_last_error())
        number = lambda ft: (ft.dwHighDateTime << 32) | ft.dwLowDateTime
        return FileIdentity(value.attributes, value.volume,
                            (value.indexHigh << 32) | value.indexLow,
                            (value.sizeHigh << 32) | value.sizeLow,
                            number(value.created), number(value.modified),
                            basic.changed, value.links)

    def final_path(self, handle):
        buffer = ctypes.create_unicode_buffer(4096)
        count = self.kernel.GetFinalPathNameByHandleW(handle, buffer, len(buffer), 0)
        if not 0 < count < len(buffer):
            raise ValueError('FINAL_PATH')
        value = buffer.value
        if value.startswith('\\\\?\\'):
            value = value[4:]
        return windows_path(value)

    def read(self, handle, length):
        if not integer(length, 1, 65536):
            raise ValueError('READ_LIMIT')
        buffer = ctypes.create_string_buffer(length)
        count = wintypes.DWORD()
        if not self.kernel.ReadFile(handle, buffer, length, ctypes.byref(count), None):
            raise ctypes.WinError(ctypes.get_last_error())
        if count.value > length:
            raise ValueError('READ_LIMIT')
        return buffer.raw[:count.value]

    def entries(self, path):
        return os.listdir(path)

    def peak_working_set(self):
        value = self.Memory()
        value.cb = ctypes.sizeof(value)
        if not self.kernel.K32GetProcessMemoryInfo(self.kernel.GetCurrentProcess(),
                                                   ctypes.byref(value), value.cb):
            raise ctypes.WinError(ctypes.get_last_error())
        peak = value.PeakWorkingSetSize
        if not integer(peak, 1, 9007199254740991):
            raise ValueError('MEMORY_UNAVAILABLE')
        return peak


def directory_chain(path):
    windows_path(path)
    drive, tail = ntpath.splitdrive(path)
    current = drive + '\\'
    result = [current]
    for part in tail.split('\\')[1:]:
        if part:
            current = ntpath.join(current, part)
            result.append(current)
    return result


class ModelLease:
    """Source policy shared with explicit fake-API tests, not a fake native API."""
    def __init__(self, context, api):
        self.context, self.api, self.handles = context, api, []
        try:
            paths = []
            for directory in (context.model, context.job, ntpath.join(context.job, 'home'),
                              ntpath.join(context.job, 'tmp'), ntpath.join(context.job, 'cache')):
                for path in directory_chain(directory):
                    if path not in paths:
                        paths.append(path)
            for path in paths:
                self._hold(path, True)
            if set(api.entries(context.model)) != set(MODEL_FILES):
                raise ValueError('MODEL_FILES')
            for name, (length, expected) in MODEL_FILES.items():
                path = ntpath.join(context.model, name)
                handle, identity = self._hold(path, False)
                if identity.size != length or identity.links != 1:
                    raise ValueError('MODEL_SIZE')
                digest, remaining = hashlib.sha256(), length
                while remaining:
                    data = api.read(handle, min(65536, remaining))
                    if type(data) is not bytes or not 0 < len(data) <= min(65536, remaining):
                        raise ValueError('MODEL_READ')
                    remaining -= len(data)
                    digest.update(data)
                if api.read(handle, 1) or digest.hexdigest() != expected:
                    raise ValueError('MODEL_HASH')
            self.verify()
        except BaseException:
            self.close()
            raise

    def _hold(self, path, directory):
        handle = self.api.open(path, directory)
        # Retain immediately so inspection failure still closes this handle.
        self.handles.append((path, handle, None))
        identity = self.api.info(handle)
        if (identity.attributes & REPARSE
                or bool(identity.attributes & DIRECTORY) != directory
                or self.api.final_path(handle) != path):
            raise ValueError('MODEL_PATH')
        self.handles[-1] = (path, handle, identity)
        return handle, identity

    def verify(self):
        for path, handle, identity in self.handles:
            current = self.api.info(handle)
            # Cache/job directory timestamps may change during legitimate writes.
            # Their retained directory identity/path/reparse attributes must not.
            if identity is not None and identity.attributes & DIRECTORY:
                unchanged = (current.attributes, current.volume, current.index, current.created) == (
                    identity.attributes, identity.volume, identity.index, identity.created)
            else:
                unchanged = current == identity
            if identity is None or not unchanged or self.api.final_path(handle) != path:
                raise ValueError('MODEL_CHANGED')
        if set(self.api.entries(self.context.model)) != set(MODEL_FILES):
            raise ValueError('MODEL_FILES')

    def close(self):
        failed = []
        for path, handle, identity in reversed(self.handles):
            try:
                self.api.close(handle)
            except BaseException:
                failed.append((path, handle, identity))
        self.handles = list(reversed(failed))
        if failed:
            raise ValueError('HANDLE_CLOSE_FAILED')


def audit(event, _args):
    global _BLOCKED_EVENT
    if event.startswith('socket.') or event in {
        'subprocess.Popen', 'os.system', 'os.exec', 'os.posix_spawn',
        'os.fork', 'os.forkpty', 'os.spawn', 'os.startfile', 'os.startfile/2',
    }:
        _BLOCKED_EVENT = 'SOCKET' if event.startswith('socket.') else 'PROCESS'
        raise RuntimeError('EXTERNAL_ACCESS_REFUSED')


def bgr_bytes(data, width, height):
    # This exact conversion is stdlib-testable without injecting a fake NumPy.
    if (type(data) is not bytes or not integer(width, 1, 2048)
            or not integer(height, 1, 256) or width * height > 524288
            or len(data) != width * height * 4):
        raise ValueError('IMAGE_LIMIT')
    result = bytearray(width * height * 3)
    result[0::3], result[1::3], result[2::3] = data[2::4], data[1::4], data[0::4]
    return bytes(result)


def bgr_pixels(data, width, height, np):
    converted = bgr_bytes(data, width, height)
    return np.frombuffer(converted, dtype=np.uint8).reshape(height, width, 3).copy()


def evaluate(header, data):
    global _STAGE
    if header['language'] == 'VI':
        return 'UNAVAILABLE', 'VI_CHARACTER_REPERTOIRE_UNSUPPORTED', None, None, None
    api = WinApi()
    context = context_from_environment(os.environ, os.getcwd(), os.path.abspath(__file__))
    lease = ModelLease(context, api)
    try:
        sys.addaudithook(audit)
        _STAGE = 'IMPORT_NUMPY'
        import numpy as np
        _STAGE = 'IMPORT_PADDLEOCR'
        from paddleocr import TextRecognition
        lease.verify()
        _STAGE = 'CREATE_PREDICTOR'
        predictor = TextRecognition(model_name=MODEL, model_dir=context.model,
                                    engine='paddle_static', device='cpu', enable_mkldnn=False,
                                    cpu_threads=1, use_tensorrt=False)
        image = bgr_pixels(data, header['width'], header['height'], np)
        started = time.monotonic_ns()
        _STAGE = 'PREDICT'
        iterator = iter(predictor.predict(image, batch_size=1))
        result = next(iterator, None)
        if result is None or next(iterator, None) is not None:
            raise ValueError('RESULT_COUNT')
        elapsed = (time.monotonic_ns() - started) / 1_000_000
        _STAGE = 'VALIDATE_RESULT'
        text, score = result['rec_text'], float(result['rec_score'])
        if (type(text) is not str or len(text) > 1024 or len(text.encode('utf-8')) > 4096
                or not math.isfinite(score) or not 0 <= score <= 1):
            raise ValueError('RESULT')
        lease.verify()
        return ('TEXT' if text else 'NO_TEXT'), 'OK', text, score, elapsed
    finally:
        lease.close()


def reply(header, outcome, peak_working_set):
    status, code, text, score, elapsed = outcome
    if not integer(peak_working_set, 1, 9007199254740991):
        status, code, text, score, elapsed = 'UNAVAILABLE', 'MEMORY_UNAVAILABLE', None, None, None
        peak_working_set = None
    result = {'version': 2, 'kind': 'OCR_EVALUATION_RESULT', 'scope': 'EVALUATION_ONLY',
              'capability': 'UNQUALIFIED'}
    for key in ('requestId', 'captureId', 'deviceId', 'bindingId', 'generation',
                'orientationEpoch', 'language', 'sourcePixelSha256', 'inputSha256'):
        result[key] = header[key]
    result.update(status=status, code=code, model=MODEL if header['language'] == 'EN' else None,
                  modelSha256=MODEL_SHA256 if header['language'] == 'EN' else None,
                  text=text, rawScore=score, modelLatencyMs=elapsed,
                  memoryKind=MEMORY_KIND, peakWorkingSetBytes=peak_working_set)
    raw = canonical(result)
    if len(raw) > 16380:
        raise ValueError('OUTPUT_LIMIT')
    return struct.pack('<I', len(raw)) + raw


def main():
    if os.name != 'nt' or len(sys.argv) != 1:
        return 2
    try:
        header, data = envelope(sys.stdin.buffer)
    except BaseException:
        return 2
    saved = os.dup(1)
    try:
        os.dup2(2, 1)
        try:
            outcome = evaluate(header, data)
        except BaseException as error:
            diagnostic = {'stage': _STAGE, 'type': type(error).__name__,
                          'blockedEvent': _BLOCKED_EVENT}
            diagnostic_bytes = canonical(diagnostic)
            if len(diagnostic_bytes) > 512:
                diagnostic_bytes = b'{"stage":"DIAGNOSTIC_LIMIT"}'
            sys.stderr.buffer.write(diagnostic_bytes + b'\n')
            sys.stderr.buffer.flush()
            outcome = ('UNAVAILABLE', 'WORKER_UNAVAILABLE', None, None, None)
        sys.stdout.flush()
    finally:
        os.dup2(saved, 1)
        os.close(saved)
    try:
        try:
            peak = WinApi().peak_working_set()
        except BaseException:
            peak = None
        sys.stdout.buffer.write(reply(header, outcome, peak))
        sys.stdout.buffer.flush()
        return 0
    except BaseException:
        return 3


if __name__ == '__main__':
    raise SystemExit(main())
