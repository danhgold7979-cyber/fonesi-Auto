import json
import unittest
from validate_runtime import InvalidEvidence,VERSIONS
from validate_vault import CASES,STAGES,validate_raw,validate_public

def fixture(stage='create'):
    return {'version':1,'mode':'source','stage':stage,'versions':dict(VERSIONS),'cases':dict.fromkeys(CASES,True),'recordCount':4,'accessDeniedCode':'EACCES' if stage=='denied' else None}
def capture():
    return {'process':{'status':'SUCCESS','exitCode':0,'cleanupComplete':True,'stdoutTruncated':False,'stderrTruncated':False},'stdout':'VAULT_ORDERLY\n','stderr':''}
def artifacts(stage='create'):return json.dumps({'version':1,'mode':'source','stage':stage,'canaryAbsent':True,'fileCount':8,'dumpCount':0}).encode()
def check(value=None,cap=None):return validate_raw(json.dumps(value or fixture()).encode(),json.dumps(cap or capture()).encode(),'source',(value or fixture())['stage'],artifacts((value or fixture())['stage']))
class VaultTests(unittest.TestCase):
    def test_stages_and_every_case_required(self):
        for stage in STAGES:
            result=check(fixture(stage));self.assertTrue(validate_public(result,'source',stage))
        for case in CASES:
            value=fixture();value['cases'][case]=False;self.assertFalse(check(value)['passed'])
    def test_process_cleanup_exit_and_forbidden_markers(self):
        for key in ('cleanupComplete','stdoutTruncated','stderrTruncated'):
            cap=capture();cap['process'][key]=not cap['process'][key];self.assertFalse(check(cap=cap)['passed'])
        cap=capture();cap['process']['status']='NONZERO_EXIT';cap['process']['exitCode']=1;self.assertFalse(check(cap=cap)['passed'])
        for marker in ('VAULT_FAILED','VAULT_UNEXPECTED_QUIT','VAULT_DEADLINE'):
            cap=capture();cap['stderr']=marker;self.assertFalse(check(cap=cap)['passed'])
    def test_raw_duplicates_private_fields_and_types(self):
        raw=json.dumps(fixture()).encode();cap=json.dumps(capture()).encode()
        with self.assertRaises(InvalidEvidence):validate_raw(raw.replace(b'"closed": true',b'"closed":false,"closed":true'),cap,'source','create',artifacts())
        for patch in ({'secret':'canary'},{'recordCount':True},{'recordCount':0},{'recordCount':129},{'version':True}):
            with self.assertRaises(InvalidEvidence):check({**fixture(),**patch})
    def test_exact_stdout_and_false_claim(self):
        cap=capture();cap['stdout']='\nVAULT_ORDERLY\n';self.assertTrue(check(cap=cap)['passed'])
        for raw in ('\n\nVAULT_ORDERLY\n',' VAULT_ORDERLY\n','VAULT_ORDERLY\nprivate','VAULT_ORDERLY\n\n'):
            cap=capture();cap['stdout']=raw
            with self.assertRaises(InvalidEvidence):check(cap=cap)
        value=check();value['cases']['auditFlushed']=False
        with self.assertRaises(InvalidEvidence):validate_public(value,'source','create')
    def test_capture_canaries_never_publish(self):
        import base64
        for canary in ('P106_SYNTHETIC_VAULT_INITIAL_CANARY','P106_SYNTHETIC_VAULT_REPLACED_CANARY'):
            for text in (canary,base64.b64encode(canary.encode()).decode()):
                cap=capture();cap['stderr']=text
                with self.assertRaises(InvalidEvidence):check(cap=cap)
    def test_context_requires_identity_provider_denial_and_reversion_controls(self):
        from validate_vault import CONTEXT_CASES,CONTEXT_STATUSES,validate_context,validate_context_public
        value={'version':1,'status':'PASS',**dict.fromkeys(CONTEXT_CASES,True)}
        cap=capture();cap['stdout']='VAULT_CONTEXT_RESULT\n'
        def run(v):return validate_context(json.dumps(v).encode(),json.dumps(cap).encode(),'source')
        self.assertTrue(validate_context_public(run(value),'source'))
        for key in CONTEXT_CASES:
            with self.assertRaises(InvalidEvidence):run({**value,key:False})
        for status in CONTEXT_STATUSES:
            if status!='PASS':self.assertFalse(run({**value,'status':status})['passed'])
        with self.assertRaises(InvalidEvidence):run({**value,'sid':'private'})
        raw=json.dumps(value).encode().replace(b'"ownerBlobDenied": true',b'"ownerBlobDenied":false,"ownerBlobDenied":true')
        with self.assertRaises(InvalidEvidence):validate_context(raw,json.dumps(cap).encode(),'source')
    def test_artifact_scan_cannot_be_vacuous_and_denial_code_is_observed_enum(self):
        scan=json.loads(artifacts());scan['fileCount']=0
        with self.assertRaises(InvalidEvidence):validate_raw(json.dumps(fixture()).encode(),json.dumps(capture()).encode(),'source','create',json.dumps(scan).encode())
        value=fixture('denied')
        for code in (None,True,'PRIVATE','EIO',{'code':'EACCES'}):
            with self.assertRaises(InvalidEvidence):check({**value,'accessDeniedCode':code})
        for code in ('EACCES','EPERM','EBUSY'):self.assertTrue(check({**value,'accessDeniedCode':code})['passed'])

    def test_safe_collection_exact_status_vector_is_not_pass(self):
        from itertools import product
        from validate_vault import CONTEXT_CASES,CONTEXT_STATUSES,validate_context,context_collection_safe
        cap=capture();cap['stdout']='VAULT_CONTEXT_RESULT\n'
        for status in CONTEXT_STATUSES:
            for bits in product((False,True),repeat=len(CONTEXT_CASES)):
                raw={'version':1,'status':status,**dict(zip(CONTEXT_CASES,bits))}
                try:value=validate_context(json.dumps(raw).encode(),json.dumps(cap).encode(),'source')
                except InvalidEvidence:
                    self.assertEqual(status,'PASS');self.assertFalse(all(bits));continue
                expected=status=='TOKEN_UNAVAILABLE' and bits==(True,False,False,False,False,False)
                self.assertEqual(context_collection_safe(value,'source'),expected)
                if expected:
                    self.assertFalse(value['passed']);value['passed']=True
                    with self.assertRaises(InvalidEvidence):context_collection_safe(value,'source')
    def test_safe_collection_rejects_every_native_process_uncertainty(self):
        from validate_vault import CONTEXT_CASES,validate_context,context_collection_safe
        raw={'version':1,'status':'TOKEN_UNAVAILABLE',**{k:k=='ownerBefore' for k in CONTEXT_CASES}}
        changes=({'status':'NONZERO_EXIT','exitCode':1},{'status':'TIMEOUT','exitCode':None},
                 {'status':'LAUNCH_FAILED','exitCode':None},{'status':'CAPTURE_FAILED','exitCode':0},
                 {'cleanupComplete':False},{'stdoutTruncated':True},{'stderrTruncated':True})
        for change in changes:
            cap=capture();cap['stdout']='VAULT_CONTEXT_RESULT\n';cap['process'].update(change)
            value=validate_context(json.dumps(raw).encode(),json.dumps(cap).encode(),'source')
            self.assertFalse(context_collection_safe(value,'source'))
        from pathlib import Path
        source=(Path(__file__).parent/'Invoke-Persistence.ps1').read_text()
        self.assertIn("if(-not $allClean){throw 'CONTEXT_VALIDATION_RETIREMENT'}",source)
        self.assertIn("$validation.Status -ceq 'NONZERO_EXIT' -and $validation.ExitCode -eq 1",source)
        for marker in ('VAULT_CONTEXT_COLLECTION_SAFE','VAULT_CONTEXT_STATUS_TOKEN_UNAVAILABLE','VAULT_VALIDATION_FAIL'):
            self.assertIn("Test-ExactlyOneLine $validation.Stdout '"+marker+"'",source)
