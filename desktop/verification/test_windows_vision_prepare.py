"""Synthetic test-only roots/acquirer: no network, candidate imports or launch."""
import base64
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest import mock
import zipfile

import windows_vision_prepare as P
import windows_vision_materialize as M


def pin(data):
    return M.ArtifactPin(len(data), hashlib.sha256(data).hexdigest())


def artifact(name, data, **extra):
    return {'filename': name, 'url': 'https://files.pythonhosted.org/packages/synthetic/' + name,
            'size': len(data), 'sha256': pin(data).sha256, **extra}


def tar_bytes(files):
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode='w', format=tarfile.USTAR_FORMAT) as archive:
        for name, data in files.items():
            entry = tarfile.TarInfo(name)
            entry.size = len(data)
            archive.addfile(entry, io.BytesIO(data))
    return out.getvalue()


def wheel_bytes(name):
    files = {name + '/__init__.py': b'# synthetic\n',
             name + '-1.dist-info/METADATA': b'Metadata-Version: 2.1\nName: synthetic\nVersion: 1\n',
             name + '-1.dist-info/WHEEL': b'Wheel-Version: 1.0\nTag: py3-none-any\n'}
    rows = [[n, 'sha256=' + base64.urlsafe_b64encode(hashlib.sha256(d).digest()).rstrip(b'=').decode(), str(len(d))]
            for n, d in files.items()]
    record = name + '-1.dist-info/RECORD'
    rows.append([record, '', ''])
    out = io.StringIO()
    csv.writer(out).writerows(rows)
    files[record] = out.getvalue().encode()
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive:
        for n, d in files.items(): archive.writestr(n, d)
    return buffer.getvalue()


class PrepareTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.root = self.base / 'reserved-candidate'
        self.acq = self.base / 'reserved-acquisition'
        for root in (self.root, self.acq):
            root.mkdir()
            (root / 'work').mkdir()
        python_files = {'python/python.exe': b'NOT executable fixture', 'python/Lib/empty': b''}
        self.members = {name: pin(data) for name, data in python_files.items()}
        pydata = tar_bytes(python_files)
        model_files = {P.MODEL_PREFIX + '/' + n: n.encode() for n in P.MODEL_NAMES}
        modeldata = tar_bytes(model_files)
        self.catalog = {
            'python': artifact('python.tar.gz', pydata),
            'model': artifact('model.tar', modeldata, members=[
                {'path': n, 'bytes': len(d), 'sha256': pin(d).sha256} for n, d in model_files.items()])}
        self.payloads = {'python.tar.gz': pydata, 'model.tar': modeldata}
        self.locks = {}
        for closure in ('preprocess', 'ocr'):
            name = closure + '.whl'
            data = wheel_bytes(closure)
            self.payloads[name] = data
            lock = self.base / (closure + '-requirements-windows.lock')
            lock.write_bytes(b'exact synthetic lock\n')
            self.locks[closure] = lock
            self.catalog[closure] = {'lock': lock.name, 'lockSha256': pin(lock.read_bytes()).sha256,
                                     'wheels': [artifact(name, data, startup={})]}
        self.calls = []
        self.now = 100.0
        def acquire(value, destination, deadline):
            self.calls.append((value['filename'], destination, deadline))
            with destination.open('xb') as stream:
                stream.write(self.payloads[value['filename']])
            return {'untrustedReturn': 'not content proof'}
        self.ops = P.Operations(acquire=acquire, clock=lambda: self.now)

    def prepare(self, **kwargs):
        return P._prepare_at(self.root, self.acq, self.catalog, self.members,
                             self.locks, kwargs.get('deadline', 700.0), kwargs.get('operations', self.ops))

    def complete_tree(self):
        self.prepare()
        for namespace in M.CODE_ROOTS:
            (self.root / namespace).mkdir(exist_ok=True)
        for namespace in ('source', 'tooling', 'preprocess-runtime', 'ocr-runtime'):
            (self.root / namespace / 'fixture.txt').write_bytes(namespace.encode())

    def host_context(self):
        source = self.acq / 'host-source'
        source.mkdir()
        hashes = {}
        for name in P.HOST_SOURCE_NAMES - {'source-index.json'}:
            data = b'# fixed synthetic source\n'
            if name.endswith('-requirements-windows.lock'):
                closure = name.split('-', 1)[0]
                data = self.locks[closure].read_bytes()
                self.locks[closure] = source / name
            (source / name).write_bytes(data)
            hashes[name] = pin(data).sha256
        raw = json.dumps({'version': 1, 'files': hashes}, separators=(',', ':')).encode()
        (source / 'source-index.json').write_bytes(raw)
        hashes['source-index.json'] = pin(raw).sha256
        current = 'work/00000000-0000-4000-8000-000000000001'
        job = self.acq / current
        job.mkdir()
        for name in P.HOST_WORK_DIRECTORIES: (job / name).mkdir()
        return {'version': 1, 'hostSourceHashes': hashes, 'currentWork': current}

    def test_held_host_source_and_current_work_prepare_without_exclusion(self):
        context = self.host_context()
        result = P._prepare_at(self.root, self.acq, self.catalog, self.members,
                               self.locks, 700, self.ops, host_context=context)
        self.assertEqual(result['wheelCount'], 2)
        self.assertEqual(len(list((self.acq / 'host-source').iterdir())), 10)
        self.assertEqual(list((self.root / 'work').iterdir()), [])
        for name in P.HOST_WORK_DIRECTORIES:
            self.assertEqual(list((self.acq / context['currentWork'] / name).iterdir()), [])

    def test_host_context_closed_exact_nine_hashes_and_uuid(self):
        context = self.host_context()
        bads = [{**context, 'extra': True}, {**context, 'version': True},
                {**context, 'currentWork': '../work'}, {**context, 'currentWork': 'work/not-uuid'},
                {**context, 'hostSourceHashes': {**context['hostSourceHashes'], 'extra.py': 'a' * 64}},
                {**context, 'hostSourceHashes': {}}]
        for bad in bads:
            with self.assertRaises(ValueError): P.validate_host_context(bad)
        with self.assertRaisesRegex(ValueError, 'HOST_CONTEXT_HASH'):
            P.validate_host_context({**context, 'hostSourceHashes': {
                **context['hostSourceHashes'], 'source-index.json': 'A' * 64}})

    def test_host_source_unknown_missing_and_changed_files_refuse(self):
        context = self.host_context()
        source = self.acq / 'host-source'
        extra = source / 'unknown.py'
        extra.write_bytes(b'')
        with self.assertRaises(ValueError): P._reserved_acquisition(self.acq, context)
        extra.unlink()
        known = source / 'windows_vision_host.py'
        original = known.read_bytes()
        known.unlink()
        with self.assertRaisesRegex(ValueError, 'HOST_SOURCE_SET'):
            P._reserved_acquisition(self.acq, context)
        known.write_bytes(original + b'changed')
        with self.assertRaisesRegex(ValueError, 'SOURCE_IDENTITY'):
            P._reserved_acquisition(self.acq, context)
        self.assertEqual(self.calls, [])

    def test_source_index_is_externally_bound_not_self_hashing(self):
        context = self.host_context()
        source = self.acq / 'host-source/source-index.json'
        index = json.loads(source.read_bytes())
        index['files']['source-index.json'] = context['hostSourceHashes']['source-index.json']
        source.write_text(json.dumps(index))
        context['hostSourceHashes']['source-index.json'] = pin(source.read_bytes()).sha256
        with self.assertRaisesRegex(ValueError, 'HOST_SOURCE_INDEX'):
            P._reserved_acquisition(self.acq, context)

    def test_host_source_total_bytes_bound_not_just_each_file(self):
        context = self.host_context()
        source = self.acq / 'host-source'
        largest = max(path.stat().st_size for path in source.iterdir())
        total = sum(path.stat().st_size for path in source.iterdir())
        self.assertLess(largest, total)
        with mock.patch.object(M, 'MAX_INVENTORY', total - 1):
            with self.assertRaisesRegex(ValueError, 'SOURCE_IDENTITY'):
                P._reserved_acquisition(self.acq, context)

    def test_current_work_only_exact_uuid_and_empty_four_directories(self):
        context = self.host_context()
        job = self.acq / context['currentWork']
        unknown = job / 'cache'
        unknown.mkdir()
        with self.assertRaises(ValueError): P._reserved_acquisition(self.acq, context)
        unknown.rmdir()
        unknown = job / 'tmp/unexpected.py'
        unknown.write_bytes(b'')
        with self.assertRaisesRegex(ValueError, 'CURRENT_WORK_NOT_EMPTY'):
            P._reserved_acquisition(self.acq, context)
        unknown.unlink()
        another = self.acq / 'work/00000000-0000-4000-8000-000000000002'
        another.mkdir()
        with self.assertRaises(ValueError): P._reserved_acquisition(self.acq, context)

    def test_host_source_binding_cannot_redirect_catalog_locks_or_member_hash(self):
        context = self.host_context()
        source = self.acq / 'host-source'
        args = [self.acq, context, source / 'windows_materialization_catalog.json',
                context['hostSourceHashes']['windows_materialization_catalog.json'],
                source / 'windows_python_members.json',
                context['hostSourceHashes']['windows_python_members.json'], self.locks]
        P._host_sources(*args)
        for index, replacement in [(2, self.base / 'other.json'), (3, '0' * 64),
                                    (4, self.base / 'other.json'), (5, '0' * 64),
                                    (6, {**self.locks, 'ocr': self.base / 'other.lock'})]:
            bad = list(args)
            bad[index] = replacement
            with self.assertRaisesRegex(ValueError, 'HOST_SOURCE_BINDING'):
                P._host_sources(*bad)

    def test_prepare_exact_separate_closures_fixed_model_and_deadline(self):
        result = self.prepare()
        self.assertEqual(result['execution'], 'NOT_RUN')
        self.assertEqual(result['wheelCount'], 2)  # synthetic scope, not actual74 proof
        self.assertEqual(result['acquiredBytes'], sum(map(len, self.payloads.values())))
        self.assertEqual({call[2] for call in self.calls}, {700.0})
        self.assertEqual([c[0] for c in self.calls], ['python.tar.gz', 'preprocess.whl', 'ocr.whl', 'model.tar'])
        self.assertTrue((self.acq / 'preprocess-wheelhouse/preprocess.whl').is_file())
        self.assertTrue((self.acq / 'ocr-wheelhouse/ocr.whl').is_file())
        self.assertEqual((self.root / 'python/python.exe').read_bytes(), b'NOT executable fixture')
        for name in P.MODEL_NAMES:
            self.assertEqual((self.root / 'model/english' / name).read_bytes(), name.encode())
        self.assertTrue((self.root / 'work').is_dir())
        self.assertEqual(list((self.root / 'work').iterdir()), [])
        self.assertFalse((self.root / 'ocr-runtime').exists())

    def test_no_network_backend_called_in_synthetic_seam(self):
        with mock.patch.object(P.catalog_api, 'acquire_one', side_effect=AssertionError('network')):
            self.prepare()
        self.assertEqual(len(self.calls), 4)

    def test_nonwindows_public_entry_refuses_before_any_io(self):
        if os.name != 'nt':
            with self.assertRaisesRegex(ValueError, 'WINDOWS_HOST_REQUIRED'):
                P.prepare(None, None, None, None, None, 700, host_context=None)
            with self.assertRaisesRegex(ValueError, 'WINDOWS_HOST_REQUIRED'):
                P.freeze()
        else:
            # The production paths are source constants, never test temp overrides.
            roots = P._roots()
            self.assertEqual(tuple(map(str, roots)), (P.catalog_api.ROOT, P.catalog_api.ACQUISITION))

    def test_deadline_expired_nonfinite_boolean_and_over600_refuse_before_acquisition(self):
        for deadline in [100, 99, True, float('inf'), float('nan'), 701]:
            with self.assertRaisesRegex(ValueError, 'DEADLINE'):
                self.prepare(deadline=deadline)
        self.assertEqual(self.calls, [])

    def test_deadline_shared_and_expiry_prevents_later_operations(self):
        original = self.ops.acquire
        def delayed(value, destination, deadline):
            original(value, destination, deadline)
            self.now = 701
        with self.assertRaisesRegex(ValueError, 'DEADLINE'):
            self.prepare(operations=self.ops._replace(acquire=delayed))
        self.assertEqual(len(self.calls), 1)
        self.assertTrue((self.acq / 'python.tar.gz').exists())
        self.assertFalse((self.root / 'python').exists())

    def test_reserved_roots_allow_only_empty_work(self):
        for root in (self.root, self.acq):
            bad = root / 'work/code.py'
            bad.write_bytes(b'')
            with self.assertRaisesRegex(ValueError, 'RESERVED_WORK_NOT_EMPTY'):
                self.prepare()
            bad.unlink()
            bad = root / 'unknown'
            bad.mkdir()
            with self.assertRaisesRegex(ValueError, 'RESERVED_ROOT_NOT_FRESH'):
                self.prepare()
            bad.rmdir()
        self.assertEqual(self.calls, [])

    def test_lock_hash_failure_precedes_acquisition_or_mutation(self):
        self.locks['ocr'].write_bytes(b'tampered')
        with self.assertRaisesRegex(ValueError, 'SOURCE_IDENTITY'):
            self.prepare()
        self.assertEqual(self.calls, [])
        self.assertEqual([p.name for p in self.acq.iterdir()], ['work'])

    def test_acquirer_result_is_not_trusted_and_no_retry(self):
        def corrupt(value, destination, deadline):
            self.calls.append(value['filename'])
            destination.write_bytes(b'incorrect')
            return {'bytes': value['size'], 'sha256': value['sha256']}
        with self.assertRaises(ValueError):
            self.prepare(operations=self.ops._replace(acquire=corrupt))
        self.assertEqual(self.calls, ['python.tar.gz'])
        self.assertTrue((self.acq / 'python.tar.gz').is_file())

    def test_inspection_failure_preserves_acquisition_and_never_stages(self):
        def refuse(*args): raise ValueError('synthetic startup refusal')
        with self.assertRaisesRegex(ValueError, 'synthetic startup refusal'):
            self.prepare(operations=self.ops._replace(inspect=refuse))
        self.assertEqual(len(self.calls), 2)
        self.assertFalse((self.root / 'python').exists())
        self.assertTrue((self.acq / 'preprocess-wheelhouse/preprocess.whl').exists())

    def test_staging_failure_is_preserved_never_retried(self):
        def refuse(*args, **kwargs): raise ValueError('synthetic stage refusal')
        with self.assertRaisesRegex(ValueError, 'synthetic stage refusal'):
            self.prepare(operations=self.ops._replace(stage=refuse))
        self.assertEqual(len(self.calls), 4)
        with self.assertRaisesRegex(ValueError, 'RESERVED_ROOT_NOT_FRESH'):
            self.prepare()
        self.assertEqual(len(self.calls), 4)

    def test_model_member_set_must_be_exact_three(self):
        self.catalog['model']['members'].pop()
        with self.assertRaisesRegex(ValueError, 'MODEL_MEMBERS'):
            self.prepare()
        self.assertEqual(self.calls, [])

    def test_member_inventory_schema_hash_duplicate_and_alias(self):
        rows = [{'path': n, 'bytes': p.size, 'sha256': p.sha256} for n, p in self.members.items()]
        path = self.base / 'members.json'
        raw = json.dumps(rows).encode()
        path.write_bytes(raw)
        self.assertEqual(P.load_members(path, pin(raw).sha256), self.members)
        with self.assertRaisesRegex(ValueError, 'SOURCE_IDENTITY'):
            P.load_members(path, '0' * 64)
        for value in [rows * 2, [{'path': '../x', 'bytes': 0, 'sha256': 'a' * 64}],
                      [{'path': 'python/x', 'bytes': True, 'sha256': 'a' * 64}]]:
            path.write_text(json.dumps(value))
            with self.assertRaises(ValueError):
                P.load_members(path, pin(path.read_bytes()).sha256)

    def test_freeze_refuses_prepare_only_tree(self):
        self.prepare()
        with self.assertRaises(FileNotFoundError):
            P._freeze_at(self.root)

    def test_freeze_exact_inventory_and_approved_digest(self):
        self.complete_tree()
        result = P._freeze_at(self.root)
        self.assertEqual(result['comparison'], 'NOT_REQUESTED')
        self.assertEqual(result['execution'], 'NOT_RUN')
        approved = P._freeze_at(self.root, result['inventory'], result['inventorySha256'])
        self.assertEqual(approved['comparison'], 'MATCH')
        self.assertFalse((self.root / 'installed-inventory.json').exists())
        with self.assertRaisesRegex(ValueError, 'APPROVED_INVENTORY_HASH'):
            P._freeze_at(self.root, approved_sha256='0' * 64)

    def reproduction_summary(self, inventory):
        raw = M.canonical(inventory)
        return {'sha256': pin(raw).sha256, 'bytes': len(raw),
                'files': len(inventory['files']), 'runtimeBytes': inventory['runtimeBytes']}

    def test_reproduction_full_match_and_each_summary_dimension(self):
        self.complete_tree()
        observed = P._freeze_at(self.root)['inventory']
        expected = self.reproduction_summary(observed)
        result = P.compare_reproduction(observed, expected)
        self.assertEqual(result['comparison'], 'MATCH')
        self.assertEqual(result['inventoryBytes'], len(M.canonical(observed)))
        self.assertEqual(result['expectedInventorySha256'], expected['sha256'])
        for field in expected:
            changed = dict(expected)
            changed[field] = '0' * 64 if field == 'sha256' else expected[field] + 1
            with self.subTest(field=field):
                self.assertEqual(P.compare_reproduction(observed, changed)['comparison'], 'MISMATCH')
        self.assertFalse((self.root / 'installed-inventory.json').exists())

    def test_reproduction_byte_file_and_generated_launcher_changes_are_diagnostic(self):
        self.complete_tree()
        launcher = self.root / 'ocr-runtime/Scripts/generated.exe'
        launcher.parent.mkdir()
        launcher.write_bytes(b'fixture launcher A')
        first = P._freeze_at(self.root)['inventory']
        expected = self.reproduction_summary(first)
        launcher.write_bytes(b'fixture launcher B')
        changed = P._freeze_at(self.root)['inventory']
        self.assertEqual(P.compare_reproduction(changed, expected)['comparison'], 'MISMATCH')
        self.assertEqual(len(changed['files']), len(first['files']))
        (self.root / 'source/fixture.txt').write_bytes(b'X')
        self.assertEqual(P.compare_reproduction(P._freeze_at(self.root)['inventory'], expected)
                         ['comparison'], 'MISMATCH')
        (self.root / 'source/extra.py').write_bytes(b'# synthetic')
        extra = P._freeze_at(self.root)['inventory']
        self.assertEqual(len(extra['files']), len(first['files']) + 1)
        self.assertEqual(P.compare_reproduction(extra, expected)['comparison'], 'MISMATCH')

    def test_reproduction_refuses_malformed_summary_and_observation(self):
        self.complete_tree()
        observed = P._freeze_at(self.root)['inventory']
        expected = self.reproduction_summary(observed)
        for field in expected:
            malformed = dict(expected)
            malformed[field] = True
            with self.assertRaisesRegex(ValueError, 'BASELINE_INVENTORY_SCHEMA'):
                P.compare_reproduction(observed, malformed)
        with self.assertRaises(ValueError):
            P.compare_reproduction({'files': []}, expected)
        with self.assertRaises(ValueError):
            P.compare_reproduction(observed, {**expected, 'extra': 1})

    def test_freeze_forwards_exact_original_special_map_without_normalization(self):
        self.complete_tree()
        relative = 'python/Lib/provider.pyc'
        path = self.root / relative
        path.write_bytes(b'provider original')
        originals = {relative: pin(b'provider original')}
        with self.assertRaisesRegex(ValueError, 'UNEXPECTED_GENERATED_FILE'):
            P._freeze_at(self.root)
        result = P._freeze_at(self.root, original_special_files=originals)
        self.assertIn({'path': relative, 'sha256': originals[relative].sha256}, result['inventory']['files'])
        same = P._freeze_at(self.root, result['inventory'], result['inventorySha256'],
                            original_special_files=originals)
        self.assertEqual(same['comparison'], 'MATCH')
        path.write_bytes(b'changed original')
        with self.assertRaisesRegex(ValueError, 'ORIGINAL_SPECIAL_CHANGED'):
            P._freeze_at(self.root, original_special_files=originals)

    def test_freeze_raw_difference_and_unknown_code_refuse_approval(self):
        self.complete_tree()
        result = P._freeze_at(self.root)
        (self.root / 'source/fixture.txt').write_bytes(b'changed\r\n')
        with self.assertRaisesRegex(ValueError, 'INVENTORY_MISMATCH'):
            P._freeze_at(self.root, result['inventory'])
        (self.root / 'source/unknown.py').write_bytes(b'')
        with self.assertRaisesRegex(ValueError, 'APPROVED_INVENTORY_HASH'):
            P._freeze_at(self.root, approved_sha256=result['inventorySha256'])


if __name__ == '__main__':
    unittest.main()
