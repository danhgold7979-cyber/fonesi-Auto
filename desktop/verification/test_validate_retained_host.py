import contextlib
import io
import json
from pathlib import Path
import re
import tempfile
import unittest
from unittest import mock
import validate_retained_host as validator


def sample():
    return {'version': 1, 'scope': validator.SCOPE,
            'excludedVaultContext': 'P106_UNMET_NOT_RERUN',
            'bootstrap': {'version': 1, 'cases': dict.fromkeys(validator.BOOTSTRAP, True)},
            'observation': {'version': 1, 'scope': validator.SCOPE,
                            'cases': dict.fromkeys(validator.CASES, True),
                            'readyCount': 1, 'closedCount': 1},
            'process': {'status': 'SUCCESS', 'exitCode': 0, 'cleanupComplete': True,
                        'stdoutTruncated': False, 'stderrTruncated': False},
            'originalArchiveUnchanged': True, 'originalSourceUnchanged': True,
            'directoryCleanup': True, 'failure': None}


def fixture(directory, stdout='PERSISTENCE_DESKTOP_CLOSED\n'):
    base = Path(directory).resolve() / '.retained-host-runtime'
    base.mkdir()
    root = base / 'r'
    root.mkdir()
    (root / '.owner').write_text('12345678-1234-4234-8234-123456789abc')
    value = sample()
    rows = {'bootstrap.json': value['bootstrap'], 'retained-host-result.json': value['observation'],
            'launcher-capture.json': {'process': value['process'], 'stdout': stdout, 'stderr': ''},
            'integrity.json': {'version': 1, 'originalArchiveUnchanged': True,
                               'originalSourceUnchanged': True}}
    for name, row in rows.items():
        (root / name).write_text(json.dumps(row))
    return base, root


