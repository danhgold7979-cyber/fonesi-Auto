import json
import unittest
from validate_persistence_maintenance import CASES, validate_raw
from validate_runtime import VERSIONS, InvalidEvidence


def inputs():
    result = {'version': 1, 'scope': 'NATIVE_ADAPTER_MAINTENANCE', 'mode': 'source', 'versions': dict(VERSIONS),
              'cases': dict.fromkeys(CASES, True), 'ordinaryCount': 7, 'protectedCount': 1, 'releasedSafetyCount': 1}
    capture = {'process': {'status': 'SUCCESS', 'exitCode': 0, 'cleanupComplete': True, 'stdoutTruncated': False, 'stderrTruncated': False},
               'stdout': 'PERSISTENCE_MAINTENANCE_ORDERLY\n', 'stderr': ''}
    return result, capture


def check(result, capture):
    return validate_raw(json.dumps(result).encode(), json.dumps(capture).encode(), 'source')


class MaintenanceTests(unittest.TestCase):
    def test_pass_and_all_false_cases_remain_failure(self):
        result, capture = inputs()
        self.assertTrue(check(result, capture)['passed'])
        for case in CASES:
            result, capture = inputs()
            result['cases'][case] = False
            self.assertFalse(check(result, capture)['passed'])

    def test_retirement_exit_and_fixed_failure_markers(self):
        for key in ('cleanupComplete', 'stdoutTruncated', 'stderrTruncated'):
            result, capture = inputs()
            capture['process'][key] = key != 'cleanupComplete'
            self.assertFalse(check(result, capture)['passed'])
        result, capture = inputs()
        capture['process'].update(status='NONZERO_EXIT', exitCode=1)
        self.assertFalse(check(result, capture)['passed'])
        result, capture = inputs()
        capture['stderr'] = 'PERSISTENCE_MAINTENANCE_FAILED\n'
        self.assertFalse(check(result, capture)['passed'])

    def test_duplicates_private_extra_and_types_rejected(self):
        result, capture = inputs()
        raw = json.dumps(result).encode()
        with self.assertRaises(InvalidEvidence):
            validate_raw(raw.replace(b'"retained_lease": true', b'"retained_lease": false,"retained_lease":true'), json.dumps(capture).encode(), 'source')
        result['privatePath'] = 'private-canary'
        with self.assertRaises(InvalidEvidence):
            check(result, capture)
        for field in ('version', 'ordinaryCount', 'protectedCount', 'releasedSafetyCount'):
            result, capture = inputs()
            result[field] = True
            with self.assertRaises(InvalidEvidence):
                check(result, capture)

    def test_retention_scope_and_framing(self):
        result, capture = inputs()
        result['ordinaryCount'] = 6
        self.assertFalse(check(result, capture)['passed'])
        result['ordinaryCount'] = 8
        with self.assertRaises(InvalidEvidence):
            check(result, capture)
        for prefix in (' ', '\n\n', 'unknown\n'):
            result, capture = inputs()
            capture['stdout'] = prefix + capture['stdout']
            with self.assertRaises(InvalidEvidence):
                check(result, capture)
        result, capture = inputs()
        capture['stdout'] = '\n' + capture['stdout']
        self.assertTrue(check(result, capture)['passed'])

    def test_owned_stage_exclusive_output_no_private_capture_echo(self):
        import tempfile
        from pathlib import Path
        from validate_persistence_maintenance import stage
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / '.owner').write_text('12345678-1234-1234-1234-123456789abc')
            result, capture = inputs()
            capture['stderr'] = 'private-canary-never-published'
            (root / 'persistence-maintenance-result-source.json').write_text(json.dumps(result))
            (root / 'persistence-maintenance-capture-source.json').write_text(json.dumps(capture))
            self.assertTrue(stage(root, 'source'))
            self.assertNotIn('private-canary', (root / 'persistence-maintenance-public-source.json').read_text())
            with self.assertRaises(FileExistsError):
                stage(root, 'source')

    def test_public_aggregation_rechecks_fixed_schema_and_all_claims(self):
        from validate_persistence_maintenance import validate_public
        result, capture = inputs()
        public = check(result, capture)
        self.assertTrue(validate_public(public, 'source'))
        with self.assertRaises(InvalidEvidence):
            validate_public(public, 'package')
        public['cases']['service_closed'] = False
        with self.assertRaises(InvalidEvidence):
            validate_public(public, 'source')
        public['passed'] = False
        self.assertFalse(validate_public(public, 'source'))


class MaintenanceDiagnosticTests(unittest.TestCase):
    def test_fixed_stage_diagnostic_never_echoes_private_values(self):
        import validate_persistence_maintenance as module
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / '.owner').write_text('12345678-1234-1234-1234-123456789abc')
            with self.assertRaises(FileNotFoundError):
                module.stage(root, 'source')
            self.assertEqual(module.diagnostic_marker(), 'PERSISTENCE_MAINTENANCE_VALIDATION_STAGE_RESULT_READ')
        module._diagnostic_stage = 'PRIVATE_CANARY'
        self.assertEqual(module.diagnostic_marker(), 'PERSISTENCE_MAINTENANCE_VALIDATION_STAGE_UNKNOWN')
