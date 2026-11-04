import contextlib
import io
import json
from pathlib import Path
import re
import tempfile
import unittest
from unittest import mock
import validate_package_runtime_version as validator


def sample():
    return {'version': 1, 'scope': validator.SCOPE, 'historicalManagedEvidence': validator.HISTORY,
            'excludedVaultContext': 'P106_UNMET_NOT_RERUN',
            'bootstrap': {'version': 1, 'cases': dict.fromkeys(validator.BOOTSTRAP, True)},
            'observation': {'version': 1, 'scope': validator.SCOPE,
                            'cases': dict.fromkeys(validator.CASES, True),
                            'readyCount': 1, 'closedCount': 1},
            'process': {'status': 'SUCCESS', 'exitCode': 0, 'cleanupComplete': True,
                        'stdoutTruncated': False, 'stderrTruncated': False},
            'originalArchiveUnchanged': True, 'originalSourceUnchanged': True, 'originalPackageUnchanged': True,
            'package': {'sourceHead':'a'*40,'sourceTree':'b'*40,'zipSha256':'c'*64,'zipBytes':123,'manifestSha256':'d'*64},
            'directoryCleanup': True, 'failure': None}


def fixture(directory, stdout='PERSISTENCE_DESKTOP_CLOSED\n'):
    base = Path(directory).resolve() / '.retained-host-runtime'
    base.mkdir()
    root = base / 'r'
    root.mkdir()
    (root / '.owner').write_text('12345678-1234-4234-8234-123456789abc')
    value = sample()
    rows = {'bootstrap.json': value['bootstrap'], 'main-runtime-version-result.json': value['observation'],
            'launcher-capture.json': {'process': value['process'], 'stdout': stdout, 'stderr': ''},
            'integrity.json': {'version': 1, 'originalArchiveUnchanged': True,
                               'originalSourceUnchanged': True, 'originalPackageUnchanged': True, 'package':value['package']}}
    observed = {**value['observation'], 'cases': {**value['observation']['cases'], 'schema7Intents': False, 'schema7Result': False}}
    rows.update({'main-runtime-version-observed.json': observed,
                 'main-runtime-version-binding.json': {'version': 1, 'operationId': '12345678-1234-4234-8234-123456789abc', 'installationRevision': 1, 'expectedRevision': 0, 'pendingRevision': 1, 'verifiedRevision': 2, 'reads': 2, 'requestId': 'p2'},
                 'historical-managed.json': {'version': 1, 'reportSha256': '41e93f3cef944512e6d48d2ebebe526f7c56615c7d66a3aab1e542d177b82a0d', 'sourceHashes': validator.HISTORICAL_HASHES}})
    rows['package-binding.json']={'version':1,**value['package'],'candidateDirectory':str(Path(directory).resolve()/'.package-build'/'Fonesi-Auto-12345678-1234-4234-8234-123456789abc'/'package'),'candidateZip':str(Path(directory).resolve()/'.package-build'/'Fonesi-Auto-12345678-1234-4234-8234-123456789abc'/'Fonesi-Auto.zip'),'manifestBytes':12,'files':[{'path':'app/build/main.cjs','bytes':1,'sha256':'e'*64}],'directories':['app','app/build']}
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
        self.assertEqual(output.getvalue(), 'PACKAGE_RUNTIME_VERSION_VALIDATION_INVALID\n')

    def test_static_contract_and_bootstrap_parity(self):
        base = Path(__file__).resolve().parent
        contract = (base / 'main-runtime-version-contract.cjs').read_text()
        control = (base / 'retained-host-control.cjs').read_text()
        for source, name, expected in ((contract, 'CASES', validator.CASES),
                                       (control, 'BOOTSTRAP', validator.BOOTSTRAP)):
            body = re.search(r'const '+name+r' = Object.freeze\(\[(.*?)\]\);', source, re.S)
            self.assertIsNotNone(body)
            self.assertEqual(tuple(re.findall(r"'([^']+)'", body.group(1))), expected)
        self.assertIn("PACKAGE_SCOPE = '"+validator.SCOPE+"'", contract)



    def test_historical_reuse_and_private_observation_cannot_be_forged(self):
        for name, mutate in (
            ('historical-managed.json', lambda v: v.update(reportSha256='0'*64)),
            ('historical-managed.json', lambda v: v.update(version=True)),
            ('historical-managed.json', lambda v: v['sourceHashes'].update({'extra': 'a'*64})),
            ('main-runtime-version-observed.json', lambda v: v['cases'].update(schema7Intents=True)),
            ('main-runtime-version-binding.json', lambda v: v.update(verifiedRevision=1)),
            ('main-runtime-version-binding.json', lambda v: v.update(reads=42)),
        ):
            with tempfile.TemporaryDirectory() as directory:
                _, root = fixture(directory)
                file = root/name
                v = json.loads(file.read_text())
                mutate(v)
                file.write_text(json.dumps(v))
                with self.assertRaises(ValueError):
                    validator.stage(root)
                self.assertFalse((root/'public.json').exists())
        v = sample()
        v['version'] = 2
        with self.assertRaises(ValueError):
            validator.validate(v)
        v = sample()
        v['historicalManagedEvidence'] = 'FRESH'
        with self.assertRaises(ValueError):
            validator.validate(v)

    def test_private_package_binding_mismatch_or_unsafe_inventory_refuses_stage(self):
        for mutate in (lambda v:v.update(zipSha256='f'*64),lambda v:v.update(version=True),lambda v:v.update(extra='private'),lambda v:v['files'][0].update(path='../escape'),lambda v:v['files'].append(dict(v['files'][0])),lambda v:v.update(directories=['app/build','app']),lambda v:v.update(candidateZip='C:/private/wrong.zip')):
            with tempfile.TemporaryDirectory() as directory:
                _,root=fixture(directory);file=root/'package-binding.json';v=json.loads(file.read_text());mutate(v);file.write_text(json.dumps(v))
                with self.assertRaises(ValueError):validator.stage(root)
                self.assertFalse((root/'public.json').exists())

    def test_package_identity_is_exact_and_never_an_arbitrary_path(self):
        for mutate in (lambda v:v.update(package=None),lambda v:v['package'].update(zipBytes=True),lambda v:v['package'].update(zipBytes=640*1024*1024+1),lambda v:v['package'].update(path='private'),lambda v:v['package'].update(sourceHead='g'*40),lambda v:v['package'].update(zipSha256='A'*64)):
            value=sample();mutate(value)
            with self.assertRaises(ValueError): validator.validate(value)
        value=sample();value.update(failure='PACKAGE_FAILED',package=None)
        self.assertFalse(validator.validate(value)['passed'])

if __name__ == '__main__':
    unittest.main()
