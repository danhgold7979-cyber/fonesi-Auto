"""Pure catalog and synthetic transport tests; no downloaded code execution."""
import copy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

import windows_vision_catalog as catalog

SOURCE = Path(__file__).resolve().parents[1] / 'vision' / 'windows_materialization_catalog.json'


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        self.value = json.loads(SOURCE.read_bytes())

    def tearDown(self):
        self.tmp.cleanup()

    def load(self, value):
        raw = json.dumps(value).encode()
        p = self.root / 'catalog.json'
        p.write_bytes(raw)
        return catalog.load_catalog(p, hashlib.sha256(raw).hexdigest())

    def test_exact_catalog_and_separate_closures(self):
        result = self.load(self.value)
        self.assertEqual(len(result['ocr']['wheels']), 72)
        self.assertEqual(len(result['preprocess']['wheels']), 2)
        self.assertEqual(result['executionApproval'], 'NOT_GRANTED')
        for name in ('ocr', 'preprocess'):
            p = SOURCE.parent / result[name]['lock']
            self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(), result[name]['lockSha256'])

    def test_mutated_closure_and_unknown_schema_refused(self):
        for edit in (lambda v: v.update(extra=True),
                     lambda v: v.update(epoch='0'),
                     lambda v: v['ocr']['wheels'].pop(),
                     lambda v: v['preprocess'].update(lock='../x'),
                     lambda v: v['ocr']['wheels'][0].update(url='https://evil.invalid/a')):
            value = copy.deepcopy(self.value)
            edit(value)
            with self.assertRaises(ValueError):
                self.load(value)

    def test_hash_and_duplicate_refused(self):
        p = self.root / 'catalog.json'
        p.write_bytes(b'{"version":1,"version":1}')
        with self.assertRaisesRegex(ValueError, 'IDENTITY'):
            catalog.load_catalog(p, '0' * 64)
        with self.assertRaisesRegex(ValueError, 'DUPLICATE'):
            catalog.load_catalog(p, hashlib.sha256(p.read_bytes()).hexdigest())

    def test_literal_filename_and_origin_refused(self):
        for filename in ('../x.whl', 'x\\y.whl', 'CON.whl'):
            value = copy.deepcopy(self.value)
            value['ocr']['wheels'][0]['filename'] = filename
            with self.assertRaises(ValueError):
                self.load(value)
        for url in ('http://files.pythonhosted.org/packages/a/x.whl',
                    'https://name:secret@files.pythonhosted.org/packages/a/x.whl',
                    'https://files.pythonhosted.org:443/packages/a/x.whl',
                    'https://files.pythonhosted.org/packages/a/x.whl?key=x'):
            with self.assertRaises(ValueError):
                catalog._artifact(dict(filename='x.whl', url=url, size=1, sha256='0' * 64))

    def test_synthetic_exact_download_no_retry(self):
        data = b'fixed synthetic bytes'
        pin = dict(filename='x.whl', url='https://files.pythonhosted.org/packages/a/x.whl',
                   size=len(data), sha256=hashlib.sha256(data).hexdigest())
        class Response(io.BytesIO):
            status = 200
            headers = {}
        class Opener:
            count = 0
            def open(self, *_args, **_kwargs):
                self.count += 1
                return Response(data)
        opener = Opener()
        with patch.object(catalog.urllib.request, 'build_opener', return_value=opener):
            path = self.root / 'x.whl'
            self.assertEqual(catalog.acquire_one(pin, path, time.monotonic()+60)['bytes'], len(data))
            with self.assertRaises(FileExistsError):
                catalog.acquire_one(pin, path, time.monotonic()+60)
        self.assertEqual(opener.count, 1)

    def test_oversized_partial_is_preserved(self):
        pin = dict(filename='x.whl', url='https://files.pythonhosted.org/packages/a/x.whl',
                   size=1, sha256='0' * 64)
        response = io.BytesIO(b'ab')
        response.status = 200
        response.headers = {}
        with patch.object(catalog.urllib.request, 'build_opener') as make:
            make.return_value.open.return_value = response
            path = self.root / 'x.whl'
            with self.assertRaisesRegex(ValueError, 'DOWNLOAD_LIMIT'):
                catalog.acquire_one(pin, path, time.monotonic()+60)
            self.assertTrue(path.exists())
            make.return_value.open.assert_called_once()

    def test_redirect_to_arbitrary_host_refused(self):
        request = catalog.urllib.request.Request('https://github.com/astral-sh/x')
        with self.assertRaisesRegex(ValueError, 'REDIRECT'):
            catalog._Redirect().redirect_request(request, None, 302, 'Found', {}, 'https://evil.invalid/x')


if __name__ == '__main__':
    unittest.main()
