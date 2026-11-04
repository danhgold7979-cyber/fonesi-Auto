import json
import tempfile
import unittest
from pathlib import Path

from validate_runtime import (CASES, OBSERVATIONS, VERSIONS, MAX_BYTES,
                              InvalidEvidence, read_bounded, validate)


def fixture():
    return {'schemaVersion': 1, 'oldNavigationGate': 'FAIL_RETAINED', 'runs': {
        mode: {'mode': mode, 'versions': dict(VERSIONS),
               'cases': dict.fromkeys(CASES, True),
               'observations': dict.fromkeys(OBSERVATIONS, False),
               'logging': {'recordCount': 4, 'crashArtifactCount': 0},
               'process': {'status': 'SUCCESS', 'exitCode': 0,
                           'cleanupComplete': True, 'stdoutTruncated': False,
                           'stderrTruncated': False}}
        for mode in ('source', 'package')}}


def encoded(value):
    return json.dumps(value).encode('utf-8')


class RuntimeEvidenceTests(unittest.TestCase):
    def reject(self, value):
        with self.assertRaisesRegex(InvalidEvidence, '^INVALID_RUNTIME_EVIDENCE$'):
            validate(encoded(value))

    def test_exact_success_is_derived(self):
        self.assertTrue(validate(encoded(fixture()))['passed'])

    def test_false_case_is_valid_failure(self):
        value = fixture()
        value['runs']['source']['cases']['orderly_quit'] = False
        self.assertFalse(validate(encoded(value))['passed'])

    def test_cleanup_cannot_substitute_for_orderly_quit(self):
        value = fixture()
        value['runs']['package']['process']['cleanupComplete'] = False
        self.assertFalse(validate(encoded(value))['passed'])

    def test_duplicate_keys_at_all_levels(self):
        for raw in (b'{"schemaVersion":1,"schemaVersion":1}',
                    encoded(fixture()).replace(b'"mode": "source"',
                                              b'"mode":"source","mode":"source"')):
            with self.assertRaises(InvalidEvidence):
                validate(raw)

    def test_valid_document_duplicates_cannot_mask_false_evidence(self):
        raw = encoded(fixture())
        mutations = (
            raw.replace(b'"schemaVersion": 1', b'"schemaVersion":1,"schemaVersion":1'),
            raw.replace(b'"orderly_quit": true', b'"orderly_quit":false,"orderly_quit":true'),
            raw.replace(b'"cleanupComplete": true', b'"cleanupComplete":false,"cleanupComplete":true'),
        )
        for altered in mutations:
            self.assertTrue(json.loads(altered))  # Ordinary normalization hides duplicates.
            with self.assertRaises(InvalidEvidence):
                validate(altered)

    def test_wrong_mode_or_version(self):
        for key, replacement in (('mode', 'package'), ('versions', {})):
            value = fixture()
            value['runs']['source'][key] = replacement
            self.reject(value)

    def test_case_arrays_missing_extra_and_renamed(self):
        for replacement in ([True] * 20, {}, dict.fromkeys(range(20), True),
                            {**dict.fromkeys(CASES, True), 'extra': True}):
            value = fixture()
            value['runs']['source']['cases'] = replacement
            self.reject(value)
        value = fixture()
        cases = value['runs']['source']['cases']
        cases['renamed'] = cases.pop('orderly_quit')
        self.reject(value)

    def test_bool_is_not_integer_and_integer_is_not_bool(self):
        value = fixture()
        value['schemaVersion'] = True
        self.reject(value)
        for replacement in (1, 0, 'true', None):
            value = fixture()
            value['runs']['source']['cases']['orderly_quit'] = replacement
            self.reject(value)
        value = fixture()
        value['runs']['source']['process']['exitCode'] = False
        self.reject(value)

    def test_status_exit_consistency(self):
        for status, code in (('SUCCESS', 1), ('NONZERO_EXIT', 0),
                             ('NONZERO_EXIT', None), ('UNKNOWN', 0),
                             ('TIMEOUT', 0), ('LAUNCH_FAILED', 1),
                             ('ACCESS_DENIED', 1), ('NONZERO_EXIT', 2147483648),
                             ('EMPTY_OUTPUT', 1), ('CLEANUP_FAILED', 0)):
            value = fixture()
            value['runs']['source']['process'].update(status=status, exitCode=code)
            self.reject(value)

    def test_timeout_nonzero_truncation_never_pass(self):
        for changes in ({'status': 'TIMEOUT', 'exitCode': None},
                        {'status': 'NONZERO_EXIT', 'exitCode': 1},
                        {'stdoutTruncated': True}, {'stderrTruncated': True}):
            value = fixture()
            value['runs']['source']['process'].update(changes)
            self.assertFalse(validate(encoded(value))['passed'])

    def test_no_extra_private_fields(self):
        for target in ('root', 'run', 'process', 'observations'):
            value = fixture()
            obj = value if target == 'root' else value['runs']['source']
            if target in ('process', 'observations'):
                obj = obj[target]
            obj['rawOutput'] = 'private text must not be echoed'
            self.reject(value)

    def test_original_navigation_failure_cannot_be_changed(self):
        value = fixture()
        value['oldNavigationGate'] = 'PASS'
        self.reject(value)

    def test_bytes_limits_malformed_and_nonfinite(self):
        for raw in (b'', b' ' * (MAX_BYTES + 1), b'\xff', b'{} trailing',
                    b'{"a":NaN}', b'[' * 1500 + b']' * 1500, 'not bytes'):
            with self.assertRaises(InvalidEvidence):
                validate(raw)

    def test_all_false_cases_remain_valid_failed_evidence(self):
        value = fixture()
        for run in value['runs'].values():
            run['cases'] = dict.fromkeys(CASES, False)
        self.assertFalse(validate(encoded(value))['passed'])

    def test_malformed_nested_fields_never_escape_fixed_failure(self):
        for field in ('status', 'exitCode', 'cleanupComplete'):
            for replacement in ({}, [], 'private text', 1.5, float('inf')):
                value = fixture()
                value['runs']['source']['process'][field] = replacement
                self.reject(value)
        for raw in (None, {}, [], 123, True):
            with self.assertRaisesRegex(InvalidEvidence, '^INVALID_RUNTIME_EVIDENCE$'):
                validate(raw)

    def test_public_bridge_case_set_matches_probe_and_rejects_old_contract(self):
        import re
        source = (Path(__file__).parent / 'runtime-probe.cjs').read_text()
        block = source.split('const CASE_NAMES = [', 1)[1].split('];', 1)[0]
        names = re.findall(r"'([a-z_]+)'", block)
        self.assertEqual(len(names), 29)
        self.assertEqual(set(names), CASES)
        self.assertEqual(len(names), len(set(names)))
        old = fixture()
        old['runs']['source']['cases']['no_preload'] = old['runs']['source']['cases'].pop('approved_preload')
        self.reject(old)
        for case in CASES:
            value = fixture()
            value['runs']['source']['cases'][case] = False
            self.assertFalse(validate(encoded(value))['passed'])

    def test_logging_counts_are_fixed_bounded_and_not_identifiers(self):
        for key, values in (('recordCount', [-1, 0, True, 32769, 'private']),
                            ('crashArtifactCount', [-1, False, 257, {}])):
            for invalid in values:
                value = fixture()
                value['runs']['source']['logging'][key] = invalid
                self.reject(value)
        value = fixture()
        value['runs']['source']['logging']['diagnosticId'] = 'private'
        self.reject(value)

    def test_bounded_file_read(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'synthetic.json'
            path.write_bytes(b' ' * (MAX_BYTES + 100))
            self.assertEqual(len(read_bounded(path)), MAX_BYTES + 1)


if __name__ == '__main__':
    unittest.main()
