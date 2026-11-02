"""Windows OCR source-policy tests only; FakeWinApi is not Windows evidence.

No downloaded interpreter/package/model is imported or executed. Native kernel
calls, PE loading and model inference require the separate hosted qualification.
"""
import hashlib
import importlib.util
import io
import json
import ntpath
from pathlib import Path
import struct
import sys
import unittest
from unittest import mock

SPEC = importlib.util.spec_from_file_location(
    'ocr_windows_worker', Path(__file__).parents[1] / 'vision/ocr_windows_worker.py')
WORKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WORKER)
ROOT = r'C:\owned\qualification'
UID = '00000000-0000-4000-8000-000000000001'
JOB = ntpath.join(ROOT, 'work', UID)
SOURCE = ntpath.join(ROOT, 'source', 'ocr_windows_worker.py')
CONTEXT = WORKER.Context(ROOT, JOB, ntpath.join(ROOT, 'model', 'english'))
FILES = {'inference.pdiparams': b'parameters', 'inference.json': b'graph',
         'inference.yml': b'dictionary'}
EXPECTED = {name: (len(data), hashlib.sha256(data).hexdigest())
            for name, data in FILES.items()}


def environment():
    return {**WORKER.FIXED_ENV, 'FONESI_VISION_ROOT': ROOT, 'FONESI_VISION_JOB': JOB,
            'SystemRoot': r'C:\Windows', 'WINDIR': r'C:\Windows',
            'PATH': r'C:\Windows\System32',
            'HOME': JOB + r'\home', 'USERPROFILE': JOB + r'\home',
            'TMP': JOB + r'\tmp', 'TEMP': JOB + r'\tmp',
            'PADDLE_PDX_CACHE_HOME': JOB + r'\cache', 'HF_HOME': JOB + r'\cache\hf'}


def fixture(language='EN'):
    data = bytes([12, 34, 56, 255])
    header = dict(version=1, kind='OCR_EVALUATION', requestId=UID, captureId=UID,
                  deviceId=UID, bindingId=UID, generation=1, orientationEpoch=0,
                  language=language, sourcePixelSha256='a' * 64,
                  inputSha256=hashlib.sha256(data).hexdigest(), width=1, height=1,
                  inputBytes=4)
    return header, data


def frame(header, data):
    raw = WORKER.canonical(header)
    return struct.pack('<I', len(raw)) + raw + data


class FakeWinApi:
    """Explicit synthetic policy seam, not ctypes or vendor module injection."""
    def __init__(self):
        self.handles = {}
        self.closed = []
        self.opened = []
        self.files = dict(FILES)
        self.identities = {}
        self.final_paths = {}
        self.close_failure = None
        self.read_failure = False
        self.open_failure = None
        self.extra = []
        self.next_handle = 1

    def open(self, path, directory):
        if path == self.open_failure:
            raise OSError('synthetic open failure')
        handle = self.next_handle
        self.next_handle += 1
        self.handles[handle] = [path, directory, 0]
        self.opened.append(path)
        data = b'' if directory else self.files[ntpath.basename(path)]
        self.identities.setdefault(path, WORKER.FileIdentity(
            WORKER.DIRECTORY if directory else 0, 7, handle, len(data), 1, 2, 3, 1))
        return handle

    def info(self, handle):
        return self.identities[self.handles[handle][0]]

    def final_path(self, handle):
        path = self.handles[handle][0]
        return self.final_paths.get(path, path)

    def read(self, handle, length):
        if self.read_failure:
            return b''
        state = self.handles[handle]
        data = self.files[ntpath.basename(state[0])]
        block = data[state[2]:state[2] + length]
        state[2] += len(block)
        return block

    def entries(self, _path):
        return list(self.files) + self.extra

    def close(self, handle):
        if handle == self.close_failure:
            raise OSError('synthetic close failure')
        self.closed.append(handle)
        del self.handles[handle]