class RetainedHostEvidence(unittest.TestCase):
    def test_complete_and_canonical_reconstruction(self):
        result = validator.validate(sample())
        self.assertTrue(result['passed'])
        self.assertEqual(validator.validate(result), result)
        self.assertNotIn('screenshots', result)

    def test_every_required_boolean_controls_pass(self):
        for section in ('bootstrap', 'observation'):
            for key in sample()[section]['cases']:
                value = sample()
                value[section]['cases'][key] = False
                self.assertFalse(validator.validate(value)['passed'])
        for key in (*validator.INTEGRITY, 'directoryCleanup'):
            value = sample()
            value[key] = False
            self.assertFalse(validator.validate(value)['passed'])
        for key in ('cleanupComplete', 'stdoutTruncated', 'stderrTruncated'):
            value = sample()
            value['process'][key] = not value['process'][key]
            self.assertFalse(validator.validate(value)['passed'])

    def test_missing_or_unknown_fields_and_private_values_reject(self):
        for section in ('bootstrap', 'observation'):
            for key in sample()[section]['cases']:
                value = sample()
                del value[section]['cases'][key]
                with self.assertRaises(ValueError):
                    validator.validate(value)
        for mutate in (lambda v: v.update(path='C:\\private'),
                       lambda v: v['observation']['cases'].update(uuid='private'),
                       lambda v: v.update(scope='other'),
                       lambda v: v['process'].update(status='C:\\private'),
                       lambda v: v.update(failure='12345678-1234-4234-8234-123456789abc'),
                       lambda v: v['observation'].update(readyCount=True),
                       lambda v: v['bootstrap'].update(version=True),
                       lambda v: v['process'].update(exitCode=True)):
            value = sample()
            mutate(value)
            with self.assertRaises(ValueError):
                validator.validate(value)

    def test_no_empty_or_partial_false_success(self):
        value = sample()
        value.update(bootstrap=None, observation=None, process=None,
                     directoryCleanup=False, failure='PREPARE_FAILED')
        self.assertFalse(validator.validate(value)['passed'])
        value['passed'] = True
        with self.assertRaises(ValueError):
            validator.validate(value)
        del value['passed']
        value['failure'] = None
        with self.assertRaises(ValueError):
            validator.validate(value)
        for group in ('bootstrap', 'observation', 'process'):
            value = sample()
            value[group] = {}
            value['failure'] = 'NATIVE_FAILED'
            with self.assertRaises(ValueError):
                validator.validate(value)
        value = sample()
        value['failure'] = 'CLEANUP_FAILED'
        self.assertFalse(validator.validate(value)['passed'])

    def test_duplicate_and_oversized_json_never_normalize_to_pass(self):
        for raw in (b'{"version":1,"versi\\u006fn":1}', b'{"value":NaN}',
                    b' ' * 65537, b'\xff', b''):
            with self.assertRaises(ValueError):
                validator.parse(raw)

    def test_process_codes_consistent_and_nonzero_is_not_success(self):
        value = sample()
        value['process'].update(status='NONZERO_EXIT', exitCode=1)
        self.assertFalse(validator.validate(value)['passed'])
        for status, code in (('SUCCESS', 1), ('TIMEOUT', 0), ('NONZERO_EXIT', 0)):
            value = sample()
            value['process'].update(status=status, exitCode=code)
            with self.assertRaises(ValueError):
                validator.validate(value)

    def test_real_owned_stage_exclusive_and_cleanup_handoff(self):
        with tempfile.TemporaryDirectory() as directory:
            base, root = fixture(directory)
            integrity = (root / 'integrity.json').read_bytes()
            self.assertTrue(validator.stage(root))
            self.assertEqual((root / 'integrity.json').read_bytes(), integrity)
            value = validator.parse((root / 'public.json').read_bytes())
            self.assertFalse(value['passed'])
            self.assertFalse(value['directoryCleanup'])
            with self.assertRaises(FileExistsError):
                validator.stage(root)
            # Synthetic supervisor handoff: does not assert native cleanup executed.
            value.pop('passed')
            value['directoryCleanup'] = True
            (base / 'unvalidated.json').write_text(json.dumps(value))
            self.assertTrue(validator.publish(base))
            self.assertTrue(validator.parse((base / 'validated.json').read_bytes())['passed'])
            with self.assertRaises(FileExistsError):
                validator.publish(base)

    def test_current_stage_requires_fixed_r_and_exact_owner_without_legacy_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            base, root = fixture(directory)
            with self.assertRaises(FileExistsError):
                root.mkdir()
            before = (root / 'integrity.json').read_bytes()
            legacy = base / 'run-12345678-1234-4234-8234-123456789abc'
            root.rename(legacy)
            with self.assertRaises(ValueError):
                validator.stage(legacy)
            self.assertFalse((legacy / 'public.json').exists())
            legacy.rename(root)
            marker = root / '.owner'
            owner = marker.read_bytes()
            marker.write_bytes(owner + b'\n')
            with self.assertRaises(ValueError):
                validator.stage(root)
            marker.write_bytes(owner)
            with self.assertRaises(ValueError):
                validator.stage(root / '..' / 'r')
            self.assertEqual((root / 'integrity.json').read_bytes(), before)
            self.assertTrue(validator.stage(root))

    def test_capture_only_zero_or_one_leading_blank_and_fixed_failure_denied(self):
        for text, accepted in (('PERSISTENCE_DESKTOP_CLOSED\r\n', True),
                               ('\r\nPERSISTENCE_DESKTOP_CLOSED\r\n', True),
                               ('\n\nPERSISTENCE_DESKTOP_CLOSED\n', False),
                               (' PERSISTENCE_DESKTOP_CLOSED\n', False),
                               ('PERSISTENCE_DESKTOP_CLOSED', False)):
            with tempfile.TemporaryDirectory() as directory:
                _, root = fixture(directory, text)
                if accepted:
                    self.assertTrue(validator.stage(root))
                else:
                    with self.assertRaises(ValueError):
                        validator.stage(root)
                    self.assertFalse((root / 'public.json').exists())
        with tempfile.TemporaryDirectory() as directory:
            _, root = fixture(directory)
            file = root / 'launcher-capture.json'
            value = json.loads(file.read_text())
            value['stderr'] = 'RETAINED_HOST_FAILED\n'
            file.write_text(json.dumps(value))
            with self.assertRaises(ValueError):
                validator.stage(root)

    def test_stage_integrity_false_cannot_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            _, root = fixture(directory)
            file = root / 'integrity.json'
            value = json.loads(file.read_text())
            value['originalSourceUnchanged'] = False
            file.write_text(json.dumps(value))
            self.assertFalse(validator.stage(root))
            self.assertFalse(validator.parse((root / 'public.json').read_bytes())['originalSourceUnchanged'])

    def test_owned_stage_rechecks_original_records_before_write(self):
        with tempfile.TemporaryDirectory() as directory:
            _, root = fixture(directory)
            original = validator._admit_root
            calls = 0
            def changing(path):
                nonlocal calls
                calls += 1
                result = original(path)
                if calls == 2:
                    (root / 'integrity.json').write_text('{}')
                return result
            with mock.patch.object(validator, '_admit_root', side_effect=changing):
                with self.assertRaises(ValueError):
                    validator.stage(root)
            self.assertFalse((root / 'public.json').exists())

    def test_valid_failure_publish_and_cli_no_raw_exception(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory).resolve()
            value = sample()
            value.update(bootstrap=None, observation=None, process=None,
                         originalArchiveUnchanged=False, originalSourceUnchanged=False,
                         directoryCleanup=False, failure='PREPARE_FAILED')
            (base / 'unvalidated.json').write_text(json.dumps(value))
            self.assertFalse(validator.publish(base))
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(validator.main(['stage', '/not/an/owned/private/path']), 2)
        self.assertEqual(output.getvalue(), 'RETAINED_HOST_VALIDATION_INVALID\n')

    def test_static_contract_and_bootstrap_parity(self):
        base = Path(__file__).resolve().parent
        contract = (base / 'retained-host-contract.cjs').read_text()
        control = (base / 'retained-host-control.cjs').read_text()
        for source, name, expected in ((contract, 'CASES', validator.CASES),
                                       (control, 'BOOTSTRAP', validator.BOOTSTRAP)):
            body = re.search(r'const '+name+r' = Object.freeze\(\[(.*?)\]\);', source, re.S)
            self.assertIsNotNone(body)
            self.assertEqual(tuple(re.findall(r"'([^']+)'", body.group(1))), expected)
        self.assertIn("const SCOPE = '"+validator.SCOPE+"'", contract)



