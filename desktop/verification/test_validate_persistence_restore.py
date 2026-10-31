import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import uuid
from validate_runtime import InvalidEvidence, VERSIONS
from validate_persistence_restore import CASES, SCOPE, validate_raw, validate_public


def raw(v):
    return json.dumps(v, separators=(',', ':')).encode()


def fixture():
    result = {'version': 1, 'scope': SCOPE, 'mode': 'source', 'versions': dict(VERSIONS),
              'cases': dict.fromkeys(CASES, True)}
    process = {'status': 'SUCCESS', 'exitCode': 0, 'cleanupComplete': True,
               'stdoutTruncated': False, 'stderrTruncated': False}
    return result, {'process': process, 'stdout': 'PERSISTENCE_RESTORE_ORDERLY\n', 'stderr': ''}


class RestoreEvidenceTests(unittest.TestCase):
    def test_exact_fixed_output_both_modes_and_private_output_drop(self):
        for mode in ('source', 'package'):
            result, capture = fixture()
            result['mode'] = mode
            capture['stderr'] = 'PRIVATE_PATH STORE_UUID KEY_CIPHERTEXT'
            public = validate_raw(raw(result), raw(capture), mode)
            self.assertTrue(validate_public(public, mode))
            self.assertNotIn('PRIVATE', json.dumps(public))
            self.assertNotIn('stderr', public)

    def test_each_false_case_and_process_failure_prevents_pass(self):
        for key in CASES:
            result, capture = fixture()
            result['cases'][key] = False
            public = validate_raw(raw(result), raw(capture), 'source')
            self.assertFalse(public['passed'])
            self.assertFalse(validate_public(public, 'source'))
        for key in ('cleanupComplete', 'stdoutTruncated', 'stderrTruncated'):
            result, capture = fixture()
            capture['process'][key] = key != 'cleanupComplete'
            self.assertFalse(validate_raw(raw(result), raw(capture), 'source')['passed'])
        for marker in ('PERSISTENCE_RESTORE_FAILED', 'PERSISTENCE_RESTORE_DEADLINE'):
            result, capture = fixture()
            capture['stderr'] = marker
            public = validate_raw(raw(result), raw(capture), 'source')
            self.assertFalse(public['passed'])
            self.assertFalse(validate_public(public, 'source'))

    def test_duplicates_unknown_versions_coercion_and_nonfinite_reject(self):
        result, capture = fixture()
        r = raw(result)
        for candidate in (r.replace(b'"version":1', b'"version":1,"version":1'),
                          r.replace(b'"restored_lease":true', b'"restored_lease":false,"restored_lease":true'),
                          raw(dict(result, secret='PRIVATE')), raw(dict(result, version=True)),
                          raw(dict(result, cases=[])), r.replace(b'"version":1', b'"version":NaN'),
                          raw(dict(result, versions=dict(VERSIONS, node='24.22.2')))):
            with self.assertRaises(InvalidEvidence):
                validate_raw(candidate, raw(capture), 'source')
        duplicate = raw(capture).replace(b'"cleanupComplete":true', b'"cleanupComplete":false,"cleanupComplete":true')
        with self.assertRaises(InvalidEvidence):
            validate_raw(r, duplicate, 'source')

    def test_exact_marker_framing_and_bounds(self):
        result, capture = fixture()
        capture['stdout'] = '\nPERSISTENCE_RESTORE_ORDERLY\r\n'
        self.assertTrue(validate_raw(raw(result), raw(capture), 'source')['passed'])
        for marker in ('\n\nPERSISTENCE_RESTORE_ORDERLY\n', ' PERSISTENCE_RESTORE_ORDERLY\n',
                       'PERSISTENCE_RESTORE_ORDERLY\n\n', 'PERSISTENCE_RESTORE_ORDERLY\r', 'PRIVATE'):
            capture['stdout'] = marker
            with self.assertRaises(InvalidEvidence):
                validate_raw(raw(result), raw(capture), 'source')
        result, capture = fixture()
        for candidate in (b'', b'x' * 65537, b'\xff', b'[' * 2000):
            with self.assertRaises(InvalidEvidence):
                validate_raw(candidate, raw(capture), 'source')
        capture['stderr'] = '\ud800'
        with self.assertRaises(InvalidEvidence):
            validate_raw(raw(result), raw(capture), 'source')

    def test_public_claims_cannot_override_derived_failure(self):
        result, capture = fixture()
        good = validate_raw(raw(result), raw(capture), 'source')
        for key in ('passed', 'orderlyQuitObserved'):
            bad = copy.deepcopy(good)
            bad[key] = not bad[key]
            with self.assertRaises(InvalidEvidence):
                validate_public(bad, 'source')
        bad = copy.deepcopy(good)
        bad['failureMarkerAbsent'] = False
        with self.assertRaises(InvalidEvidence):
            validate_public(bad, 'source')
        bad['passed'] = False
        self.assertFalse(validate_public(bad, 'source'))

    def test_exclusive_cli_output_no_stale_success(self):
        with tempfile.TemporaryDirectory(prefix='restore-evidence-') as directory:
            root = Path(directory).resolve()
            (root / '.owner').write_text(str(uuid.uuid4()), encoding='ascii')
            result, capture = fixture()
            (root / 'persistence-restore-result-source.json').write_bytes(raw(result))
            (root / 'persistence-restore-capture-source.json').write_bytes(raw(capture))
            command = [sys.executable, str(Path(__file__).with_name('validate_persistence_restore.py')), str(root), 'source']
            first = subprocess.run(command, capture_output=True, text=True, timeout=10)
            self.assertEqual((first.returncode, first.stdout), (0, 'PERSISTENCE_RESTORE_VALIDATION_PASS\n'))
            saved = (root / 'persistence-restore-public-source.json').read_bytes()
            second = subprocess.run(command, capture_output=True, text=True, timeout=10)
            self.assertEqual((second.returncode, second.stdout), (2, 'PERSISTENCE_RESTORE_VALIDATION_INVALID\n'))
            self.assertEqual((root / 'persistence-restore-public-source.json').read_bytes(), saved)
            self.assertEqual(second.stderr, '')


if __name__ == '__main__':
    unittest.main()
