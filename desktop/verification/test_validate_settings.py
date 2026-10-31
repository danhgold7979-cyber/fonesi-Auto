import copy
import json
import struct
import unittest
import tempfile
import io
from contextlib import redirect_stdout
from unittest.mock import patch
from pathlib import Path
from validate_settings import stage_files, publish
import zlib
from validate_settings import CASES, CASES_V1, CASES_V2, SCOPES, STAGES, VERSIONS, validate_stage, validate_public, validate_report, screenshot

def process(crash=False):
 return {'status':'NONZERO_EXIT' if crash else 'SUCCESS','exitCode':73 if crash else 0,'cleanupComplete':True,'stdoutTruncated':False,'stderrTruncated':False}
def stage(mode='source',name='ui',version=1):
 raw={'version':version,'mode':mode,'stage':name,'versions':VERSIONS,'cases':{key:True for key in (CASES_V1 if version==1 else CASES_V2)[name]}}
 stdout='SETTINGS_ARMED\n' if name.endswith('-crash') else ('BOOTSTRAP_READY\nBOOTSTRAP_CLOSED\nSETTINGS_CLOSED\n' if name in ('ui','reopen') else 'SETTINGS_CLOSED\n')
 return raw,{'process':process(name.endswith('-crash')),'stdout':stdout,'stderr':''}
