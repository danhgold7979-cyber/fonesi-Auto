import json
import unittest
from validate import BASE, STAGES, validate

def fixture():
    stages=[]
    for stage in STAGES:
        cases=BASE|({'tail_truncation','tail_bitflip'} if stage=='tamper' else set())
        r={'schemaVersion':1,'stage':stage,'passed':True,'electron':'45.1.0','node':'24.22.1','cases':dict.fromkeys(cases,True),'rotationHints':[False,True,False],'failure':None}
        stages.append({'stage':stage,'status':'SUCCESS','exitCode':0,'cleanupComplete':True,'stdoutTruncated':False,'payload':json.dumps(r),'ownedBytes':600000})
    return {'schemaVersion':1,'scope':'HOSTED_RUNNER_ONLY','installer':{'status':'SUCCESS','exitCode':0,'cleanupComplete':True},'stages':stages,'directoryCleanup':True,'failure':None}
class Validation(unittest.TestCase):
    def good(self,x):return validate(json.dumps(x).encode())
    def bad(self,x):
        with self.assertRaises((ValueError,TypeError)):self.good(x)
    def mutate(self,key,value):
        x=fixture();p=json.loads(x['stages'][0]['payload']);p[key]=value;x['stages'][0]['payload']=json.dumps(p);return x
    def test_valid_and_rotation_bool_observed(self):self.assertTrue(self.good(fixture())['passed'])
    def test_duplicates(self):
        x=fixture();x['stages'][0]['payload']=x['stages'][0]['payload'].replace('"stage": "create"','"stage": "create", "stage": "create"');self.bad(x)
        with self.assertRaises(ValueError):validate(json.dumps(fixture()).replace('"schemaVersion": 1','"schemaVersion": 1, "schemaVersion": 1',1).encode())
    def test_private_fields_and_unknown_errors(self):
        self.bad(self.mutate('failure','private error'));self.bad(self.mutate('ciphertext','secret'))
    def test_stage_order_and_count(self):
        x=fixture();x['stages'].reverse();self.bad(x)
        x=fixture();x['stages'].pop();self.bad(x)
    def test_exact_case_set(self):
        self.bad(self.mutate('cases',dict.fromkeys(BASE|{'unexpected'},True)))
        self.bad(self.mutate('cases',[True]*8))
    def test_fake_pass(self):
        cases=dict.fromkeys(BASE,True);cases['baseline']=False;self.bad(self.mutate('cases',cases))
    def test_unavailable_is_failure(self):
        x=fixture();x['stages']=x['stages'][:1];p=json.loads(x['stages'][0]['payload']);p['failure']='UNAVAILABLE';p['passed']=False;p['cases']['baseline']=False;p['cases']['orderly_quit']=False;p['rotationHints']=[];x['stages'][0].update(payload=json.dumps(p),status='NONZERO_EXIT',exitCode=1);x['failure']='RUNTIME_FAILED'
        self.assertFalse(self.good(x)['passed'])
    def test_cleanup(self):
        x=fixture();x['directoryCleanup']=False;self.bad(x)
        x=fixture();x['stages'][0]['cleanupComplete']=False;self.bad(x)
    def test_hints_types_lengths(self):
        for hints in ([0,0,0],[False]*4,[],None):self.bad(self.mutate('rotationHints',hints))
    def test_runtime_and_status(self):
        self.bad(self.mutate('electron','46.0.0'))
        x=fixture();x['stages'][0]['status']='NONZERO_EXIT';self.bad(x)
    def test_nonfinite_bounds_truncation(self):
        for value in (float('nan'),True,4194305):
            x=fixture();x['stages'][0]['ownedBytes']=value;self.bad(x)
        x=fixture();x['stages'][0]['stdoutTruncated']=True;self.bad(x)
        with self.assertRaises(ValueError):validate(b' '*65537)
    def test_no_excluded_stage_pass(self):
        x=fixture();x['stages'].append(x['stages'][-1]);self.bad(x)
if __name__=='__main__':unittest.main()
