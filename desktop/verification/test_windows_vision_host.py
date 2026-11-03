"""Pure host-entry policy and file fixtures; not a Windows/runtime proof."""
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import windows_vision_host as host
import windows_vision_materialize as material


class HostTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()

    def tearDown(self):
        self.tmp.cleanup()

    def index(self):
        hashes = {}
        for name in host.SOURCE_NAMES:
            data = name.encode()
            (self.root / name).write_bytes(data)
            hashes[name] = hashlib.sha256(data).hexdigest()
        raw = material.canonical({'version': 1, 'files': hashes})
        (self.root / 'source-index.json').write_bytes(raw)
        return hashlib.sha256(raw).hexdigest()

    def test_index_external_pin_and_complete_members(self):
        digest = self.index()
        result = host.source_index(self.root, digest)
        self.assertEqual(len(result), 10)
        self.assertEqual(result['source-index.json'], digest)
        with self.assertRaises(ValueError):
            host.source_index(self.root, '0' * 64)

    def test_member_tamper_and_unknown_file_refused(self):
        digest = self.index()
        (self.root / 'windows_vision_host.py').write_bytes(b'changed')
        with self.assertRaises(ValueError):
            host.source_index(self.root, digest)
        digest = self.index()
        (self.root / 'unknown.py').write_bytes(b'')
        with self.assertRaises(ValueError):
            host.source_index(self.root, digest)

    def test_duplicate_index_refused(self):
        raw = b'{"version":1,"version":1,"files":{}}'
        (self.root / 'source-index.json').write_bytes(raw)
        with self.assertRaises(ValueError):
            host.source_index(self.root, hashlib.sha256(raw).hexdigest())

    def test_report_is_exclusive_raw_inventory_bytes(self):
        value = {'version': 1, 'files': [], 'runtimeBytes': 0}
        expected = material.canonical(value)
        digest = host.write_report(self.root, 'installed-inventory.json', value)
        self.assertEqual((self.root / 'installed-inventory.json').read_bytes(), expected)
        self.assertEqual(digest, hashlib.sha256(expected).hexdigest())
        with self.assertRaises(FileExistsError):
            host.write_report(self.root, 'installed-inventory.json', value)

    def test_unlisted_report_path_refused(self):
        with self.assertRaises(ValueError):
            host.write_report(self.root, '../elsewhere', {})
        with self.assertRaises(ValueError):
            host.write_report(self.root, 'arbitrary.py', {})

    def test_fixed_receipt_is_flat_typed_and_canonical(self):
        identity = {'version': '3.12.10', 'executableSha256': 'a' * 64}
        value = host.receipt(identity, 'PREPARE', 'b' * 64,
                             {'wheelCount': 74, 'pythonFiles': 3354,
                              'modelFiles': 3, 'acquiredBytes': 328203212})
        self.assertEqual(len(value), 20)
        self.assertEqual(value['candidateInference'], 'NOT_RUN')
        self.assertIsNone(value['runtimeBytes'])
        self.assertIsNone(value['inventoryBytes'])
        self.assertIsNone(value['expectedInventorySha256'])
        self.assertIs(value['hostIsolated'], True)
        self.assertTrue(all(v is None or type(v) in (str, int, bool) for v in value.values()))
        self.assertEqual(material._json(material.canonical(value)), value)

    def test_fixed_baseline_absent_wrong_malformed_and_changed_inputs_refused(self):
        desktop = Path(__file__).resolve().parents[1]
        path = desktop / 'vision/windows_reproduction_baseline.json'
        digest = host.prepare.REPRODUCTION_BASELINE_SHA256
        value = material._json(path.read_bytes())
        hashes = value['inputs']
        for name, pin in hashes.items():
            self.assertEqual(hashlib.sha256((desktop / 'vision' / name).read_bytes()).hexdigest(), pin)
        self.assertEqual(host.prepare.load_reproduction_baseline(path, digest, hashes), value)
        self.assertFalse(value['runtimeAdmission'])
        self.assertEqual(value['inferenceApproval'], 'NOT_GRANTED')
        self.assertEqual(value['inventory']['files'], 19365)
        self.assertEqual(value['inventory']['bytes'], 3057892)
        with self.assertRaises(FileNotFoundError):
            host.prepare.load_reproduction_baseline(self.root / 'absent.json', digest, hashes)
        for raw in (b'{}', b'bad json', path.read_bytes() + b' '):
            changed = self.root / 'baseline.json'
            changed.write_bytes(raw)
            with self.assertRaises(ValueError):
                host.prepare.load_reproduction_baseline(changed, digest, hashes)
            with self.assertRaises(ValueError):
                host.prepare.load_reproduction_baseline(changed, hashlib.sha256(raw).hexdigest(), hashes)
        for name in hashes:
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'BASELINE_INPUTS'):
                host.prepare.load_reproduction_baseline(path, digest, {**hashes, name: '0' * 64})

    def test_host_freeze_reports_complete_match_or_mismatch_without_root_index(self):
        acquisition = self.root
        source = acquisition / 'host-source'
        source.mkdir()
        reports = acquisition / 'reports'
        reports.mkdir()
        work = acquisition / 'work/00000000-0000-4000-8000-000000000001'
        work.mkdir(parents=True)
        observed = {'version': 1, 'files': [{'path': 'source/fixture.py', 'sha256': 'a' * 64}],
                    'runtimeBytes': 1}
        raw = material.canonical(observed)
        digest = hashlib.sha256(raw).hexdigest()
        expected = {'sha256': digest, 'bytes': len(raw), 'files': 1, 'runtimeBytes': 1}
        hashes = {name: 'b' * 64 for name in host.SOURCE_NAMES}
        identity = {'version': '3.12.10', 'executableSha256': 'c' * 64}
        for comparison in ('MATCH', 'MISMATCH'):
            if comparison == 'MISMATCH':
                expected = {**expected, 'sha256': 'd' * 64}
                (reports / 'installed-inventory.json').unlink()
            with patch.object(host, 'host_identity', return_value=identity), \
                    patch.object(host, 'source_index', return_value=hashes), \
                    patch.object(host.catalog, 'ACQUISITION', str(acquisition)), \
                    patch.object(host.Path, 'cwd', return_value=work), \
                    patch.object(host.sys, 'argv', ['host']), \
                    patch.dict(host.os.environ, {'FONESI_VISION_HOST_STAGE': 'FREEZE'}), \
                    patch.object(host.prepare, 'load_reproduction_baseline', return_value={'inventory': expected}), \
                    patch.object(host.prepare, 'load_members', return_value={}), \
                    patch.object(host.prepare, 'freeze', return_value={'inventory': observed, 'inventorySha256': digest}):
                result = host.run()
            self.assertEqual(result['comparison'], comparison)
            self.assertEqual(result['inventoryBytes'], len(raw))
            self.assertEqual(result['expectedInventorySha256'], expected['sha256'])
            self.assertEqual(result['reportSha256'], digest)
            self.assertEqual((reports / 'installed-inventory.json').read_bytes(), raw)
            self.assertFalse((acquisition / 'installed-inventory.json').exists())

    def test_catalog_total_matches_receipt_guard(self):
        import json
        desktop = Path(__file__).resolve().parents[1]
        value = json.loads((desktop / 'vision/windows_materialization_catalog.json').read_bytes())
        total = value['python']['size'] + value['model']['size']
        total += sum(w['size'] for group in ('preprocess', 'ocr') for w in value[group]['wheels'])
        self.assertEqual(total, 328203212)
        wrapper = (desktop / 'verification/Invoke-VisionMaterialization.ps1').read_text()
        self.assertIn('$v.acquiredBytes -ne ' + str(total), wrapper)

    def test_provider_originals_are_bound_not_deleted_or_regenerated(self):
        desktop = Path(__file__).resolve().parents[1]
        path = desktop / 'vision/windows_python_members.json'
        members = host.prepare.load_members(path, hashlib.sha256(path.read_bytes()).hexdigest())
        originals = {name: pin for name, pin in members.items() if material._special_original(name)}
        self.assertEqual(len(originals), 569)
        self.assertEqual(sum(pin.size for pin in originals.values()), 9252778)
        self.assertTrue(all(name.startswith('python/') for name in originals))
        self.assertEqual(sum(name.endswith('.pyc') for name in originals), 568)

    def test_failure_diagnostic_never_emits_exception_text(self):
        import io
        from types import SimpleNamespace
        output = io.BytesIO()
        with patch.object(host, 'run', side_effect=ValueError('private/path?token=secret')), \
                patch.object(host, '_STAGE', 'SOURCE_INDEX'), \
                patch.object(host.sys, 'stderr', SimpleNamespace(buffer=output)):
            self.assertEqual(host.main(), 2)
        self.assertEqual(material._json(output.getvalue()),
                         {'stage': 'SOURCE_INDEX', 'type': 'ValueError'})
        self.assertNotIn(b'secret', output.getvalue())

    def test_nonwindows_host_is_unavailable_not_spoofed(self):
        with patch.object(host.os, 'name', 'posix'):
            with self.assertRaisesRegex(ValueError, 'HOST_POLICY'):
                host.host_identity()


if __name__ == '__main__':
    unittest.main()