class ProtocolTests(unittest.TestCase):
    def test_module_import_does_not_load_vendor_or_winapi(self):
        self.assertNotIn('paddleocr', sys.modules)
        self.assertNotIn('numpy', sys.modules)
        self.assertNotIn('resource', WORKER.__dict__)
        if WORKER.os.name != 'nt':
            with self.assertRaisesRegex(ValueError, 'PLATFORM_UNAVAILABLE'):
                WORKER.WinApi()

    def test_exact_v1_frame(self):
        header, data = fixture()
        self.assertEqual(WORKER.envelope(io.BytesIO(frame(header, data))), (header, data))

    def test_bad_header_duplicate_extra_reordered_noncanonical(self):
        header, data = fixture()
        raw = WORKER.canonical(header)
        for value in [raw.replace(b'"version":1', b'"version":1,"version":1'),
                      raw.replace(b'"version":1', b'"version":1,"other":1'),
                      WORKER.canonical(dict(reversed(list(header.items())))),
                      json.dumps(header).encode(), b'[]', b'\xff']:
            with self.subTest(value=value[:30]):
                with self.assertRaises((ValueError, UnicodeError)):
                    WORKER.envelope(io.BytesIO(struct.pack('<I', len(value)) + value + data))

    def test_bound_bad_identifiers_dimensions_and_integer_types(self):
        for key, value in [('width', 2049), ('height', 257), ('inputBytes', 2097153),
                           ('generation', True), ('version', True), ('width', 0),
                           ('language', 'en'), ('requestId', '../x'),
                           ('sourcePixelSha256', 'A' * 64)]:
            header, data = fixture()
            header[key] = value
            with self.subTest(key=key):
                with self.assertRaises(ValueError):
                    WORKER.envelope(io.BytesIO(frame(header, data)))

    def test_payload_hash_truncation_trailing_and_alpha(self):
        header, data = fixture()
        for value in [frame(header, data)[:-1], frame(header, data) + b'x',
                      frame(header, b'1234')]:
            with self.assertRaises(ValueError):
                WORKER.envelope(io.BytesIO(value))
        data = bytes([12, 34, 56, 0])
        header['inputSha256'] = hashlib.sha256(data).hexdigest()
        with self.assertRaisesRegex(ValueError, 'ALPHA'):
            WORKER.envelope(io.BytesIO(frame(header, data)))

    def test_vi_refusal_precedes_api_context_model_or_vendor_import(self):
        header, data = fixture('VI')
        with mock.patch.object(WORKER, 'WinApi', side_effect=AssertionError('must not call')):
            self.assertEqual(WORKER.evaluate(header, data),
                             ('UNAVAILABLE', 'VI_CHARACTER_REPERTOIRE_UNSUPPORTED',
                              None, None, None))
        self.assertNotIn('paddleocr', sys.modules)

    def test_real_conversion_code_preserves_asymmetric_channels(self):
        data = bytes([17, 61, 203, 255, 231, 42, 9, 255,
                      5, 99, 153, 255, 87, 11, 244, 255])
        self.assertEqual(WORKER.bgr_bytes(data, 2, 2),
                         bytes([203, 61, 17, 9, 42, 231, 153, 99, 5, 244, 11, 87]))
        self.assertEqual(data[:4], bytes([17, 61, 203, 255]))
        for width, height in [(False, 2), (1, 1), (2049, 1)]:
            with self.assertRaises(ValueError):
                WORKER.bgr_bytes(data, width, height)

    def test_reply_version2_correlations_and_windows_memory_label(self):
        header, _ = fixture()
        result = WORKER.reply(header, ('TEXT', 'OK', 'Hello', 0.9, 12), 8192)
        count = struct.unpack('<I', result[:4])[0]
        self.assertEqual(count, len(result) - 4)
        value = json.loads(result[4:])
        self.assertEqual(value['version'], 2)
        self.assertEqual(value['memoryKind'], 'WINDOWS_PEAK_WORKING_SET')
        self.assertEqual(value['peakWorkingSetBytes'], 8192)
        self.assertNotIn('peakRssBytes', value)
        self.assertEqual(value['inputSha256'], header['inputSha256'])
        self.assertEqual(value['capability'], 'UNQUALIFIED')

    def test_memory_failure_is_unavailable_not_zero(self):
        header, _ = fixture()
        for peak in [None, 0, -1, True, float('nan'), 1 << 54]:
            value = json.loads(WORKER.reply(header, ('TEXT', 'OK', 'x', 1, 1), peak)[4:])
            self.assertEqual(value['status'], 'UNAVAILABLE')
            self.assertEqual(value['code'], 'MEMORY_UNAVAILABLE')
            self.assertIsNone(value['peakWorkingSetBytes'])
            self.assertIsNone(value['text'])

    def test_no_linux_process_or_any_socket_exception(self):
        for event in ['socket.__new__', 'socket.connect', 'socket.getaddrinfo',
                      'subprocess.Popen', 'os.system', 'os.exec', 'os.posix_spawn',
                      'os.fork', 'os.forkpty', 'os.spawn', 'os.startfile', 'os.startfile/2']:
            with self.subTest(event=event):
                with self.assertRaisesRegex(RuntimeError, 'EXTERNAL_ACCESS_REFUSED'):
                    WORKER.audit(event, ('/bin/sh', ['sh', '-c', 'cat /proc/cpuinfo'], None, {}))
        WORKER.audit('open', ('model', 'rb', 0))