def managed_sample():
    process = sample()['process']
    return {'version': 1, 'scope': validator.MANAGED_SCOPE,
            'compileProcess': {**process, 'status': 'EMPTY_OUTPUT'},
            'fixtureProcess': dict(process), 'groupsPassed': 8, 'compilerDiagnostics': [],
            'sourceUnchanged': True, 'directoryCleanup': True, 'passed': True}


def managed_text(value, stages=()):
    marker = 'RETAINED_MANAGED_FIXTURE_PASS' if value['passed'] else 'RETAINED_MANAGED_FIXTURE_FAIL'
    return ('\n'.join([*stages, json.dumps(value, separators=(',', ':')), marker]) + '\n').encode()


class ManagedEvidence(unittest.TestCase):
    def test_actual_worker_shape_and_empty_output_compile(self):
        value = managed_sample()
        self.assertEqual(validator.managed_output(managed_text(value)), value)
        value['compileProcess']['status'] = 'SUCCESS'
        self.assertEqual(validator.managed_output(managed_text(value)), value)

    def test_false_compile_no_exit_and_forged_pass_cannot_succeed(self):
        for mutate in (lambda v: v.update(compileProcess=None),
                       lambda v: v['fixtureProcess'].update(exitCode=None),
                       lambda v: v['fixtureProcess'].update(cleanupComplete=False),
                       lambda v: v['compileProcess'].update(stdoutTruncated=True),
                       lambda v: v.update(sourceUnchanged=False),
                       lambda v: v.update(directoryCleanup=False),
                       lambda v: v.update(groupsPassed=0)):
            value = managed_sample()
            mutate(value)
            with self.assertRaises(ValueError):
                validator.managed_output(managed_text(value))

    def test_realistic_fixed_compile_failure_is_publishable_fail(self):
        value = managed_sample()
        value.update(compileProcess={**value['compileProcess'], 'status': 'NONZERO_EXIT', 'exitCode': 1},
                     fixtureProcess=None, groupsPassed=0, compilerDiagnostics=['CS0122', 'OTHER'],
                     sourceUnchanged=False, passed=False)
        result = validator.managed_output(managed_text(value, ['RETAINED_MANAGED_STAGE_COMPILE']))
        self.assertFalse(result['passed'])
        for code in ('CS9999', '/private/path'):
            value['compilerDiagnostics'] = [code]
            with self.assertRaises(ValueError):
                validator.managed_output(managed_text(value))

    def test_private_lines_duplicate_json_and_extra_properties_reject(self):
        raw = managed_text(managed_sample())
        for bad in (b'private/path\n' + raw, raw + b'RETAINED_MANAGED_FIXTURE_PASS\n',
                    b'\n' + raw, raw.replace(b'"version":1', b'"version":1,"version":1'),
                    raw.replace(b'"version":1', b'"version":1,"path":"private"'),
                    raw.replace(b'RETAINED_MANAGED_FIXTURE_PASS', b'RETAINED_MANAGED_FIXTURE_FAIL'),
                    raw[:-1], b'x' * 16385):
            with self.assertRaises(ValueError):
                validator.managed_output(bad)

    def test_actual_exclusive_managed_file_publication(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory).resolve()
            (base / '.retained-managed-output.txt').write_bytes(managed_text(managed_sample()))
            self.assertTrue(validator.managed(base))
            result = validator.parse((base / 'retained-managed-validated.json').read_bytes())
            self.assertEqual(result, managed_sample())
            self.assertEqual([p.name for p in base.iterdir() if not p.name.startswith('.')],
                             ['retained-managed-validated.json'])
            with self.assertRaises(FileExistsError):
                validator.managed(base)

    def test_worker_schema_and_diagnostic_enum_parity(self):
        source = (Path(__file__).resolve().parent / 'Invoke-RetainedManagedFixture.ps1').read_text()
        for key in managed_sample():
            self.assertRegex(source, re.escape(key) + r'=')
        for code in validator.COMPILER_CODES:
            self.assertIn("'" + code + "'", source)
        self.assertIn("scope='" + validator.MANAGED_SCOPE + "'", source)
        self.assertIn('RETAINED_MANAGED_FIXTURE_PASS', source)
        self.assertIn('RETAINED_MANAGED_FIXTURE_FAIL', source)

