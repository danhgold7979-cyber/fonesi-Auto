import copy
import hashlib
import json
from pathlib import Path
import struct
import tempfile
import unittest
import zlib
from validate_fleet_ui import CASES,BOOTSTRAP,BOOTSTRAP_V1,SCOPE,parse,ui,validate,publish,main,stage

def png(color):
 def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1024,768,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+bytes([color])*3072)*768))+chunk(b'IEND',b'')
def sample():
 images={}
 for theme,color in (('light',255),('dark',0)):
  b=png(color);images[theme]={'file':f'fleet-{theme}.png','sha256':hashlib.sha256(b).hexdigest(),'width':1024,'height':768,'bytes':len(b)}
 return {'version':2,'scope':SCOPE,'excludedVaultContext':'P106_UNMET_NOT_RERUN','bootstrap':{'version':2,'cases':dict.fromkeys(BOOTSTRAP,True)},'ui':{'version':1,'scope':SCOPE,'cases':dict.fromkeys(CASES,True),'screenshots':images,'readyCount':1,'closedCount':1},'process':{'status':'SUCCESS','exitCode':0,'cleanupComplete':True,'stdoutTruncated':False,'stderrTruncated':False},'directoryCleanup':True,'failure':None}
class Evidence(unittest.TestCase):
 def test_complete(self):self.assertTrue(validate(sample())['passed'])
 def test_historical_schema3_sample_is_exact_and_not_schema4(self):
  path=Path(__file__).resolve().parents[2]/'docs/evidence/samples/P2-fleet-ui-schema3-pass.json'
  raw=path.read_bytes();v=parse(raw);self.assertEqual(v['version'],1);self.assertTrue(validate(v)['passed']);self.assertEqual(validate(v),v)
  wrong=copy.deepcopy(v);wrong['version']=2
  with self.assertRaises(ValueError):validate(wrong)
 def test_schema4_bootstrap_cannot_omit_or_mislabel_new_facts(self):
  for key in BOOTSTRAP:
   v=sample();del v['bootstrap']['cases'][key]
   with self.assertRaises(ValueError):validate(v)
  for version in (True,0,3):
   v=sample();v['version']=version
   with self.assertRaises(ValueError):validate(v)
  v=sample();v['bootstrap']['cases']['schema3']=v['bootstrap']['cases'].pop('schema4')
  with self.assertRaises(ValueError):validate(v)
 def test_each_false(self):
  for section in ('bootstrap','ui'):
   for key in sample()[section]['cases']:
    v=sample();v[section]['cases'][key]=False;self.assertFalse(validate(v)['passed'])
  for key in ('directoryCleanup',):
   v=sample();v[key]=False;self.assertFalse(validate(v)['passed'])
 def test_schema_unknown_and_duplicates(self):
  with self.assertRaises(ValueError):parse(b'{"version":1,"versi\\u006fn":1}')
  for mutation in (lambda v:v.update(path='private'),lambda v:v['ui']['cases'].update(extra=True),lambda v:v['ui'].update(readyCount=True),lambda v:v['process'].update(exitCode=True)):
   v=sample();mutation(v)
   with self.assertRaises(ValueError):validate(v)
 def test_no_vacuous_failure_pass(self):
  v=sample();v.update(bootstrap=None,ui=None,process=None,directoryCleanup=False,failure='PREPARE_FAILED');self.assertFalse(validate(v)['passed'])
  v['failure']=None
  with self.assertRaises(ValueError):validate(v)
 def test_image_names_hashes_geometry(self):
  for field,value in (('file','../private.png'),('width',800),('bytes',2097153),('sha256','x'*64)):
   v=sample()['ui'];v['screenshots']['light'][field]=value
   with self.assertRaises(ValueError):ui(v)
  v=sample()['ui'];v['screenshots']['dark']['sha256']=v['screenshots']['light']['sha256']
  with self.assertRaises(ValueError):ui(v)
 def test_publisher_actual_images_exclusive(self):
  with tempfile.TemporaryDirectory() as t:
   base=Path(t).resolve();v=sample();(base/'unvalidated.json').write_text(json.dumps(v))
   for theme,color in (('light',255),('dark',0)):(base/f'fleet-{theme}.png').write_bytes(png(color))
   self.assertEqual(publish(base),(True,True));self.assertTrue(json.loads((base/'validated.json').read_text())['passed'])
   with self.assertRaises(FileExistsError):publish(base)
 def test_publisher_changed_or_missing_never_writes(self):
  for changed in (False,True):
   with tempfile.TemporaryDirectory() as t:
    base=Path(t).resolve();(base/'unvalidated.json').write_text(json.dumps(sample()));(base/'fleet-light.png').write_bytes(png(255))
    if changed:(base/'fleet-dark.png').write_bytes(png(123))
    with self.assertRaises((OSError,ValueError)):publish(base)
    self.assertFalse((base/'validated.json').exists())
 def test_owned_stage_public_cleanup_flag_and_publish_handoff(self):
  with tempfile.TemporaryDirectory() as t:
   base=Path(t).resolve()/'.fleet-ui-runtime';base.mkdir();root=base/'run-12345678-1234-4234-8234-123456789abc';root.mkdir()
   (root/'.owner').write_text('12345678-1234-4234-8234-123456789abc')
   v=sample()
   for name,value in (('bootstrap.json',v['bootstrap']),('fleet-ui-result.json',v['ui']),('launcher-capture.json',{'process':v['process'],'stdout':'PERSISTENCE_DESKTOP_CLOSED\r\n','stderr':''})):(root/name).write_text(json.dumps(value,indent=2))
   for theme,color in (('light',255),('dark',0)):(root/f'fleet-{theme}.png').write_bytes(png(color))
   self.assertTrue(stage(root));public=json.loads((root/'public.json').read_text());self.assertFalse(public['passed']);self.assertFalse(public['directoryCleanup'])
   # Model only supervisor's independently established cleanup bit; no native cleanup claim.
   public['directoryCleanup']=True;public.pop('passed');(base/'unvalidated.json').write_text(json.dumps(public));self.assertEqual(publish(base),(True,True))
 def test_cli_only_explicit_publish(self):
  self.assertEqual(main([]),2);self.assertEqual(main(['unknown']),2)
if __name__=='__main__':unittest.main()