class ContextTests(unittest.TestCase):
    def test_exact_owner_context_and_model_derivation(self):
        self.assertEqual(WORKER.context_from_environment(environment(), JOB, SOURCE), CONTEXT)

    def test_missing_extra_inherited_or_changed_environment_refuses(self):
        for key, value in [('PYTHONPATH', ROOT), ('PYTHONHOME', ROOT),
                           ('HTTP_PROXY', 'http://localhost'), ('HF_TOKEN', 'synthetic'),
                           ('PATH', ROOT), ('PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK', 'False')]:
            env = environment()
            env[key] = value
            with self.subTest(key=key):
                with self.assertRaises(ValueError):
                    WORKER.context_from_environment(env, JOB, SOURCE)
        env = environment()
        del env['HOME']
        with self.assertRaises(ValueError):
            WORKER.context_from_environment(env, JOB, SOURCE)

    def test_alias_unc_device_traversal_reserved_and_noncanonical_refuse(self):
        for path in ['relative', r'\\server\share', r'\\?\C:\owned', r'C:relative',
                     r'C:\owned\..\other', r'C:\owned\NUL', r'C:\owned\name.',
                     r'C:\owned\name ', r'C:\owned\a:b', r'C:\owned\a*b',
                     r'C:\owned\a?b', r'C:\owned\a<b', 'C:/owned',
                     'C:\\bad\ud800', 'c:\\owned', 'C:\\' + 'x' * 240]:
            with self.subTest(path=repr(path)):
                with self.assertRaises(ValueError):
                    WORKER.windows_path(path)

    def test_job_source_cwd_and_environment_case_collision_refuse(self):
        for cwd, source in [(ROOT, SOURCE), (JOB, SOURCE + '.other')]:
            with self.assertRaises(ValueError):
                WORKER.context_from_environment(environment(), cwd, source)
        env = environment()
        env['FONESI_VISION_JOB'] = ROOT + r'\work\not-a-uuid'
        with self.assertRaises(ValueError):
            WORKER.context_from_environment(env, JOB, SOURCE)
        env = environment()
        env['home'] = env['HOME']
        with self.assertRaises(ValueError):
            WORKER.context_from_environment(env, JOB, SOURCE)


