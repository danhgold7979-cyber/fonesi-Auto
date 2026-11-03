import copy,hashlib,json,tempfile,unittest
from pathlib import Path
from test_validate_fleet_ui import png
from validate_recipient_setup import FIRST_CASES,REOPEN_CASES,BOOTSTRAP,SCOPE,MODES,parse,ui,validate,publish,stage,main

def sample():
 images={}
 for theme,color in (('light',255),('dark',0)):
  b=png(color);images[theme]={'file':f'setup-{theme}.png','sha256':hashlib.sha256(b).hexdigest(),'width':1024,'height':768,'bytes':len(b)}
 return {'version':1,'scope':SCOPE,'excludedVaultContext':'P106_UNMET_NOT_RERUN','bootstrap':{m:{'version':1,'cases':dict.fromkeys(BOOTSTRAP,True)} for m in MODES},'modes':{m:{'version':1,'scope':SCOPE,'mode':m,'cases':dict.fromkeys(FIRST_CASES if m=='FIRST' else REOPEN_CASES,True),'screenshots':images if m=='FIRST' else {},'readyCount':1,'closedCount':1} for m in MODES},'processes':{m:{'status':'SUCCESS','exitCode':0,'cleanupComplete':True,'stdoutTruncated':False,'stderrTruncated':False} for m in MODES},'originalArchiveUnchanged':True,'originalSourceUnchanged':True,'directoryCleanup':True,'failure':None}
class Evidence(unittest.TestCase):
 def test_complete(self):self.assertTrue(validate(sample())['passed'])
 def test_each_false(self):
  for section in ('bootstrap','modes'):
   for mode in MODES:
    for key in sample()[section][mode]['cases']:
     v=sample();v[section][mode]['cases'][key]=False;self.assertFalse(validate(v)['passed'])
  for key in ('directoryCleanup','originalArchiveUnchanged','originalSourceUnchanged'):
   v=sample();v[key]=False;self.assertFalse(validate(v)['passed'])
 def test_duplicate_unknown_and_types(self):
  with self.assertRaises(ValueError):parse(b'{"version":1,"versi\\u006fn":1}')
  for mutation in (lambda v:v.update(path='private'),lambda v:v['modes']['FIRST']['cases'].update(extra=True),lambda v:v['modes']['FIRST'].update(readyCount=True),lambda v:v['processes']['REOPEN'].update(exitCode=True),lambda v:v['modes']['REOPEN'].update(mode='FIRST')):
   v=sample();mutation(v)
   with self.assertRaises(ValueError):validate(v)
 def test_missing_second_and_vacuous_failure(self):
  for group in ('modes','bootstrap','processes'):
   v=sample();del v[group]['REOPEN']
   with self.assertRaises(ValueError):validate(v)
  v=sample();v.update(bootstrap={},modes={},processes={},directoryCleanup=False,failure='PREPARE_FAILED');self.assertFalse(validate(v)['passed'])
 def test_images_and_reopen_shape(self):
  for field,value in (('file','../private.png'),('width',800),('bytes',2097153),('sha256','x'*64)):
   v=sample()['modes']['FIRST'];v['screenshots']['light'][field]=value
   with self.assertRaises(ValueError):ui(v)
  v=sample()['modes']['REOPEN'];v['screenshots']={'light':{}}
  with self.assertRaises(ValueError):ui(v)
 def test_actual_publish_exclusive(self):
  with tempfile.TemporaryDirectory() as t:
   base=Path(t).resolve();(base/'unvalidated.json').write_text(json.dumps(sample()))
   for theme,color in (('light',255),('dark',0)):(base/f'setup-{theme}.png').write_bytes(png(color))
   self.assertEqual(publish(base),(True,True))
   with self.assertRaises(FileExistsError):publish(base)
 def test_changed_image_no_publication(self):
  with tempfile.TemporaryDirectory() as t:
   base=Path(t).resolve();(base/'unvalidated.json').write_text(json.dumps(sample()));(base/'setup-light.png').write_bytes(png(255));(base/'setup-dark.png').write_bytes(png(123))
   with self.assertRaises(ValueError):publish(base)
   self.assertFalse((base/'validated.json').exists())
 def test_actual_two_capture_stage_handoff(self):
  for leading in ('','\n'):
   with tempfile.TemporaryDirectory() as t:
    base=Path(t).resolve()/'.recipient-setup-runtime';base.mkdir();root=base/'run-12345678-1234-4234-8234-123456789abc';root.mkdir();(root/'.owner').write_text('12345678-1234-4234-8234-123456789abc');v=sample()
    for mode in MODES:
     suffix=mode.lower()
     for name,value in ((f'bootstrap-{suffix}.json',v['bootstrap'][mode]),(f'setup-{suffix}-result.json',v['modes'][mode]),(f'launcher-{suffix}-capture.json',{'process':v['processes'][mode],'stdout':leading+'PERSISTENCE_DESKTOP_CLOSED\r\n','stderr':''})):(root/name).write_text(json.dumps(value,indent=2))
    (root/'integrity.json').write_text(json.dumps({'version':1,'originalArchiveUnchanged':True,'originalSourceUnchanged':True}))
    for theme,color in (('light',255),('dark',0)):(root/f'setup-{theme}.png').write_bytes(png(color))
    self.assertTrue(stage(root));public=json.loads((root/'public.json').read_text());self.assertFalse(public['passed']);public['directoryCleanup']=True;public.pop('passed');(base/'unvalidated.json').write_text(json.dumps(public));self.assertEqual(publish(base),(True,True))
 def test_cli(self):self.assertEqual(main([]),2);self.assertEqual(main(['unknown']),2)
if __name__=='__main__':unittest.main()
