import copy
import hashlib
import json
import struct
import tempfile
import unittest
import zlib
from pathlib import Path
from validate_ui import *
import test_validate_persistence as persistence_tests

def process():return {'status':'SUCCESS','exitCode':0,'cleanupComplete':True,'stdoutTruncated':False,'stderrTruncated':False}
def stage(mode):
 raw={'version':1,'mode':mode,'versions':VERSIONS,'cases':{key:True for key in cases(mode)},'pages':{f'{page}-{theme}':True for theme in THEMES for page in PAGES},'images':[{'name':name,'width':w,'height':h,'bytes':100,'sha256':hashlib.sha256(name.encode()).hexdigest()} for name,w,h in specs(mode)]}
 return raw,{'process':process(),'stdout':'\n'.join(expected_stdout(mode))+'\n','stderr':''}
def report():
 v={'version':1,'scope':'HOSTED_V9_UI_PARITY','excludedVaultContext':'P106_UNMET_NOT_RERUN','bootstrap':{},'modes':{},'screenshots':{},'runtimeCopyVerified':True,'directoryCleanup':True,'failure':None}
 for mode in ('source','package'):v['bootstrap'][mode]=persistence_tests.PersistencePublicReportTests().public_mode(mode)
 for mode in MODES:
  raw,cap=stage(mode);v['modes'][mode]=validate_stage(json.dumps(raw).encode(),cap,mode)
  for item in raw['images']:v['screenshots'][item['name']]=item
 return v
def png(width,height,value=0,extra=b''):
 def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+extra+chunk(b'IDAT',zlib.compress((b'\0'+bytes([value])*width*3)*height))+chunk(b'IEND',b'')
