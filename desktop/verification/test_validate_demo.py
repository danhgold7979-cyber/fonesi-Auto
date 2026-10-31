import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from validate_demo import *
from test_validate_ui import png, process
import test_validate_persistence as persistence_tests

def stage(mode):
 raw={'version':1,'mode':mode,'versions':VERSIONS,'cases':{key:True for key in cases(mode)},'images':[{'name':name,'width':w,'height':h,'bytes':100,'sha256':hashlib.sha256(name.encode()).hexdigest()} for name,w,h in specs(mode)]}
 return raw,{'process':process(),'stdout':'\n'.join(stdout(mode))+'\n','stderr':''}
def negative(name):
 return {'process':{**process(),'status':'NONZERO_EXIT','exitCode':1},'stdout':'','stderr':('BOOTSTRAP_FAILED' if name=='production-argument' else 'DEMO_FAILED')+'\n'}
def report():
 value={'version':1,'scope':'HOSTED_EXPLICIT_DEMO_BOUNDARY','excludedVaultContext':'P106_UNMET_NOT_RERUN','bootstrap':{'source':persistence_tests.PersistencePublicReportTests().public_mode('source')},'modes':{},'negatives':{name:validate_negative(negative(name),name) for name in NEGATIVES},'productionFilesUnchanged':True,'productionPayloadCopyVerified':True,'screenshots':{},'runtimeCopyVerified':True,'directoryCleanup':True,'failure':None}
 for mode in MODES:
  raw,cap=stage(mode);value['modes'][mode]=validate_stage(json.dumps(raw).encode(),cap,mode)
  for image in raw['images']:value['screenshots'][image['name']]=image
 return value
