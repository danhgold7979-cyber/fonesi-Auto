import copy
import json
import unittest
import test_validate_persistence as key_tests
import test_validate_persistence_store as store_tests
import test_validate_persistence_maintenance as maintenance_tests
import test_validate_persistence_restore as restore_tests
from validate_persistence import validate_report, validate_ready
from validate_persistence_store import validate_stage
from validate_persistence_maintenance import validate_raw
from validate_persistence_restore import validate_raw as validate_restore
from validate_runtime import InvalidEvidence


def fixture():
    value = {'schemaVersion': 3, 'scope': 'HOSTED_KEY_MAIN_STORE_MAINTENANCE_RESTORE',
             'modes': {}, 'ready': {}, 'store': {}, 'maintenance': {}, 'restore': {},
             'runtimeCopyVerified': True, 'directoryCleanup': True, 'failure': None}
    for mode in ('source', 'package'):
        value['modes'][mode] = key_tests.PersistencePublicReportTests().public_mode(mode)
        value['ready'][mode] = validate_ready(*key_tests.ReadyApplicationTests().inputs(mode), mode)
        value['store'][mode] = {}
        for boundary in ('BEFORE_COMMIT', 'AFTER_COMMIT'):
            value['store'][mode][boundary] = {}
            for stage in ('crash', 'reopen'):
                raw, process, stdout = store_tests.data(stage, boundary, mode)
                value['store'][mode][boundary][stage] = validate_stage(json.dumps(raw).encode(), process, stdout, '', mode, boundary, stage)
        result, capture = maintenance_tests.inputs()
        result['mode'] = mode
        value['maintenance'][mode] = validate_raw(json.dumps(result).encode(), json.dumps(capture).encode(), mode)
        restored, restore_capture = restore_tests.fixture()
        restored['mode'] = mode
        value['restore'][mode] = validate_restore(json.dumps(restored).encode(), json.dumps(restore_capture).encode(), mode)
    return value


class MatrixTests(unittest.TestCase):
    def test_exact_v3_complete_fixed_matrix_passes(self):
        value = fixture()
        public = validate_report(json.dumps(value).encode())
        self.assertTrue(public['passed'])
        self.assertLess(len(json.dumps(public)), 65536)

    def test_missing_mode_boundary_stage_or_false_claim_rejected(self):
        for field in ('store', 'maintenance', 'restore'):
            value = fixture()
            del value[field]['package']
            with self.assertRaises(InvalidEvidence):
                validate_report(json.dumps(value).encode())
        value = fixture()
        del value['store']['source']['BEFORE_COMMIT']['reopen']
        with self.assertRaises(InvalidEvidence):
            validate_report(json.dumps(value).encode())
        value = fixture()
        value['store']['source']['AFTER_COMMIT']['crash']['cases']['commitBoundaryReached'] = False
        with self.assertRaises(InvalidEvidence):
            validate_report(json.dumps(value).encode())

    def test_failed_partial_matrix_remains_failure_and_duplicate_cannot_mask_it(self):
        value = fixture()
        value['failure'] = 'NATIVE_STAGE_FAILED'
        value['store'] = {'source': {'BEFORE_COMMIT': {}}}
        value['maintenance'] = {}
        raw = json.dumps(value).encode()
        self.assertFalse(validate_report(raw)['passed'])
        with self.assertRaises(InvalidEvidence):
            validate_report(raw.replace(b'"failure": "NATIVE_STAGE_FAILED"', b'"failure":"NATIVE_STAGE_FAILED","failure":null'))

    def test_restore_false_is_failure_and_false_success_claim_rejected(self):
        for mode in ('source', 'package'):
            value = fixture()
            value['restore'][mode]['cases']['original_bootstrap_authenticated'] = False
            with self.assertRaises(InvalidEvidence):
                validate_report(json.dumps(value).encode())
            value['restore'][mode]['passed'] = False
            self.assertFalse(validate_report(json.dumps(value).encode())['passed'])

    def test_missing_restore_field_and_partial_failure_never_pass(self):
        value = fixture()
        del value['restore']
        with self.assertRaises(InvalidEvidence):
            validate_report(json.dumps(value).encode())
        value = fixture()
        value['failure'] = 'NATIVE_STAGE_FAILED'
        value['restore'] = {}
        self.assertFalse(validate_report(json.dumps(value).encode())['passed'])
        value['failure'] = None
        with self.assertRaises(InvalidEvidence):
            validate_report(json.dumps(value).encode())

    def test_historical_v1_v2_do_not_require_or_accept_restore_extension(self):
        for version, scope in ((1, 'HOSTED_KEY_MECHANISM_ONLY'), (2, 'HOSTED_KEY_AND_MAIN_READY')):
            value = fixture()
            value['schemaVersion'] = version
            value['scope'] = scope
            del value['store'], value['maintenance'], value['restore']
            if version == 1:
                del value['ready']
            self.assertTrue(validate_report(json.dumps(value).encode())['passed'])
            value['restore'] = {}
            with self.assertRaises(InvalidEvidence):
                validate_report(json.dumps(value).encode())
