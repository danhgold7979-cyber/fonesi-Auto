import json
import unittest
import tempfile
from pathlib import Path
from validate_runtime import CASES, OBSERVATIONS, VERSIONS, InvalidEvidence
from validate_hosted import validate, write_validated, diagnostic_lines


def process(code=0):
    return {'status': 'SUCCESS' if code == 0 else 'NONZERO_EXIT', 'exitCode': code,
            'cleanupComplete': True, 'stdoutTruncated': False, 'stderrTruncated': False}


def runtime(mode):
    result = {'mode': mode, 'versions': dict(VERSIONS), 'cases': dict.fromkeys(CASES, True),
              'observations': dict.fromkeys(OBSERVATIONS, False)}
    return {'process': process(), 'ownedBytes': 2048,
            'payload': 'BOOTSTRAP_READY\nBOOTSTRAP_CLOSED\nFOUNDATION_RESULT ' + json.dumps(result) + '\n'}


def fixture():
    return {'schemaVersion': 1, 'scope': 'HOSTED_RUNNER_ONLY',
            'installer': {'process': process(), 'officialMarker': True},
            'runs': {mode: runtime(mode) for mode in ('source', 'package')},
            'negatives': {
                'crash': {'process': process(1), 'armed': True, 'observed': True,
                          'bootstrapFailed': True, 'unexpectedQuit': False, 'ownedBytes': 2048},
                'tamper': {'process': process(1), 'changed': True, 'bootstrapFailed': True,
                           'unexpectedReady': False, 'ownedBytes': 2048}},
            'buildVerified': True, 'binaryHashMatched': True, 'runtimeCopyVerified': True,
            'directoryCleanup': True, 'packageBytes': 4096, 'failure': None}


def encoded(value):
    return json.dumps(value).encode()


