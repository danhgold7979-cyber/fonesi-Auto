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
from validate_settings import CASES, STAGES, VERSIONS, validate_stage, validate_public, validate_report, screenshot

def process(crash=False):
 return {'status':'NONZERO_EXIT' if crash else 'SUCCESS','exitCode':73 if crash else 0,'cleanupComplete':True,'stdoutTruncated':False,'stderrTruncated':False}
def stage(mode='source',name='ui'):
 raw={'version':1,'mode':mode,'stage':name,'versions':VERSIONS,'cases':{key:True for key in CASES[name]}}
 stdout='SETTINGS_ARMED\n' if name.endswith('-crash') else ('BOOTSTRAP_READY\nBOOTSTRAP_CLOSED\nSETTINGS_CLOSED\n' if name in ('ui','reopen') else 'SETTINGS_CLOSED\n')
 return raw,{'process':process(name.endswith('-crash')),'stdout':stdout,'stderr':''}
def png(value=0):
 def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
 pixels=(b'\0'+bytes([value])*1024*3)*768
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1024,768,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(pixels))+chunk(b'IEND',b'')
class SettingsValidationTests(unittest.TestCase):
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
