"""Offline artifact tests, no platform requests or authorization claims."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('capability_review_lint',
    ROOT / 'tools/phase-00/capability_review_lint.py')
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)
MATRIX = ROOT / 'docs/evidence/P0-08-capability-matrix.json'
BASE = json.loads(MATRIX.read_text(encoding='utf-8'))


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.document = copy.deepcopy(BASE)

    def result(self):
        return review.validate_review(json.dumps(self.document).encode())

    def test_checked_in_matrix_is_disabled_and_complete(self):
        # Validate the actual artifact bytes before any JSON normalization.
        self.assertEqual(review.validate_review(MATRIX.read_bytes()), 'CONSISTENT_DISABLED_REVIEW')
        self.assertEqual(self.result(), 'CONSISTENT_DISABLED_REVIEW')
        self.assertEqual(len(self.document['capabilities']), 18)
        self.assertFalse(any(row['enabled'] for row in self.document['capabilities']))

    def test_true_or_truthy_enablement_rejected_for_every_capability(self):
        for index in range(18):
            for value in (True, 1, 0, 'false', None):
                with self.subTest(index=index, value=value):
                    self.document = copy.deepcopy(BASE)
                    self.document['capabilities'][index]['enabled'] = value
                    self.assertEqual(self.result(), 'UNSAFE_CLAIM')

    def test_allowed_or_wrong_disposition_rejected(self):
        for value in ('ALLOWED', 'READY', 'UNKNOWN', 'DEFERRED'):
            self.document['capabilities'][0]['disposition'] = value
            self.assertEqual(self.result(), 'UNREVIEWED_DISPOSITION')

    def test_technical_readiness_cannot_be_invented(self):
        self.document['capabilities'][0]['technical_state'] = 'READY'
        self.assertEqual(self.result(), 'UNSAFE_CLAIM')

    def test_missing_extra_duplicate_unknown_capability(self):
        self.document['capabilities'].pop()
        self.assertEqual(self.result(), 'INCOMPLETE_COVERAGE')
        self.document = copy.deepcopy(BASE)
        self.document['capabilities'].append(copy.deepcopy(self.document['capabilities'][0]))
        self.assertEqual(self.result(), 'INCOMPLETE_COVERAGE')
        for key in ('UNREVIEWED-ACTION', 'FB-PAGE-PHOTO', None, []):
            self.document = copy.deepcopy(BASE)
            self.document['capabilities'][1]['id'] = key
            self.assertEqual(self.result(), 'INVALID_COVERAGE')

    def test_privilege_field_or_missing_field_rejected(self):
        self.document['capabilities'][0]['command'] = 'synthetic-canary'
        self.assertEqual(self.result(), 'INVALID_ROW')
        del self.document['capabilities'][0]['command']
        del self.document['capabilities'][0]['enabled']
        self.assertEqual(self.result(), 'INVALID_ROW')

    def test_empty_unknown_duplicate_or_nonstring_sources(self):
        for refs in ([], ['UNKNOWN'], ['S1','S1'], [{}], 'S1'):
            self.document['capabilities'][0]['source_refs'] = refs
            self.assertEqual(self.result(), 'INVALID_SOURCE_REFS')

    def test_missing_or_duplicate_evidence_gate(self):
        for evidence in ([], ['current_terms_review'] * 6, [None], {}):
            self.document['capabilities'][0]['required_evidence'] = evidence
            self.assertEqual(self.result(), 'MISSING_EVIDENCE_GATES')

    def test_reason_required(self):
        for reason in ('', '  ', None, 'x' * 1001):
            self.document['capabilities'][0]['reason'] = reason
            self.assertEqual(self.result(), 'INVALID_ROW')

    def test_invalid_date_or_kind(self):
        for value in ('not-a-date', '2026-99-99', '20261030', None):
            self.document['review_date'] = value
            self.assertEqual(self.result(), 'INVALID_DOCUMENT')
        self.document = copy.deepcopy(BASE)
        self.document['kind'] = 'RUNTIME_PERMISSION'
        self.assertEqual(self.result(), 'INVALID_DOCUMENT')

    def test_json_duplicate_keys_and_nonobject(self):
        for payload in (b'{"kind":1,"kind":2}', b'[]', b'null', b'{', b'\xff', b''):
            self.assertEqual(review.validate_review(payload), 'INVALID_DOCUMENT')

    def test_duplicate_enablement_cannot_be_masked_by_roundtrip(self):
        payload = MATRIX.read_bytes().replace(b'"enabled": false',
            b'"enabled": true, "enabled": false', 1)
        self.assertEqual(review.validate_review(payload), 'INVALID_DOCUMENT')
        # Why the checked-in test must pass raw bytes: normal JSON loses duplicates.
        normalized = json.dumps(json.loads(payload)).encode()
        self.assertEqual(review.validate_review(normalized), 'CONSISTENT_DISABLED_REVIEW')

    def test_resource_and_type_limits(self):
        for payload in (b' ' * (review.MAX_BYTES + 1), 'not-bytes',
                        b'[' * 3000 + b'0' + b']' * 3000):
            self.assertEqual(review.validate_review(payload), 'INVALID_DOCUMENT')

    def test_output_does_not_echo_canaries(self):
        self.document['capabilities'][0]['id'] = 'PRIVATE-CANARY'
        self.assertNotIn('PRIVATE-CANARY', self.result())


if __name__ == '__main__':
    unittest.main()