class ManagedCurrentEvidence(unittest.TestCase):
    def current(self):
        return {**managed_sample(), 'version': 2, 'groupsPassed': 10,
                'inputHashes': dict(validator.MANAGED_V2_HASHES)}

    def test_current_requires_ten_groups_and_exact_hashes_historical_remains_eight(self):
        value = self.current()
        self.assertEqual(validator.managed_output(managed_text(value)), value)
        self.assertEqual(validator.validate_managed(managed_sample())['groupsPassed'], 8)
        for change in ({'groupsPassed': 8}, {'inputHashes': {}}, {'version': 1}):
            with self.assertRaises(ValueError):
                validator.validate_managed({**value, **change})
        for key in validator.MANAGED_V2_HASHES:
            bad = self.current()
            bad['inputHashes'][key] = '0' * 64
            with self.assertRaises(ValueError):
                validator.validate_managed(bad)
        bad = self.current()
        bad['inputHashes']['private/path'] = 'a'*64
        with self.assertRaises(ValueError):
            validator.validate_managed(bad)

    def test_current_failures_do_not_need_unobserved_hashes_or_fabricated_execution(self):
        value = {**self.current(), 'inputHashes': {}, 'compileProcess': None,
                 'fixtureProcess': None, 'groupsPassed': 0, 'sourceUnchanged': False,
                 'directoryCleanup': False, 'passed': False}
        self.assertFalse(validator.managed_output(managed_text(value, ['RETAINED_MANAGED_STAGE_ADMISSION']))['passed'])

    def test_historical_ten_group_hashes_refuse_changed_server_protocol_and_fixture(self):
        import hashlib
        paths = ('native/IsolatedAdbServer.cs', 'native/RetainedAdbSession.cs',
                 'native/RetainedAdbProtocol.cs', 'native/RetainedHostAdmission.cs',
                 'tests/fixtures/RetainedAdbProtocolFixture.cs', '../tools/phase-00/HostProbeNative.cs',
                 'scripts/retained-managed-fixture.mjs', 'verification/Invoke-RetainedManagedFixture.ps1',
                 'verification/WindowsBoundary.psm1', 'verification/OwnedFiles.psm1')
        base = Path(__file__).resolve().parents[1]
        changed = set()
        current = self.current()
        for (key, expected), relative in zip(validator.MANAGED_V2_HASHES.items(), paths):
            actual = hashlib.sha256((base/relative).read_bytes()).hexdigest()
            current['inputHashes'][key] = actual
            if actual != expected:
                changed.add(key)
        self.assertEqual(changed, {'session', 'protocol', 'fixture', 'gate', 'wrapper'})
        with self.assertRaises(ValueError):
            validator.validate_managed(current)
        self.assertEqual(validator.validate_managed(self.current())['groupsPassed'], 10)


