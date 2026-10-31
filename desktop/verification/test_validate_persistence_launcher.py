import json
import unittest
from validate_runtime import InvalidEvidence
from validate_persistence_launcher import CASES,validate_raw,validate_public

def fixture():
    return {'version':1,'result':{'version':1,'scope':'INSTRUMENTED_PRODUCTION_LAUNCHER','cases':dict.fromkeys(CASES,True),'protectedCount':2,'ordinaryCount':1},'cleanupComplete':True}

class LauncherTests(unittest.TestCase):
    def test_all_fixed_facts_and_cleanup_required(self):
        self.assertTrue(validate_public(fixture()))
        for case in CASES:
            value=fixture();value['result']['cases'][case]=False
            self.assertFalse(validate_public(value))
        value=fixture();value['cleanupComplete']=False
        self.assertFalse(validate_public(value))
    def test_duplicate_masking_and_private_fields_rejected(self):
        raw=json.dumps(fixture()).encode()
        with self.assertRaises(InvalidEvidence):
            validate_raw(raw.replace(b'"cleanupComplete": true',b'"cleanupComplete":false,"cleanupComplete":true'))
        with self.assertRaises(InvalidEvidence):
            validate_raw(raw.replace(b'"same_old_backup": true',b'"same_old_backup":false,"same_old_backup":true'))
        value=fixture();value['root']='private'
        with self.assertRaises(InvalidEvidence):validate_public(value)
    def test_bool_counts_unknown_cases_and_scope_rejected(self):
        for key in ('protectedCount','ordinaryCount'):
            value=fixture();value['result'][key]=True
            with self.assertRaises(InvalidEvidence):validate_public(value)
        value=fixture();value['result']['cases']['extra']=True
        with self.assertRaises(InvalidEvidence):validate_public(value)
        value=fixture();value['result']['scope']='PRODUCTION_ACCEPTED'
        with self.assertRaises(InvalidEvidence):validate_public(value)
    def test_publish_is_exclusive_bounded_and_rejects_invalid_input(self):
        import tempfile
        from pathlib import Path
        from validate_persistence_launcher import publish
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve()
            source=root/'launcher-e2e-result.json'
            source.write_text(json.dumps(fixture()),encoding='utf8')
            self.assertTrue(publish(root))
            output=root/'launcher-e2e-validated.json'
            self.assertTrue(validate_raw(output.read_bytes()))
            with self.assertRaises(FileExistsError):publish(root)
            output.unlink()
            source.write_bytes(b' ' * 65537)
            with self.assertRaises(InvalidEvidence):publish(root)
            self.assertFalse(output.exists())
            source.write_text('{"private":"never publish"}',encoding='utf8')
            with self.assertRaises(InvalidEvidence):publish(root)
            self.assertFalse(output.exists())
