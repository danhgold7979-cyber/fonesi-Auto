import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import uuid
from validate_runtime import InvalidEvidence
from validate_persistence_store import case_names, validate_stage, validate_public, stage_files


def data(stage='crash', boundary='BEFORE_COMMIT', mode='source'):
    result = {'version': 1, 'mode': mode, 'stage': stage, 'boundary': boundary,
              'cases': {name: True for name in case_names(stage)}}
    process = {'status': 'NONZERO_EXIT' if stage == 'crash' else 'SUCCESS',
               'exitCode': -1073741819 if stage == 'crash' else 0,
               'cleanupComplete': True, 'stdoutTruncated': False, 'stderrTruncated': False}
    stdout = f'PERSISTENCE_STORE_{boundary}_ARMED\n' if stage == 'crash' else 'PERSISTENCE_STORE_REOPEN_CLOSED\n'
    return result, process, stdout


def raw(value):
    return json.dumps(value, separators=(',', ':')).encode()


def validate(result, process, stdout, stderr=''):
    return validate_stage(raw(result), process, stdout, stderr, result['mode'], result['boundary'], result['stage'])


class StoreEvidenceTests(unittest.TestCase):
    def test_all_stage_boundary_mode_pairs_and_non_guessed_crash_exits(self):
        for mode in ('source', 'package'):
            for boundary in ('BEFORE_COMMIT', 'AFTER_COMMIT'):
                for stage in ('crash', 'reopen'):
                    r, p, out = data(stage, boundary, mode)
                    v = validate(r, p, out)
                    self.assertTrue(v['passed'])
                    self.assertTrue(validate_public(v, mode, boundary, stage))
        for code in (1, -1, 2147483647, -2147483648):
            r, p, out = data()
            p['exitCode'] = code
            self.assertTrue(validate(r, p, out)['passed'])

    def test_false_cases_and_failure_markers_remain_false(self):
        for stage in ('crash', 'reopen'):
            for name in case_names(stage):
                r, p, out = data(stage)
                r['cases'][name] = False
                v = validate(r, p, out)
                self.assertFalse(v['passed'])
                self.assertFalse(validate_public(v, 'source', 'BEFORE_COMMIT', stage))
        r, p, out = data()
        for marker in ('PERSISTENCE_STORE_FAILED', 'PERSISTENCE_STORE_DEADLINE'):
            self.assertFalse(validate(r, p, out, marker)['passed'])

    def test_private_streams_are_dropped(self):
        r, p, out = data()
        v = validate(r, p, out, 'PRIVATE_PATH SECRET_UUID COOKIE')
        self.assertNotIn('PRIVATE', json.dumps(v))
        self.assertNotIn('stdout', v)
        self.assertNotIn('stderr', v)

    def test_process_outcome_retirement_capture_invariants(self):
        r, p, out = data()
        for key in ('cleanupComplete', 'stdoutTruncated', 'stderrTruncated'):
            q = dict(p)
            q[key] = key != 'cleanupComplete'
            self.assertFalse(validate(r, q, out)['passed'])
        q = dict(p, status='SUCCESS', exitCode=0)
        self.assertFalse(validate(r, q, out)['passed'])
        for code in (None, 0, True, 2147483648):
            with self.assertRaises(InvalidEvidence):
                validate(r, dict(p, exitCode=code), out)
        r, p, out = data('reopen')
        self.assertFalse(validate(r, dict(p, status='NONZERO_EXIT', exitCode=1), out)['passed'])

    def test_exact_stdout_framing(self):
        r, p, out = data()
        self.assertTrue(validate(r, p, '\n' + out)['passed'])
        self.assertTrue(validate(r, p, out.replace('\n', '\r\n'))['passed'])
        for bad in ('\n\n' + out, ' \n' + out, out + '\n', out + 'PRIVATE', out.replace('BEFORE', 'AFTER'), out.replace('\n', '\r'), '\ufeff' + out):
            with self.assertRaises(InvalidEvidence):
                validate(r, p, bad)

    def test_duplicate_unknown_nonfinite_and_bool_integer_rejected(self):
        r, p, out = data()
        text = raw(r)
        for bad in (text.replace(b'"version":1', b'"version":1,"version":1'),
                    text.replace(b'"leaseVerified":true', b'"leaseVerified":false,"leaseVerified":true'),
                    raw(dict(r, private='SECRET')), raw(dict(r, version=True)),
                    raw(dict(r, cases=[])), text.replace(b'"version":1', b'"version":NaN')):
            with self.assertRaises(InvalidEvidence):
                validate_stage(bad, p, out, '', 'source', 'BEFORE_COMMIT', 'crash')

    def test_bounds_mismatched_identity_and_malformed_capture(self):
        r, p, out = data()
        for value in (b'', b'x' * 65537, b'\xff', b'[' * 2000):
            with self.assertRaises(InvalidEvidence):
                validate_stage(value, p, out, '', 'source', 'BEFORE_COMMIT', 'crash')
        for key, value in (('mode', 'package'), ('boundary', 'AFTER_COMMIT'), ('stage', 'reopen')):
            changed = dict(r)
            changed[key] = value
            with self.assertRaises(InvalidEvidence):
                validate_stage(raw(changed), p, out, '', 'source', 'BEFORE_COMMIT', 'crash')
        for bad in ({}, [], None):
            with self.assertRaises(InvalidEvidence):
                validate_stage(raw(r), bad, out, '', 'source', 'BEFORE_COMMIT', 'crash')
        for text in ('x' * 32769, '\ud800'):
            with self.assertRaises(InvalidEvidence):
                validate(r, p, out, text)

    def test_public_false_claims_and_invalid_process_never_short_circuit(self):
        r, p, out = data()
        good = validate(r, p, out)
        for field in ('crashArmedObserved', 'orderlyQuitObserved', 'passed'):
            v = copy.deepcopy(good)
            v[field] = not v[field]
            with self.assertRaises(InvalidEvidence):
                validate_public(v, 'source', 'BEFORE_COMMIT', 'crash')
        v = copy.deepcopy(good)
        v['cases']['leaseVerified'] = False
        v['passed'] = False
        v['process'] = {}
        with self.assertRaises(InvalidEvidence):
            validate_public(v, 'source', 'BEFORE_COMMIT', 'crash')

    def test_exclusive_stage_files_and_cli_fixed_output(self):
        with tempfile.TemporaryDirectory(prefix='persistence-store-test-') as folder:
            root = Path(folder).resolve()
            (root / '.owner').write_text(str(uuid.uuid4()), encoding='ascii')
            r, p, out = data()
            suffix = 'source-before_commit-crash'
            (root / f'persistence-store-{suffix}.json').write_bytes(raw(r))
            (root / f'persistence-store-capture-{suffix}.json').write_bytes(raw({'process': p, 'stdout': out, 'stderr': 'PRIVATE'}))
            script = Path(__file__).with_name('validate_persistence_store.py')
            command = [sys.executable, str(script), str(root), 'source', 'BEFORE_COMMIT', 'crash']
            first = subprocess.run(command, capture_output=True, text=True, timeout=10)
            self.assertEqual(first.returncode, 0)
            self.assertEqual(first.stdout, 'PERSISTENCE_STORE_VALIDATION_PASS\n')
            saved = (root / f'persistence-store-public-{suffix}.json').read_bytes()
            self.assertNotIn(b'PRIVATE', saved)
            second = subprocess.run(command, capture_output=True, text=True, timeout=10)
            self.assertEqual(second.returncode, 2)
            self.assertEqual(second.stdout, 'PERSISTENCE_STORE_VALIDATION_INVALID\n')
            self.assertEqual((root / f'persistence-store-public-{suffix}.json').read_bytes(), saved)
            self.assertEqual(second.stderr, '')


if __name__ == '__main__':
    unittest.main()