class ManagedServerEvidence(unittest.TestCase):
    def current(self):
        return {**managed_sample(), 'version': 3, 'groupsPassed': 19,
                'inputHashes': dict(validator.MANAGED_V3_HASHES)}

    def test_historical_nineteen_requires_exact_hashes_and_refuses_current_inputs(self):
        value = self.current()
        self.assertEqual(validator.managed_output(managed_text(value)), value)
        for version, groups, pins in ((1, 8, None), (2, 10, validator.MANAGED_V2_HASHES)):
            old = {**managed_sample(), 'version': version, 'groupsPassed': groups}
            if pins is not None:
                old['inputHashes'] = dict(pins)
            self.assertTrue(validator.validate_managed(old)['passed'])
            with self.assertRaises(ValueError):
                validator.validate_managed({**old, 'version': 3})
        for groups in (8, 10, 18, 20):
            with self.assertRaises(ValueError):
                validator.validate_managed({**value, 'groupsPassed': groups})
        for key in validator.MANAGED_V3_HASHES:
            bad = self.current()
            bad['inputHashes'][key] = '0' * 64
            with self.assertRaises(ValueError):
                validator.validate_managed(bad)
        base = Path(__file__).resolve().parents[1]
        import hashlib
        paths = ('native/IsolatedAdbServer.cs','native/RetainedAdbSession.cs','native/RetainedAdbProtocol.cs','native/RetainedHostAdmission.cs','tests/fixtures/RetainedAdbProtocolFixture.cs','../tools/phase-00/HostProbeNative.cs','scripts/retained-managed-fixture.mjs','verification/Invoke-RetainedManagedFixture.ps1','verification/WindowsBoundary.psm1','verification/OwnedFiles.psm1')
        actual = [hashlib.sha256((base/p).read_bytes()).hexdigest() for p in paths]
        self.assertEqual({key for (key, expected), found in zip(validator.MANAGED_V3_HASHES.items(), actual) if expected != found}, {'session', 'protocol', 'fixture', 'gate', 'wrapper'})
        with self.assertRaises(ValueError):
            validator.validate_managed({**self.current(), 'inputHashes': dict(zip(validator.MANAGED_V3_HASHES, actual))})

    def test_current_server_publisher_exclusively_requires_v3(self):
        for value in (managed_sample(), ManagedCurrentEvidence().current(), self.current(), ManagedDiscoveryEvidence().current()):
            with tempfile.TemporaryDirectory() as directory:
                base=Path(directory).resolve()
                (base/'.retained-managed-output.txt').write_bytes(managed_text(value))
                if value['version'] != 3:
                    with self.assertRaises(ValueError): validator.managed(base, True)
                    self.assertFalse((base/'retained-managed-validated.json').exists())
                else:
                    self.assertTrue(validator.managed(base, True))
                    self.assertEqual(validator.parse((base/'retained-managed-validated.json').read_bytes()),value)
                    with self.assertRaises(FileExistsError): validator.managed(base, True)

    def test_current_failure_remains_truthful_without_compilation_or_hash_fabrication(self):
        value={**self.current(),'inputHashes':{},'compileProcess':None,'fixtureProcess':None,'groupsPassed':0,'sourceUnchanged':False,'directoryCleanup':False,'passed':False}
        self.assertFalse(validator.managed_output(managed_text(value,['RETAINED_MANAGED_STAGE_ADMISSION']))['passed'])