class SyntheticLeaseTests(unittest.TestCase):
    def setUp(self):
        self.patch = mock.patch.object(WORKER, 'MODEL_FILES', EXPECTED)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def test_retains_every_model_and_ancestor_handle_until_close(self):
        api = FakeWinApi()
        lease = WORKER.ModelLease(CONTEXT, api)
        self.assertEqual(api.closed, [])
        self.assertEqual(api.opened[0], 'C:\\')
        for name in FILES:
            self.assertIn(ntpath.join(CONTEXT.model, name), api.opened)
        lease.verify()
        count = len(api.handles)
        lease.close()
        self.assertEqual(len(api.closed), count)
        self.assertEqual(api.handles, {})

    def test_model_tamper_short_read_extra_and_size_refuse_and_close(self):
        for fault in ['hash', 'read', 'extra', 'size']:
            api = FakeWinApi()
            if fault == 'hash': api.files['inference.json'] = b'GRAPH'
            if fault == 'read': api.read_failure = True
            if fault == 'extra': api.extra = ['extra']
            if fault == 'size': api.files['inference.json'] = b'longer'
            with self.subTest(fault=fault):
                with self.assertRaises(ValueError): WORKER.ModelLease(CONTEXT, api)
                self.assertEqual(api.handles, {})

    def test_reparse_wrong_type_alias_and_hardlink_refuse(self):
        path = ntpath.join(CONTEXT.model, 'inference.json')
        for fault in ['reparse', 'type', 'alias', 'links']:
            api = FakeWinApi()
            identity = WORKER.FileIdentity(0, 7, 100, len(FILES['inference.json']), 1, 2, 3, 1)
            if fault == 'reparse': identity = identity._replace(attributes=WORKER.REPARSE)
            if fault == 'type': identity = identity._replace(attributes=WORKER.DIRECTORY)
            if fault == 'links': identity = identity._replace(links=2)
            if fault == 'alias': api.final_paths[path] = ROOT + r'\other'
            api.identities[path] = identity
            with self.subTest(fault=fault):
                with self.assertRaises(ValueError): WORKER.ModelLease(CONTEXT, api)
                self.assertEqual(api.handles, {})

    def test_changed_model_identity_or_ancestor_path_refuses(self):
        for fault in ['identity', 'path', 'extra']:
            api = FakeWinApi()
            lease = WORKER.ModelLease(CONTEXT, api)
            if fault == 'identity':
                path = ntpath.join(CONTEXT.model, 'inference.json')
                api.identities[path] = api.identities[path]._replace(changed=99)
            if fault == 'path': api.final_paths[ROOT] = r'C:\replacement'
            if fault == 'extra': api.extra = ['late']
            with self.subTest(fault=fault):
                with self.assertRaises(ValueError): lease.verify()
            lease.close()

    def test_legitimate_cache_directory_time_change_not_identity_loss(self):
        api = FakeWinApi()
        lease = WORKER.ModelLease(CONTEXT, api)
        cache = ntpath.join(JOB, 'cache')
        api.identities[cache] = api.identities[cache]._replace(modified=100, changed=101)
        lease.verify()
        api.identities[cache] = api.identities[cache]._replace(index=999)
        with self.assertRaises(ValueError): lease.verify()
        lease.close()

    def test_partial_open_failure_closes_acquired_handles(self):
        api = FakeWinApi()
        api.open_failure = ntpath.join(CONTEXT.model, 'inference.json')
        with self.assertRaises(OSError): WORKER.ModelLease(CONTEXT, api)
        self.assertEqual(api.handles, {})
        self.assertGreater(len(api.closed), 0)

    def test_close_failure_is_retained_and_explicitly_reconcilable(self):
        api = FakeWinApi()
        lease = WORKER.ModelLease(CONTEXT, api)
        failed = next(iter(api.handles))
        api.close_failure = failed
        with self.assertRaisesRegex(ValueError, 'HANDLE_CLOSE_FAILED'):
            lease.close()
        self.assertEqual([h for _, h, _ in lease.handles], [failed])
        self.assertEqual(list(api.handles), [failed])
        api.close_failure = None
        lease.close()
        self.assertEqual(api.handles, {})


if __name__ == '__main__':
    unittest.main()
