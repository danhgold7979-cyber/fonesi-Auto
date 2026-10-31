import json
import unittest
import test_validate_persistence_matrix as previous
import test_validate_vault as vault
from validate_vault import STAGES,LEGACY_STAGES,CONTEXT_CASES,validate_raw,validate_context
from validate_persistence import validate_report
from validate_runtime import InvalidEvidence

def fixture(version=4):
    value=previous.fixture();value['schemaVersion']=version;value['scope']='HOSTED_PERSISTENCE_AND_VAULT_NEGATIVES' if version==5 else 'HOSTED_PERSISTENCE_AND_VAULT';value['vault']={};value['context']={}
    for mode in ('source','package'):
        value['vault'][mode]={}
        for stage in (STAGES if version==5 else LEGACY_STAGES):
            raw=vault.fixture(stage);raw['mode']=mode
            artifacts=json.loads(vault.artifacts(stage));artifacts['mode']=mode
            value['vault'][mode][stage]=validate_raw(json.dumps(raw).encode(),json.dumps(vault.capture()).encode(),mode,stage,json.dumps(artifacts).encode())
        raw={'version':1,'status':'PASS',**dict.fromkeys(CONTEXT_CASES,True)};cap=vault.capture();cap['stdout']='VAULT_CONTEXT_RESULT\n'
        value['context'][mode]=validate_context(json.dumps(raw).encode(),json.dumps(cap).encode(),mode)
    return value
class VaultMatrixTests(unittest.TestCase):
    def test_v4_requires_every_actual_stage_and_context(self):
        value=fixture();self.assertTrue(validate_report(json.dumps(value).encode())['passed'])
        for field in ('vault','context'):
            broken=fixture();del broken[field]['package']
            with self.assertRaises(InvalidEvidence):validate_report(json.dumps(broken).encode())
        broken=fixture();del broken['vault']['source']['denied']
        with self.assertRaises(InvalidEvidence):validate_report(json.dumps(broken).encode())
    def test_unavailable_context_is_not_pass_and_failure_partial_stays_honest(self):
        value=fixture(5);value['context']['source']['status']='TOKEN_UNAVAILABLE';value['context']['source']['passed']=False
        value['context']['source']['cases']={k:k=='ownerBefore' for k in CONTEXT_CASES}
        self.assertFalse(validate_report(json.dumps(value).encode())['passed'])
        value['failure']='STAGE_VALIDATION_FAILED';value['vault']['package']={}
        self.assertFalse(validate_report(json.dumps(value).encode())['passed'])
    def test_legacy_v3_retained_and_private_fields_rejected(self):
        self.assertTrue(validate_report(json.dumps(previous.fixture()).encode())['passed'])
        value=fixture();value['vault']['source']['create']['secretId']='private'
        with self.assertRaises(InvalidEvidence):validate_report(json.dumps(value).encode())
    def test_artifact_false_and_duplicate_masks_reject(self):
        value=fixture();value['vault']['source']['create']['artifacts']['canaryAbsent']=False
        with self.assertRaises(InvalidEvidence):validate_report(json.dumps(value).encode())
        raw=json.dumps(fixture()).encode().replace(b'"canaryAbsent": true',b'"canaryAbsent": false,"canaryAbsent": true',1)
        with self.assertRaises(InvalidEvidence):validate_report(raw)

    def test_v5_requires_missing_and_corrupt_in_both_modes(self):
        self.assertTrue(validate_report(json.dumps(fixture(5)).encode())['passed'])
        for mode in ('source','package'):
            for stage in ('missing','corrupt'):
                value=fixture(5);del value['vault'][mode][stage]
                with self.assertRaises(InvalidEvidence):validate_report(json.dumps(value).encode())
                value=fixture(5);value['vault'][mode][stage]['cases']['operationVerified']=False
                value['vault'][mode][stage]['passed']=False
                self.assertFalse(validate_report(json.dumps(value).encode())['passed'])
        value=fixture(5);value['schemaVersion']=4;value['scope']='HOSTED_PERSISTENCE_AND_VAULT'
        with self.assertRaises(InvalidEvidence):validate_report(json.dumps(value).encode())