class ManagedDiscoveryEvidence(unittest.TestCase):
    def current(self):
        return {**managed_sample(), 'version': 4, 'groupsPassed': 27,
                'inputHashes': dict(validator.MANAGED_V4_HASHES)}

    def test_current_twentyseven_requires_exact_hashes_and_never_relabels_historical(self):
        value = self.current()
        self.assertEqual(validator.managed_output(managed_text(value)), value)
        for version, groups, pins in ((1, 8, None), (2, 10, validator.MANAGED_V2_HASHES), (3, 19, validator.MANAGED_V3_HASHES)):
            old = {**managed_sample(), 'version': version, 'groupsPassed': groups}
            if pins is not None:
                old['inputHashes'] = dict(pins)
            self.assertTrue(validator.validate_managed(old)['passed'])
            with self.assertRaises(ValueError):
                validator.validate_managed({**old, 'version': 4})
        for groups in (8, 10, 19, 26, 28):
            with self.assertRaises(ValueError):
                validator.validate_managed({**value, 'groupsPassed': groups})
        for key in validator.MANAGED_V4_HASHES:
            bad = self.current()
            bad['inputHashes'][key] = '0' * 64
            with self.assertRaises(ValueError):
                validator.validate_managed(bad)

    def test_current_discovery_publisher_exclusively_requires_v4(self):
        for value in (managed_sample(), ManagedCurrentEvidence().current(), ManagedServerEvidence().current(), self.current()):
            with tempfile.TemporaryDirectory() as directory:
                base=Path(directory).resolve()
                (base/'.retained-managed-output.txt').write_bytes(managed_text(value))
                if value['version'] != 4:
                    with self.assertRaises(ValueError): validator.managed(base, False, True)
                    self.assertFalse((base/'retained-managed-validated.json').exists())
                else:
                    self.assertTrue(validator.managed(base, False, True))
                    self.assertEqual(validator.parse((base/'retained-managed-validated.json').read_bytes()),value)
                    with self.assertRaises(FileExistsError): validator.managed(base, False, True)

    def test_current_failure_remains_truthful_without_compilation_or_hash_fabrication(self):
        value={**self.current(),'inputHashes':{},'compileProcess':None,'fixtureProcess':None,'groupsPassed':0,'sourceUnchanged':False,'directoryCleanup':False,'passed':False}
        self.assertFalse(validator.managed_output(managed_text(value,['RETAINED_MANAGED_STAGE_ADMISSION']))['passed'])

class ManagedMetadataEvidence(unittest.TestCase):
    def current(self):
        return {**managed_sample(), 'version': 5, 'groupsPassed': 39,
                'inputHashes': dict(validator.MANAGED_V5_HASHES)}

    def test_current_thirtynine_requires_exact_hashes_and_never_relabels_historical(self):
        value = self.current()
        self.assertEqual(validator.managed_output(managed_text(value)), value)
        for version, groups, pins in ((1, 8, None), (2, 10, validator.MANAGED_V2_HASHES), (3, 19, validator.MANAGED_V3_HASHES), (4, 27, validator.MANAGED_V4_HASHES)):
            old = {**managed_sample(), 'version': version, 'groupsPassed': groups}
            if pins is not None:
                old['inputHashes'] = dict(pins)
            self.assertTrue(validator.validate_managed(old)['passed'])
            with self.assertRaises(ValueError):
                validator.validate_managed({**old, 'version': 5})
        for groups in (8, 10, 19, 27, 38, 40):
            with self.assertRaises(ValueError):
                validator.validate_managed({**value, 'groupsPassed': groups})
        for key in validator.MANAGED_V5_HASHES:
            bad = self.current()
            bad['inputHashes'][key] = '0' * 64
            with self.assertRaises(ValueError):
                validator.validate_managed(bad)
        base = Path(__file__).resolve().parents[1]
        import hashlib
        paths = ('native/IsolatedAdbServer.cs','native/RetainedAdbSession.cs','native/RetainedAdbProtocol.cs','native/RetainedHostAdmission.cs','tests/fixtures/RetainedAdbProtocolFixture.cs','../tools/phase-00/HostProbeNative.cs','scripts/retained-managed-fixture.mjs','verification/Invoke-RetainedManagedFixture.ps1','verification/WindowsBoundary.psm1','verification/OwnedFiles.psm1')
        actual = [hashlib.sha256((base/p).read_bytes()).hexdigest() for p in paths]
        self.assertEqual({key for (key, expected), found in zip(validator.MANAGED_V5_HASHES.items(), actual) if expected != found}, {'session', 'protocol', 'fixture', 'gate', 'wrapper'})
        with self.assertRaises(ValueError):
            validator.validate_managed({**self.current(), 'inputHashes': dict(zip(validator.MANAGED_V5_HASHES, actual))})

    def test_current_metadata_publisher_exclusively_requires_v5(self):
        for value in (managed_sample(), ManagedCurrentEvidence().current(), ManagedServerEvidence().current(), ManagedDiscoveryEvidence().current(), self.current()):
            with tempfile.TemporaryDirectory() as directory:
                base=Path(directory).resolve()
                (base/'.retained-managed-output.txt').write_bytes(managed_text(value))
                if value['version'] != 5:
                    with self.assertRaises(ValueError): validator.managed(base, False, False, True)
                    self.assertFalse((base/'retained-managed-validated.json').exists())
                else:
                    self.assertTrue(validator.managed(base, False, False, True))
                    self.assertEqual(validator.parse((base/'retained-managed-validated.json').read_bytes()),value)
                    with self.assertRaises(FileExistsError): validator.managed(base, False, False, True)

    def test_current_failure_remains_truthful_without_compilation_or_hash_fabrication(self):
        value={**self.current(),'inputHashes':{},'compileProcess':None,'fixtureProcess':None,'groupsPassed':0,'sourceUnchanged':False,'directoryCleanup':False,'passed':False}
        self.assertFalse(validator.managed_output(managed_text(value,['RETAINED_MANAGED_STAGE_ADMISSION']))['passed'])