class UiValidationTests(unittest.TestCase):
 def test_exact_three_modes_all_cases_pages_and_process_derive_pass(self):
  for mode in MODES:
   raw,cap=stage(mode);self.assertTrue(validate_stage(json.dumps(raw).encode(),cap,mode)['passed'])
   for group in ('cases','pages'):
    for key in raw[group]:
     bad=copy.deepcopy(raw);bad[group][key]=False
     self.assertFalse(validate_stage(json.dumps(bad).encode(),cap,mode)['passed'])
   bad=copy.deepcopy(cap);bad['process']['cleanupComplete']=False
   self.assertFalse(validate_stage(json.dumps(raw).encode(),bad,mode)['passed'])
 def test_duplicates_unknown_fields_framing_and_false_mask_rejected(self):
  raw,cap=stage('source')
  for data in (json.dumps(raw).replace('"realMain": true','"realMain":false,"realMain":true').encode(),json.dumps({**raw,'private':'canary'}).encode(),json.dumps({**raw,'version':True}).encode()):
   with self.assertRaises(ValueError):validate_stage(data,cap,'source')
  for stdout in ('PRIVATE\n'+cap['stdout'],'\n\n'+cap['stdout'],cap['stdout']+'\n'):
   with self.assertRaises(ValueError):validate_stage(json.dumps(raw).encode(),{**cap,'stdout':stdout},'source')
  public=validate_stage(json.dumps(raw).encode(),cap,'source');public['pages']['setup-light']=False
  with self.assertRaises(ValueError):validate_public(public,'source')
 def test_report_requires32_exact_bound_images_and_global_budget(self):
  value=report();self.assertTrue(validate_report(json.dumps(value).encode())['passed']);self.assertEqual(len(value['screenshots']),32)
  for mutation in ('missing','unbound','total','scope'):
   bad=copy.deepcopy(value)
   if mutation=='missing':bad['screenshots'].pop(next(iter(bad['screenshots'])))
   if mutation=='unbound':next(iter(bad['screenshots'].values()))['sha256']='f'*64
   if mutation=='total':
    for mode in MODES:
     for row in bad['modes'][mode]['images']:row['bytes']=4*1024*1024
    for row in bad['screenshots'].values():row['bytes']=4*1024*1024
   if mutation=='scope':bad['scope']='OTHER'
   with self.assertRaises(ValueError):validate_report(json.dumps(bad).encode())
 def test_failed_partial_report_never_authorizes_image_set(self):
  value=report();value['failure']='NATIVE_STAGE_FAILED';value['modes']={};value['screenshots']={}
  self.assertFalse(validate_report(json.dumps(value).encode())['passed'])
 def test_png_exact_geometry_crc_private_chunks_and_bombs_rejected(self):
  raw=png(1440,900);self.assertEqual(screenshot(raw,1440,900)['width'],1440)
  with self.assertRaises(ValueError):screenshot(raw,880,768)
  def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
  for extra in (chunk(b'tEXt',b'PRIVATE'),chunk(b'sRGB',b'PRIVATE'),chunk(b'gAMA',b'\0'*4)):
   with self.assertRaises(ValueError):screenshot(png(1440,900,extra=extra),1440,900)
  with self.assertRaises(ValueError):screenshot(raw[:-1]+b'x',1440,900)
 def test_real_exclusive_stage_file_drops_streams(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory).resolve();(root/'.owner').write_text('12345678-1234-1234-1234-123456789abc')
   raw,cap=stage('source');cap['stderr']='synthetic private capture'
   (root/'ui-source.json').write_text(json.dumps(raw));(root/'ui-capture-source.json').write_text(json.dumps(cap))
   self.assertTrue(stage_files(root,'source'))
   self.assertNotIn('synthetic private capture',(root/'ui-public-source.json').read_text())
   with self.assertRaises(FileExistsError):stage_files(root,'source')
 def test_ps_contains_exact_dependency_closure_and_no_foreign_context(self):
  source=(Path(__file__).parent/'Invoke-Ui.ps1').read_text()
  for name in ('ui-main-probe.cjs','ui-reference-probe.cjs','ui-contract.cjs','settings-native.cjs','settings-contract.cjs','persistence-restore-contract.cjs'):
   self.assertIn("'"+name+"'",source)
  for forbidden in ('Test-VaultContext','VaultDpapiContext','Invoke-Persistence.ps1'):
   self.assertNotIn(forbidden,source)
  self.assertIn('ReserveDirectory($base)',source);self.assertIn('ReserveDirectory($path)',source)
  markers=re.findall(r"'(UI_(?:REFERENCE_)?STAGE_[A-Z]+)'",source)
  self.assertEqual(len(markers),12);self.assertEqual(len(set(markers)),12)
  self.assertIn('$_ -ceq $marker',source);self.assertNotIn('Write-Output $Probe.Stderr',source)
  self.assertIn("@('OVERVIEW','ACCOUNTS','TRACKING','SETUP','CALENDAR','WORKFLOWS')",source)
  self.assertIn("@('LIGHT','DARK')",source)
  self.assertIn("@('THEME','NAVIGATE','STRUCTURE','EMPTY','GEOMETRY','CAPTURE')",source)
  self.assertIn("$marker='UI_PAGE_'+$page+'_'+$theme+'_'+$step",source)
  self.assertIn('Write-Output $marker;return',source)
 def test_actual32_image_publish_is_exclusive_and_changed_or_missing_files_never_authorize(self):
  import io
  from contextlib import redirect_stdout
  from unittest.mock import patch
  import validate_ui as validator
  with tempfile.TemporaryDirectory() as directory:
   base=Path(directory).resolve()/'.ui-runtime';base.mkdir();root=base/'owned';root.mkdir()
   (root/'.owner').write_text('12345678-1234-1234-1234-123456789abc')
   value=report();value['screenshots']={}
   for mode in MODES:
    raw,cap=stage(mode)
    for image,spec in zip(raw['images'],specs(mode)):
     name,w,h=spec;data=png(w,h,1 if '-dark' in name else 0)
     image.update({'name':name,**screenshot(data,w,h)})
     (root/name).write_bytes(data)
    (root/f'ui-{mode}.json').write_text(json.dumps(raw));(root/f'ui-capture-{mode}.json').write_text(json.dumps(cap));self.assertTrue(stage_files(root,mode))
    value['modes'][mode]=parse((root/f'ui-public-{mode}.json').read_bytes())
   for mode in MODES:
    screenshot_files(root,mode)
    for image in value['modes'][mode]['images']:value['screenshots'][image['name']]=image
   (base/'unvalidated.json').write_text(json.dumps(value))
   first=base/specs('source')[0][0];saved=first.read_bytes()
   first.unlink()
   with self.assertRaises(OSError):publish(base)
   self.assertFalse((base/'validated.json').exists())
   first.write_bytes(png(1440,900,2))
   with self.assertRaises(ValueError):publish(base)
   self.assertFalse((base/'validated.json').exists())
   first.write_bytes(saved)
   original=validator.publish
   def run_cli():
    output=io.StringIO()
    with patch('sys.argv',['validate_ui.py','publish']),patch.object(validator,'publish',lambda _base:original(base)),redirect_stdout(output):code=validator.main()
    return code,output.getvalue()
   code,output=run_cli();self.assertEqual(code,0);self.assertIn('UI_VALIDATION_WRITTEN',output);self.assertIn('UI_SCREENSHOTS_BOUND',output)
   code,output=run_cli();self.assertEqual(code,2);self.assertNotIn('WRITTEN',output);self.assertNotIn('BOUND',output)
if __name__=='__main__':unittest.main()
