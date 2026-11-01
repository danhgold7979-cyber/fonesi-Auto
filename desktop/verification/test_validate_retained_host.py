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

if __name__ == '__main__':
    unittest.main()