class ManagedInputEvidence(unittest.TestCase):
    def current(self):
        return {**managed_sample(), 'version': 6, 'groupsPassed': 51,
                'inputHashes': dict(validator.MANAGED_V6_HASHES)}

    def test_current_fiftyone_requires_exact_hashes_and_never_relabels_historical(self):
        value = self.current()
        self.assertEqual(validator.managed_output(managed_text(value)), value)
        for version, groups, pins in ((1, 8, None), (2, 10, validator.MANAGED_V2_HASHES), (3, 19, validator.MANAGED_V3_HASHES), (4, 27, validator.MANAGED_V4_HASHES), (5, 39, validator.MANAGED_V5_HASHES)):
            old = {**managed_sample(), 'version': version, 'groupsPassed': groups}
            if pins is not None:
                old['inputHashes'] = dict(pins)
            self.assertTrue(validator.validate_managed(old)['passed'])
            with self.assertRaises(ValueError):
                validator.validate_managed({**old, 'version': 6})
        for groups in (8, 10, 19, 27, 39, 50, 52):
            with self.assertRaises(ValueError):
                validator.validate_managed({**value, 'groupsPassed': groups})
        for key in validator.MANAGED_V6_HASHES:
            bad = self.current()
            bad['inputHashes'][key] = '0' * 64
            with self.assertRaises(ValueError):
                validator.validate_managed(bad)
        base = Path(__file__).resolve().parents[1]
        import hashlib
        paths = ('native/IsolatedAdbServer.cs','native/RetainedAdbSession.cs','native/RetainedAdbProtocol.cs','native/RetainedHostAdmission.cs','tests/fixtures/RetainedAdbProtocolFixture.cs','../tools/phase-00/HostProbeNative.cs','scripts/retained-managed-fixture.mjs','verification/Invoke-RetainedManagedFixture.ps1','verification/WindowsBoundary.psm1','verification/OwnedFiles.psm1')
        actual = [hashlib.sha256((base/p).read_bytes()).hexdigest() for p in paths]
        self.assertNotEqual(actual, list(validator.MANAGED_V6_HASHES.values()))
        with self.assertRaises(ValueError):
            validator.validate_managed({**self.current(), 'inputHashes': dict(zip(validator.MANAGED_V6_HASHES, actual))})

    def test_current_input_publisher_exclusively_requires_v6(self):
        for value in (managed_sample(), ManagedCurrentEvidence().current(), ManagedServerEvidence().current(), ManagedDiscoveryEvidence().current(), ManagedMetadataEvidence().current(), self.current()):
            with tempfile.TemporaryDirectory() as directory:
                base=Path(directory).resolve()
                (base/'.retained-managed-output.txt').write_bytes(managed_text(value))
                if value['version'] != 6:
                    with self.assertRaises(ValueError): validator.managed(base, False, False, False, True)
                    self.assertFalse((base/'retained-managed-validated.json').exists())
                else:
                    self.assertTrue(validator.managed(base, False, False, False, True))
                    self.assertEqual(validator.parse((base/'retained-managed-validated.json').read_bytes()),value)
                    with self.assertRaises(FileExistsError): validator.managed(base, False, False, False, True)

    def test_current_failure_remains_truthful_without_compilation_or_hash_fabrication(self):
        value={**self.current(),'inputHashes':{},'compileProcess':None,'fixtureProcess':None,'groupsPassed':0,'sourceUnchanged':False,'directoryCleanup':False,'passed':False}
        self.assertFalse(validator.managed_output(managed_text(value,['RETAINED_MANAGED_STAGE_ADMISSION']))['passed'])