def png(value=0):
 def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
 pixels=(b'\0'+bytes([value])*1024*3)*768
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1024,768,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(pixels))+chunk(b'IEND',b'')
class SettingsValidationTests(unittest.TestCase):
 def test_recovery_stages_exact_controls_and_false_case_never_passes(self):
  from validate_settings import RECOVERY_STAGES,recovery_cases,recovery_stdout,validate_recovery,validate_recovery_public
  for mode in ('source','package'):
   for name in RECOVERY_STAGES:
    raw={'version':1,'mode':mode,'stage':name,'versions':VERSIONS,'cases':{key:True for key in recovery_cases(name)}}
    capture={'process':process(),'stdout':recovery_stdout(name),'stderr':''}
    public=validate_recovery(json.dumps(raw).encode(),capture,mode,name)
    self.assertTrue(public['passed']);self.assertTrue(validate_recovery_public(public,mode,name))
    for case in raw['cases']:
     changed=copy.deepcopy(raw);changed['cases'][case]=False
     self.assertFalse(validate_recovery(json.dumps(changed).encode(),capture,mode,name)['passed'])
    for mutation in ({'stdout':capture['stdout']+'PRIVATE\n'},{'stdout':'BOOTSTRAP_READY\n'+capture['stdout']},{'stderr':'RECOVERY_FAILED\n'}):
     with self.assertRaises(ValueError):validate_recovery(json.dumps(raw).encode(),{**capture,**mutation},mode,name)
    bad=copy.deepcopy(public);bad['cases']['ownedRoot']=False
    with self.assertRaises(ValueError):validate_recovery_public(bad,mode,name)
    data=json.dumps(raw).replace('"ownedRoot": true','"ownedRoot": false,"ownedRoot": true').encode()
    with self.assertRaises(ValueError):validate_recovery(data,capture,mode,name)
 def test_actual_recovery_output_exclusive_and_supervisor_uses_fixed_native_route(self):
  from validate_settings import recovery_files,recovery_cases,recovery_stdout
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory).resolve();(root/'.owner').write_text('12345678-1234-1234-1234-123456789abc')
   name='current-confirm';raw={'version':1,'mode':'source','stage':name,'versions':VERSIONS,'cases':{key:True for key in recovery_cases(name)}}
   (root/f'settings-recovery-source-{name}.json').write_text(json.dumps(raw))
   (root/f'settings-recovery-capture-source-{name}.json').write_text(json.dumps({'process':process(),'stdout':recovery_stdout(name),'stderr':''}))
   self.assertTrue(recovery_files(root,'source',name))
   public=json.loads((root/f'settings-recovery-public-source-{name}.json').read_bytes())
   self.assertNotIn('stdout',public);self.assertTrue(public['passed'])
   with self.assertRaises(FileExistsError):recovery_files(root,'source',name)
  script=(Path(__file__).parent/'Invoke-Settings.ps1').read_text()
  for filename in ('settings-recovery-contract.cjs','settings-recovery-probe.cjs','settings-recovery-control.cjs'):
   self.assertIn("'"+filename+"'",script)
  self.assertIn('--maintenance=restore-to-new',script)
  self.assertIn("[IO.Path]::GetDirectoryName($outer) -cne $container",script)
  self.assertIn("[IO.File]::ReadAllText($marker.FullName) -cne $control.parentToken",script)
 def test_report3_requires_recovery_without_changing_historical_report_shapes(self):
  from validate_settings import RECOVERY_STAGES,recovery_cases,recovery_stdout,validate_recovery
  report={'version':3,'scope':SCOPES[3],'excludedVaultContext':'P106_UNMET_NOT_RERUN','bootstrap':{},'modes':{},'screenshots':{},'recovery':{},'runtimeCopyVerified':False,'directoryCleanup':False,'failure':'PREPARE_FAILED'}
  self.assertFalse(validate_report(json.dumps(report).encode())['passed'])
  for change in ({'version':2,'scope':SCOPES[2]},{'version':True},{'scope':SCOPES[2]}):
   with self.assertRaises(ValueError):validate_report(json.dumps({**report,**change}).encode())
  del report['recovery']
  with self.assertRaises(ValueError):validate_report(json.dumps(report).encode())
 def test_v2_native_negative_cases_are_mandatory_and_false_never_passes(self):
  for mode in ('source','package'):
   for name in STAGES:
    raw,capture=stage(mode,name,2)
    public=validate_stage(json.dumps(raw).encode(),capture,mode,name)
    self.assertTrue(public['passed']);self.assertTrue(validate_public(public,mode,name))
    for case in CASES_V2[name]:
     bad=copy.deepcopy(raw);bad['cases'][case]=False
     self.assertFalse(validate_stage(json.dumps(bad).encode(),capture,mode,name)['passed'])
  raw,capture=stage(version=2)
  for key in ('foreignSenderDenied','childFrameDenied','heldConfirmationRevoked','delayedReplyDiscarded'):
   bad=copy.deepcopy(raw);del bad['cases'][key]
   with self.assertRaises(ValueError):validate_stage(json.dumps(bad).encode(),capture,'source','ui')
 def test_versions_cannot_borrow_other_case_maps_or_scope(self):
  self.assertEqual(len(CASES_V1['ui']),18);self.assertEqual(len(CASES_V2['ui']),22)
  for version,other in ((1,2),(2,1)):
   raw,capture=stage(version=version);raw['version']=other
   with self.assertRaises(ValueError):validate_stage(json.dumps(raw).encode(),capture,'source','ui')
   report={'version':version,'scope':SCOPES[version],'excludedVaultContext':'P106_UNMET_NOT_RERUN','bootstrap':{},'modes':{},'screenshots':{},'runtimeCopyVerified':False,'directoryCleanup':False,'failure':'PREPARE_FAILED'}
   self.assertFalse(validate_report(json.dumps(report).encode())['passed'])
   wrong=copy.deepcopy(report);wrong['scope']=SCOPES[other]
   with self.assertRaises(ValueError):validate_report(json.dumps(wrong).encode())
   old,capture=stage(name='reopen',version=other)
   report['modes']={'source':{'reopen':validate_stage(json.dumps(old).encode(),capture,'source','reopen')}}
   with self.assertRaises(ValueError):validate_report(json.dumps(report).encode())
 def test_all_stages_and_false_case_no_pass(self):
  for mode in ('source','package'):
   for name in STAGES:
    raw,capture=stage(mode,name);public=validate_stage(json.dumps(raw).encode(),capture,mode,name)
    self.assertTrue(public['passed']);self.assertTrue(validate_public(public,mode,name))
    for case in CASES[name]:
     changed=copy.deepcopy(raw);changed['cases'][case]=False
     self.assertFalse(validate_stage(json.dumps(changed).encode(),capture,mode,name)['passed'])
 def test_duplicate_private_extra_type_and_versions_rejected(self):
  raw,capture=stage();data=json.dumps(raw).encode()
  for invalid in [data.replace(b'"version": 1',b'"version": 0,"version": 1'),data.replace(b'"ownedRoot": true',b'"ownedRoot": false,"ownedRoot": true'),json.dumps({**raw,'privatePath':'PRIVATE'}).encode(),json.dumps({**raw,'version':True}).encode()]:
   with self.assertRaises(ValueError):validate_stage(invalid,capture,'source','ui')
 def test_process_and_marker_controls(self):
  raw,capture=stage();data=json.dumps(raw).encode()
  for stdout in ['PRIVATE\n'+capture['stdout'],'\n\n'+capture['stdout'],capture['stdout']+'\n',capture['stdout'].replace('BOOTSTRAP_CLOSED\n','')]:
   with self.assertRaises(ValueError):validate_stage(data,{**capture,'stdout':stdout},'source','ui')
  self.assertTrue(validate_stage(data,{**capture,'stdout':'\n'+capture['stdout']},'source','ui')['passed'])
  for key in ('cleanupComplete','stdoutTruncated','stderrTruncated'):
   bad=copy.deepcopy(capture);bad['process'][key]=key!='cleanupComplete'
   self.assertFalse(validate_stage(data,bad,'source','ui')['passed'])
  raw,capture=stage(name='before-crash');capture['process']=process(False)
  self.assertFalse(validate_stage(json.dumps(raw).encode(),capture,'source','before-crash')['passed'])
 def test_fixed_scope_and_unmet_identity_cannot_be_relabelled(self):
  empty={'version':1,'scope':'HOSTED_SETTINGS_SCHEMA3','excludedVaultContext':'P106_UNMET_NOT_RERUN','bootstrap':{},'modes':{},'screenshots':{},'runtimeCopyVerified':False,'directoryCleanup':False,'failure':'PREPARE_FAILED'}
  self.assertFalse(validate_report(json.dumps(empty).encode())['passed'])
  for patch in [{'excludedVaultContext':'PASS'},{'failure':None},{'scope':'FULL_PHASE1'},{'private':'CANARY'}]:
   with self.assertRaises(ValueError):validate_report(json.dumps({**empty,**patch}).encode())
 def test_png_exact_size_crc_dimensions_and_no_text_metadata(self):
  image=png();meta=screenshot(image);self.assertEqual((meta['width'],meta['height']),(1024,768));self.assertNotEqual(meta['sha256'],screenshot(png(1))['sha256'])
  for bad in [image[:-1],image+b'PRIVATE',image[:20]+b'x'+image[21:],image[:8]+b'\0\0\0\0tEXt'+b'\0'*4+image[8:],b'\x89PNG\r\n\x1a\n'+b'x'*40]:
   with self.assertRaises(ValueError):screenshot(bad)
 def test_false_public_claim_cannot_mask_failed_case(self):
  raw,capture=stage();public=validate_stage(json.dumps(raw).encode(),capture,'source','ui');public['cases']['schema3']=False
  with self.assertRaises(ValueError):validate_public(public,'source','ui')
 def test_actual_owned_stage_output_is_exclusive_and_public(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory).resolve();(root/'.owner').write_text('12345678-1234-1234-1234-123456789abc')
   raw,capture=stage();(root/'settings-source-ui.json').write_text(json.dumps(raw));(root/'settings-capture-source-ui.json').write_text(json.dumps(capture))
   self.assertTrue(stage_files(root,'source','ui'))
   result=json.loads((root/'settings-public-source-ui.json').read_bytes());self.assertTrue(result['passed']);self.assertNotIn('stdout',result)
   with self.assertRaises(FileExistsError):stage_files(root,'source','ui')
 def test_full_positive_aggregate_and_exclusive_publisher(self):
  from test_validate_persistence import fixture as key_fixture,run as key_run
  report={'version':1,'scope':'HOSTED_SETTINGS_SCHEMA3','excludedVaultContext':'P106_UNMET_NOT_RERUN','bootstrap':{},'modes':{},'screenshots':{},'runtimeCopyVerified':True,'directoryCleanup':True,'failure':None}
  for mode in ('source','package'):
   key_stages=[]
   for name in ('provision','orderly-auth','abrupt-auth','final-auth'):
    item=key_fixture(name);item['mode']=mode;key_stages.append(key_run(item)[0])
   report['bootstrap'][mode]={'mode':mode,'stages':key_stages,'passed':True};report['modes'][mode]={}
   for name in STAGES:
    raw,capture=stage(mode,name);report['modes'][mode][name]=validate_stage(json.dumps(raw).encode(),capture,mode,name)
   for theme,n in [('light',0),('dark',1)]:report['screenshots'][f'{mode}-{theme}']=screenshot(png(n))
  self.assertTrue(validate_report(json.dumps(report).encode())['passed'])
  report_v2=copy.deepcopy(report);report_v2['version']=2;report_v2['scope']=SCOPES[2]
  for mode in ('source','package'):
   for name in STAGES:
    raw,capture=stage(mode,name,2);report_v2['modes'][mode][name]=validate_stage(json.dumps(raw).encode(),capture,mode,name)
  self.assertTrue(validate_report(json.dumps(report_v2).encode())['passed'])
  from validate_settings import RECOVERY_STAGES,recovery_cases,recovery_stdout,validate_recovery
  report_v3=copy.deepcopy(report_v2);report_v3.update(version=3,scope=SCOPES[3],recovery={})
  for mode in ('source','package'):
   report_v3['recovery'][mode]={}
   for name in RECOVERY_STAGES:
    raw={'version':1,'mode':mode,'stage':name,'versions':VERSIONS,'cases':{key:True for key in recovery_cases(name)}}
    report_v3['recovery'][mode][name]=validate_recovery(json.dumps(raw).encode(),{'process':process(),'stdout':recovery_stdout(name),'stderr':''},mode,name)
  self.assertTrue(validate_report(json.dumps(report_v3).encode())['passed'])
  bad=copy.deepcopy(report_v3);del bad['recovery']['package']['previous-confirm']
  with self.assertRaises(ValueError):validate_report(json.dumps(bad).encode())
  bad=copy.deepcopy(report_v3);bad['recovery']['source']['current-confirm']['cases']['oldFilesUnchanged']=False
  with self.assertRaises(ValueError):validate_report(json.dumps(bad).encode())

  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory).resolve();(root/'unvalidated.json').write_text(json.dumps(report_v2))
   for mode in ('source','package'):
    for theme,n in [('light',0),('dark',1)]:(root/f'{mode}-{theme}.png').write_bytes(png(n))
   self.assertEqual(publish(root),(True,True));self.assertEqual(json.loads((root/'validated.json').read_bytes())['version'],2)
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory).resolve();(root/'unvalidated.json').write_text(json.dumps(report))
   for mode in ('source','package'):
    for theme,n in [('light',0),('dark',1)]:(root/f'{mode}-{theme}.png').write_bytes(png(n))
   self.assertEqual(publish(root),(True,True));self.assertTrue(json.loads((root/'validated.json').read_bytes())['passed'])
   with self.assertRaises(FileExistsError):publish(root)
 def test_supervisor_exact_package_dependency_and_private_output_inventory(self):
  script=(Path(__file__).parent/'Invoke-Settings.ps1').read_text()
  for name in ('settings-contract.cjs','settings-native.cjs','settings-main-probe.cjs','settings-store-probe.cjs','persistence-restore-contract.cjs','persistence-store-contract.cjs'):
   self.assertIn("'"+name+"'",script)
  self.assertIn('settings-(expected|vault-before)-(source|package)',script)
  self.assertNotIn('Test-VaultContext',script)
  self.assertNotIn('Invoke-Persistence.ps1',script)
  self.assertIn('[Fonesi.Phase00.NativeProbe]::ReserveDirectory($base)',script)
  self.assertIn('[Fonesi.Phase00.NativeProbe]::ReserveDirectory($path)',script)
  self.assertLess(script.index('Add-Type -Path $helper'),script.index('::ReserveDirectory($base)'))
  self.assertNotIn('[IO.Directory]::CreateDirectory',script)
  self.assertIn("foreach($diagnostic in @('SENDER','SUBFRAME','LATE_REPLY','REVOKED_RESET'))",script)
  self.assertIn("Where-Object {$_ -ceq $marker}",script)
  self.assertIn("$marker='SETTINGS_NEGATIVE_STAGE_'+$diagnostic",script)
 def test_explicit_publish_cli_and_unknown_argument_fail_closed(self):
  from validate_settings import main
  with patch('sys.argv',['validate_settings.py','publish']),patch('validate_settings.publish',return_value=(True,True)) as call,redirect_stdout(io.StringIO()) as output:
   self.assertEqual(main(),0);self.assertEqual(call.call_count,1);self.assertIn('SETTINGS_VALIDATION_WRITTEN',output.getvalue())
  for argv in (['validate_settings.py'],['validate_settings.py','other'],['validate_settings.py','publish','extra']):
   with patch('sys.argv',argv),patch('validate_settings.publish') as call,redirect_stdout(io.StringIO()) as output:
    self.assertEqual(main(),2);call.assert_not_called();self.assertEqual(output.getvalue(),'SETTINGS_VALIDATION_INVALID\n')
 def test_png_ancillary_payload_and_duplicate_or_late_chunks_rejected(self):
  image=png()
  def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
  start=image[:33];tail=image[33:]
  for kind,data in [(b'sRGB',b'PRIVATE'),(b'sRGB',b'\x04'),(b'gAMA',b'PRIVATE'),(b'gAMA',b'\0'*4),(b'cHRM',b'PRIVATE'),(b'pHYs',b'PRIVATE'),(b'pHYs',struct.pack('>IIB',1,1,2))]:
   with self.assertRaises(ValueError):screenshot(start+chunk(kind,data)+tail)
  valid=chunk(b'sRGB',b'\0');self.assertEqual(screenshot(start+valid+tail)['width'],1024)
  for bad in (start+valid+valid+tail,image[:-12]+valid+image[-12:]):
   with self.assertRaises(ValueError):screenshot(bad)
 def test_failed_report_with_unbound_existing_png_never_authorizes_image_marker(self):
  from validate_settings import main
  with patch('sys.argv',['validate_settings.py','publish']),patch('validate_settings.publish',return_value=(False,False)),redirect_stdout(io.StringIO()) as output:
   self.assertEqual(main(),1);self.assertIn('SETTINGS_VALIDATION_WRITTEN',output.getvalue());self.assertNotIn('SETTINGS_SCREENSHOTS_BOUND',output.getvalue())
  report={'version':1,'scope':'HOSTED_SETTINGS_SCHEMA3','excludedVaultContext':'P106_UNMET_NOT_RERUN','bootstrap':{},'modes':{},'screenshots':{},'runtimeCopyVerified':False,'directoryCleanup':False,'failure':'SCREENSHOT_FAILED'}
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory).resolve();(root/'unvalidated.json').write_text(json.dumps(report));(root/'source-light.png').write_bytes(png())
   self.assertEqual(publish(root),(False,False))
if __name__=='__main__':unittest.main()
