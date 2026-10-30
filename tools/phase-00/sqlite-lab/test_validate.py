import copy
import json
import unittest
from validate import CASES, validate

def fixture():
    rows=[]
    for mode in ('node','electron'):
        payload={'schemaVersion':1,'mode':mode,'passed':True,'node':'24.22.1','electron':'45.1.0' if mode=='electron' else None,'sqlite':'3.53.4','cases':dict.fromkeys(CASES,True),'failure':None,'statementExecutions':49}
        rows.append({'mode':mode,'status':'SUCCESS','exitCode':0,'cleanupComplete':True,'stdoutTruncated':False,'payload':json.dumps(payload),'ownedBytes':32768})
    return {'schemaVersion':1,'scope':'HOSTED_RUNNER_ONLY','installer':{'status':'SUCCESS','exitCode':0,'cleanupComplete':True},'runtimes':rows,'directoryCleanup':True,'failure':None}
class Validation(unittest.TestCase):
    def good(self,obj):return validate(json.dumps(obj).encode())
    def bad(self,obj):
        with self.assertRaises((ValueError,TypeError)):self.good(obj)
    def test_valid(self):self.assertTrue(self.good(fixture())['passed'])
    def test_duplicate_outer(self):
        raw=json.dumps(fixture()).replace('"schemaVersion": 1','"schemaVersion": 1, "schemaVersion": 1',1)
        with self.assertRaises(ValueError):validate(raw.encode())
    def test_duplicate_payload(self):
        x=fixture();x['runtimes'][0]['payload']=x['runtimes'][0]['payload'].replace('"mode": "node"','"mode": "node", "mode": "node"');self.bad(x)
    def test_missing_extra_cases(self):
        for change in ('missing','extra'):
            x=fixture();p=json.loads(x['runtimes'][0]['payload'])
            if change=='missing':p['cases'].pop('runtime')
            else:p['cases']['unknown']=True
            x['runtimes'][0]['payload']=json.dumps(p);self.bad(x)
    def test_wrong_runtime(self):
        x=fixture();x['runtimes'].reverse();self.bad(x)
    def test_false_cleanup(self):
        for key in ('directoryCleanup','failure'):
            x=fixture();x[key]=False if key=='directoryCleanup' else 'CLEANUP_FAILED';self.bad(x)
        x=fixture();x['runtimes'][0]['cleanupComplete']=False;self.bad(x)
    def test_nonfinite_oversize(self):
        x=fixture();x['runtimes'][0]['ownedBytes']=float('nan');self.bad(x)
        with self.assertRaises(ValueError):validate(b' '*65537)
    def test_raw_text_rejected(self):
        x=fixture();p=json.loads(x['runtimes'][0]['payload']);p['failure']='secret/path';x['runtimes'][0]['payload']=json.dumps(p);self.bad(x)
    def test_arbitrary_cases_and_bool_number(self):
        x=fixture();p=json.loads(x['runtimes'][0]['payload']);p['cases']=[True]*len(CASES);x['runtimes'][0]['payload']=json.dumps(p);self.bad(x)
        x=fixture();x['runtimes'][0]['ownedBytes']=True;self.bad(x)
    def test_failed_probe_not_pass(self):
        x=fixture();p=json.loads(x['runtimes'][0]['payload']);p['passed']=False;p['cases']['constraints']=False;p['failure']='PROBE_FAILED';x['runtimes'][0]['payload']=json.dumps(p);x['runtimes'][0]['exitCode']=1;x['runtimes'][0]['status']='NONZERO_EXIT'
        self.assertFalse(self.good(x)['passed'])
    def test_status_exit_contradiction(self):
        x=fixture();x['runtimes'][0]['status']='NONZERO_EXIT';self.bad(x)
    def test_fake_pass(self):
        x=fixture();p=json.loads(x['runtimes'][0]['payload']);p['cases']['engine']=False;x['runtimes'][0]['payload']=json.dumps(p);self.bad(x)
    def test_unknown_version_and_truncation(self):
        x=fixture();p=json.loads(x['runtimes'][0]['payload']);p['node']='24.0.0';x['runtimes'][0]['payload']=json.dumps(p);self.bad(x)
        x=fixture();x['runtimes'][0]['stdoutTruncated']=True;self.bad(x)
if __name__=='__main__':unittest.main()