class DemoTests(unittest.TestCase):
 def test_three_modes_every_case_and_retirement_required(self):
  for mode in MODES:
   raw,cap=stage(mode);self.assertTrue(validate_stage(json.dumps(raw).encode(),cap,mode)['passed'])
   for key in cases(mode):
    bad=copy.deepcopy(raw);bad['cases'][key]=False;self.assertFalse(validate_stage(json.dumps(bad).encode(),cap,mode)['passed'])
   cap['process']['cleanupComplete']=False;self.assertFalse(validate_stage(json.dumps(raw).encode(),cap,mode)['passed'])
 def test_duplicate_unknown_framing_and_false_claim_reject(self):
  raw,cap=stage('source')
  for data in (json.dumps(raw).replace('"version": 1','"version":0,"version":1').encode(),json.dumps({**raw,'secret':'private'}).encode(),json.dumps({**raw,'version':True}).encode()):
   with self.assertRaises(ValueError):validate_stage(data,cap,'source')
  for text in ('PRIVATE\n'+cap['stdout'],'\n\n'+cap['stdout'],cap['stdout']+'\n'):
   with self.assertRaises(ValueError):validate_stage(json.dumps(raw).encode(),{**cap,'stdout':text},'source')
  value=validate_stage(json.dumps(raw).encode(),cap,'source');value['cases']['ownedProfile']=False
  with self.assertRaises(ValueError):validate_public(value,'source')
 def test_negative_requires_actual_fixed_denial_nonzero_and_retirement(self):
  for name in NEGATIVES:
   cap=negative(name);self.assertTrue(validate_negative(cap,name)['passed'])
   for updates in ({'status':'SUCCESS','exitCode':0},{'cleanupComplete':False},{'stdoutTruncated':True},{'exitCode':73}):
    bad=copy.deepcopy(cap);bad['process'].update(updates);self.assertFalse(validate_negative(bad,name)['passed'])
   for text in ('','DEMO_READY\n'):
    bad=copy.deepcopy(cap)
    if text:bad['stdout']=text
    else:bad['stderr']=''
    self.assertFalse(validate_negative(bad,name)['passed'])
 def test_report_five_bound_images_and_all_guards(self):
  value=report();self.assertTrue(validate_report(json.dumps(value).encode())['passed']);self.assertEqual(len(value['screenshots']),5)
  for key in ('productionFilesUnchanged','productionPayloadCopyVerified','runtimeCopyVerified','directoryCleanup'):
   bad=copy.deepcopy(value);bad[key]=False;self.assertFalse(validate_report(json.dumps(bad).encode())['passed'])
  for key in ('bootstrap','modes','negatives','screenshots'):
   bad=copy.deepcopy(value);bad[key].pop(next(iter(bad[key])))
   with self.assertRaises(ValueError):validate_report(json.dumps(bad).encode())
 def test_partial_failure_does_not_claim_pass(self):
  value=report();value.update(failure='NATIVE_STAGE_FAILED',modes={},screenshots={},negatives={})
  self.assertFalse(validate_report(json.dumps(value).encode())['passed'])
 def test_owned_stage_and_five_image_publisher_are_exclusive(self):
  with tempfile.TemporaryDirectory() as directory:
   base=Path(directory).resolve()/'.demo-verification';base.mkdir();root=base/'owned';root.mkdir();(root/'.owner').write_text('12345678-1234-1234-1234-123456789abc')
   value=report();value['screenshots']={}
   for mode in MODES:
    target=root if mode=='production' else root/f'demo-{mode}'
    if target!=root:target.mkdir()
    raw,cap=stage(mode);cap['stderr']='private synthetic diagnostic'
    for image,spec in zip(raw['images'],specs(mode)):
     name,w,h=spec;data=png(w,h,1 if '-dark' in name else 0);image.update({'name':name,**screenshot(data,w,h)});(target/name).write_bytes(data)
    (target/f'demo-{mode}.json').write_text(json.dumps(raw));(root/f'demo-capture-{mode}.json').write_text(json.dumps(cap));self.assertTrue(stage_files(root,mode));self.assertNotIn('private synthetic',(root/f'demo-public-{mode}.json').read_text())
    with self.assertRaises(FileExistsError):stage_files(root,mode)
    value['modes'][mode]=parse((root/f'demo-public-{mode}.json').read_bytes());screenshot_files(root,mode)
    for image in raw['images']:value['screenshots'][image['name']]=image
   (base/'unvalidated.json').write_text(json.dumps(value));first=base/specs('source')[0][0];saved=first.read_bytes();first.unlink()
   with self.assertRaises(OSError):publish(base)
   self.assertFalse((base/'validated.json').exists());first.write_bytes(png(1440,900,2))
   with self.assertRaises(ValueError):publish(base)
   first.write_bytes(saved);self.assertEqual(publish(base),(True,True))
   with self.assertRaises(FileExistsError):publish(base)
 def test_no_identity_or_full_persistence_supervisor_and_exact_demo_literal(self):
  source=(Path(__file__).parent/'Invoke-Demo.ps1').read_text()
  for forbidden in ('Test-VaultContext','VaultDpapiContext','Invoke-Persistence.ps1'):self.assertNotIn(forbidden,source)
  self.assertIn("'--demo'",source);self.assertIn('ReserveDirectory($base)',source)
  self.assertIn('demo-production-witness\\.json',source);self.assertNotIn('Write-Output $Probe.Stderr',source)
 def test_diagnostics_are_finite_and_do_not_confirm_uncertain_retirement(self):
  raw,cap=stage('source');self.assertEqual(capture_diagnostics(cap,'source'),['DEMO_PROCESS_SUCCESS','DEMO_EXIT_ZERO','DEMO_RETIREMENT_CONFIRMED','DEMO_STDOUT_EXACT'])
  for update in ({'status':'TIMEOUT','exitCode':None},{'stdoutTruncated':True},{'stderrTruncated':True},{'cleanupComplete':False}):
   bad=copy.deepcopy(cap);bad['process'].update(update);self.assertIn('DEMO_RETIREMENT_UNCONFIRMED',capture_diagnostics(bad,'source'))
  bad=copy.deepcopy(cap);bad['process']['status']={'PRIVATE':True};self.assertEqual(capture_diagnostics(bad,'source'),['DEMO_CAPTURE_INVALID'])
  cap['stdout']='PRIVATE_PATH_OR_SECRET\n';cap['stderr']='PRIVATE_ERROR'
  markers=capture_diagnostics(cap,'source');self.assertIn('DEMO_STDOUT_OTHER',markers);self.assertNotIn('PRIVATE',' '.join(markers))
 def test_cli_false_cases_and_missing_result_emit_only_fixed_locations(self):
  import io
  from contextlib import redirect_stdout
  from unittest.mock import patch
  import validate_demo as validator
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory).resolve();(root/'.owner').write_text('12345678-1234-1234-1234-123456789abc');(root/'demo-source').mkdir()
   raw,cap=stage('source');cap['stderr']='PRIVATE_ERROR';(root/'demo-capture-source.json').write_text(json.dumps(cap))
   def run():
    output=io.StringIO()
    with patch('sys.argv',['validate_demo.py','stage',str(root),'source']),redirect_stdout(output):code=validator.main()
    self.assertNotIn('PRIVATE_ERROR',output.getvalue());self.assertNotIn(str(root),output.getvalue());return code,output.getvalue()
   code,output=run();self.assertEqual(code,2);self.assertIn('DEMO_VALIDATION_STAGE_RESULT_READ',output);self.assertIn('DEMO_RETIREMENT_CONFIRMED',output)
   raw['cases']['dependentSelection']=False;(root/'demo-source/demo-source.json').write_text(json.dumps(raw))
   code,output=run();self.assertEqual(code,1);self.assertIn('DEMO_CASE_SOURCE_13_FALSE',output);self.assertIn('DEMO_VALIDATION_FAIL',output)
   self.assertFalse(parse((root/'demo-public-source.json').read_bytes())['passed'])
if __name__=='__main__':unittest.main()