class HostedEvidenceTests(unittest.TestCase):
    def rejected(self, value):
        with self.assertRaisesRegex(InvalidEvidence, '^INVALID_RUNTIME_EVIDENCE$'):
            validate(encoded(value))

    def test_diagnostic_stage_locates_rejected_stdout_without_echo(self):
        value = fixture()
        value['runs']['source']['payload'] = 'private host path'
        diagnostic = {}
        with self.assertRaises(InvalidEvidence):
            validate(encoded(value), diagnostic)
        self.assertEqual(diagnostic_lines(diagnostic), ['FOUNDATION_VALIDATION_STAGE_RUN_SOURCE_LINES',
                         'FOUNDATION_STDOUT_SOURCE_COUNT_1_OTHER_1_ORDER_OTHER'])

    def test_stdout_diagnostic_reports_only_fixed_classes_not_content(self):
        value = fixture()
        value['runs']['source']['payload'] += 'private path and identifiers\n'
        diagnostic = {}
        with self.assertRaises(InvalidEvidence):
            validate(encoded(value), diagnostic)
        self.assertEqual(diagnostic_lines(diagnostic)[1],
                         'FOUNDATION_STDOUT_SOURCE_COUNT_4_OTHER_1_ORDER_READY_CLOSED_RESULT_OTHER')

    def test_stdout_diagnostic_untrusted_summary_cannot_echo_values(self):
        for summary in ({'mode': 'private', 'count': 1, 'otherCount': 0, 'classes': ('OTHER',)},
                        {'mode': 'source', 'count': 1, 'otherCount': 0, 'classes': ('private',)},
                        {'mode': 'source', 'count': True, 'otherCount': 0, 'classes': ('OTHER',)}):
            self.assertEqual(diagnostic_lines({'stdout': summary}),
                             ['FOUNDATION_VALIDATION_STAGE_UNKNOWN'])

    def test_diagnostic_allowlist_rejects_private_or_malformed_values(self):
        for value in ('private host path', {}, [], None, 1):
            lines = diagnostic_lines({'stage': value, 'failure': value})
            self.assertEqual(lines, ['FOUNDATION_VALIDATION_STAGE_UNKNOWN'])
        self.assertEqual(diagnostic_lines({'stage': 'IO_READ', 'failure': 'RUNTIME_FAILED'}),
                         ['FOUNDATION_VALIDATION_STAGE_IO_READ', 'FOUNDATION_SUPERVISOR_STAGE_RUNTIME_FAILED'])

    def test_invalid_outer_failure_is_never_adopted_as_diagnostic(self):
        value = fixture()
        value['failure'] = 'private exception text'
        diagnostic = {}
        with self.assertRaises(InvalidEvidence):
            validate(encoded(value), diagnostic)
        self.assertEqual(diagnostic_lines(diagnostic), ['FOUNDATION_VALIDATION_STAGE_OUTER_SCHEMA'])

    def test_exclusive_output_and_no_stale_success(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            raw, output = root / 'raw.json', root / 'validated.json'
            raw.write_bytes(encoded(fixture()))
            self.assertTrue(write_validated(raw, output))
            before = output.read_bytes()
            with self.assertRaises(FileExistsError):
                write_validated(raw, output)
            self.assertEqual(output.read_bytes(), before)

    def test_invalid_or_nonregular_input_creates_no_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            raw, output = root / 'raw.json', root / 'validated.json'
            raw.mkdir()
            with self.assertRaises(InvalidEvidence):
                write_validated(raw, output)
            raw.rmdir()
            raw.write_bytes(b'PRIVATE invalid data')
            with self.assertRaises(InvalidEvidence):
                write_validated(raw, output)
            self.assertFalse(output.exists())

    def test_valid_failure_writes_sanitized_failed_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            raw, output = root / 'raw.json', root / 'validated.json'
            value = fixture()
            value['directoryCleanup'] = False
            raw.write_bytes(encoded(value))
            self.assertFalse(write_validated(raw, output))
            self.assertFalse(json.loads(output.read_bytes())['passed'])

    def test_derived_success_has_no_payload(self):
        result = validate(encoded(fixture()))
        self.assertTrue(result['passed'])
        self.assertEqual(result['oldNavigationGate'], 'FAIL_RETAINED')
        self.assertNotIn('payload', json.dumps(result))

    def test_each_negative_requirement_is_mandatory(self):
        for kind, field in (('crash', 'armed'), ('crash', 'observed'), ('crash', 'bootstrapFailed'),
                            ('tamper', 'changed'), ('tamper', 'bootstrapFailed')):
            value = fixture()
            value['negatives'][kind][field] = False
            self.assertFalse(validate(encoded(value))['passed'])
        for kind, field in (('crash', 'unexpectedQuit'), ('tamper', 'unexpectedReady')):
            value = fixture()
            value['negatives'][kind][field] = True
            self.assertFalse(validate(encoded(value))['passed'])

    def test_failure_process_not_any_error(self):
        for code in (0, 2):
            value = fixture()
            value['negatives']['tamper']['process'] = process(code)
            self.assertFalse(validate(encoded(value))['passed'])

    def test_all_cleanup_and_integrity_flags_mandatory(self):
        for field in ('buildVerified', 'binaryHashMatched', 'runtimeCopyVerified', 'directoryCleanup'):
            value = fixture()
            value[field] = False
            self.assertFalse(validate(encoded(value))['passed'])
        value = fixture()
        value['installer']['officialMarker'] = False
        self.assertFalse(validate(encoded(value))['passed'])

    def test_inner_duplicate_false_to_true_rejected_before_normalization(self):
        value = fixture()
        value['runs']['source']['payload'] = value['runs']['source']['payload'].replace(
            '"orderly_quit": true', '"orderly_quit":false,"orderly_quit":true')
        self.rejected(value)

    def test_outer_duplicate_false_to_true_rejected(self):
        raw = encoded(fixture()).replace(b'"directoryCleanup": true',
                                        b'"directoryCleanup":false,"directoryCleanup":true')
        with self.assertRaises(InvalidEvidence):
            validate(raw)

    def test_unknown_missing_repeated_and_reordered_stdout_rejected(self):
        for prefix in ('PRIVATE PATH\n', 'BOOTSTRAP_READY\n'):
            value = fixture()
            value['runs']['source']['payload'] = prefix + value['runs']['source']['payload']
            self.rejected(value)
        for replacement in ('', 'BOOTSTRAP_CLOSED\nBOOTSTRAP_READY\n'):
            value = fixture()
            value['runs']['source']['payload'] = value['runs']['source']['payload'].replace('BOOTSTRAP_READY\nBOOTSTRAP_CLOSED\n', replacement)
            self.rejected(value)

    def test_crlf_stdout_supported(self):
        value = fixture()
        for run in value['runs'].values():
            run['payload'] = run['payload'].replace('\n', '\r\n')
        self.assertTrue(validate(encoded(value))['passed'])

    def test_wrong_inner_mode_and_extra_private_key_rejected(self):
        value = fixture()
        value['runs']['source']['payload'] = value['runs']['source']['payload'].replace('"mode": "source"', '"mode": "package"')
        self.rejected(value)
        value = fixture()
        value['negatives']['crash']['stderr'] = 'PRIVATE'
        self.rejected(value)

    def test_partial_failure_discards_private_output_never_invents_cases(self):
        value = fixture()
        value.update(failure='RUNTIME_FAILED', negatives={})
        value['runs'] = {'source': {'process': process(1), 'payload': 'private host path', 'ownedBytes': None}}
        result = validate(encoded(value))
        self.assertFalse(result['passed'])
        self.assertIsNone(result['runs']['source']['result'])
        self.assertNotIn('private host path', json.dumps(result))

    def test_missing_evidence_cannot_pass(self):
        for field in ('installer', 'runs', 'negatives'):
            value = fixture()
            value[field] = None if field == 'installer' else {}
            self.rejected(value)

    def test_invalid_sizes_types_nonfinite_and_unknown_failure(self):
        for replacement in (True, -1, 512 * 1024 * 1024 + 1, float('inf'), {}, 'private'):
            value = fixture()
            value['packageBytes'] = replacement
            self.rejected(value)
        value = fixture()
        value['failure'] = 'private exception text'
        self.rejected(value)

    def test_unpaired_surrogate_rejected_with_fixed_error(self):
        value = fixture()
        value['runs']['source']['payload'] = '\ud800'
        self.rejected(value)

    def test_boolean_alias_and_integer_flags_rejected(self):
        value = fixture()
        value['schemaVersion'] = True
        self.rejected(value)
        value = fixture()
        value['negatives']['crash']['armed'] = 1
        self.rejected(value)


if __name__ == '__main__':
    unittest.main()