class ManagedVideoEvidence(unittest.TestCase):
    def current(self):
        return {**managed_sample(), 'version': 9, 'groupsPassed': 118,
                'inputHashes': dict(validator.MANAGED_V9_HASHES)}

    def test_current_recovery118_requires_exact_hashes_and_never_relabels_historical(self):
        value = self.current()
        self.assertEqual(validator.managed_output(managed_text(value)), value)
        for version, groups, pins in ((1, 8, None), (2, 10, validator.MANAGED_V2_HASHES), (3, 19, validator.MANAGED_V3_HASHES), (4, 27, validator.MANAGED_V4_HASHES), (5, 39, validator.MANAGED_V5_HASHES), (6, 51, validator.MANAGED_V6_HASHES), (7, 74, validator.MANAGED_V7_HASHES), (8, 92, validator.MANAGED_V8_HASHES)):
            old = {**managed_sample(), 'version': version, 'groupsPassed': groups}
            if pins is not None:
                old['inputHashes'] = dict(pins)
            self.assertTrue(validator.validate_managed(old)['passed'])
            with self.assertRaises(ValueError):
                validator.validate_managed({**old, 'version': 9})
        for groups in (8, 10, 19, 27, 39, 51, 65, 73, 74, 75, 91, 92, 93, 117, 119):
            with self.assertRaises(ValueError):
                validator.validate_managed({**value, 'groupsPassed': groups})
        for key in validator.MANAGED_V9_HASHES:
            bad = self.current()
            bad['inputHashes'][key] = '0' * 64
            with self.assertRaises(ValueError):
                validator.validate_managed(bad)
        base = Path(__file__).resolve().parents[1]
        import hashlib
        paths = ('native/IsolatedAdbServer.cs','native/RetainedAdbSession.cs','native/RetainedAdbProtocol.cs','native/RetainedHostAdmission.cs','native/RetainedVideoSession.cs','tests/fixtures/RetainedAdbProtocolFixture.cs','../tools/phase-00/HostProbeNative.cs','scripts/retained-managed-fixture.mjs','verification/Invoke-RetainedManagedFixture.ps1','verification/WindowsBoundary.psm1','verification/OwnedFiles.psm1')
        actual = [hashlib.sha256((base/p).read_bytes()).hexdigest() for p in paths]
        self.assertEqual(actual, list(validator.MANAGED_V9_HASHES.values()))

    def test_current_input_publisher_exclusively_requires_v9(self):
        for value in (managed_sample(), ManagedCurrentEvidence().current(), ManagedServerEvidence().current(), ManagedDiscoveryEvidence().current(), ManagedMetadataEvidence().current(), ManagedInputEvidence().current(), {**managed_sample(), 'version': 7, 'groupsPassed': 74, 'inputHashes': dict(validator.MANAGED_V7_HASHES)}, {**managed_sample(), 'version': 8, 'groupsPassed': 92, 'inputHashes': dict(validator.MANAGED_V8_HASHES)}, self.current()):
            with tempfile.TemporaryDirectory() as directory:
                base=Path(directory).resolve()
                (base/'.retained-managed-output.txt').write_bytes(managed_text(value))
                if value['version'] != 9:
                    with self.assertRaises(ValueError): validator.managed(base, False, False, False, False, True)
                    self.assertFalse((base/'retained-managed-validated.json').exists())
                else:
                    self.assertTrue(validator.managed(base, False, False, False, False, True))
                    self.assertEqual(validator.parse((base/'retained-managed-validated.json').read_bytes()),value)
                    with self.assertRaises(FileExistsError): validator.managed(base, False, False, False, False, True)

    def test_current_failure_remains_truthful_without_compilation_or_hash_fabrication(self):
        value={**self.current(),'inputHashes':{},'compileProcess':None,'fixtureProcess':None,'groupsPassed':0,'sourceUnchanged':False,'directoryCleanup':False,'passed':False}
        self.assertFalse(validator.managed_output(managed_text(value,['RETAINED_MANAGED_STAGE_ADMISSION']))['passed'])

if __name__ == '__main__':
    unittest.main()
