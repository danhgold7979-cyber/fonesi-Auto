"""Strict fixed settings evidence; no private streams/paths or identity substitution."""
import hashlib
import json
import re
import struct
import zlib
from pathlib import Path
from validate_runtime import exact_record, unique_pairs, reject, validate_process, VERSIONS
from validate_persistence import _admit_root, _read_owned, _write_new, validate_public_mode
STAGES = ('ui','reopen','before-crash','before-reopen','after-crash','after-reopen')
COMMON = ('ownedRoot','originalKeyAuthenticated','schema3','migration2BackupAuthenticated')
CASES = {
 'ui': COMMON+('realMainReady','realPreloadRead','themeCommitted','dimensionsCommitted','resetCancelled','resetConfirmed','previousRestored','staleConflict','malformedDenied','lightScreenshot','darkScreenshot','windowObserved','vaultUnchanged','orderlyQuit'),
 'reopen': COMMON+('realMainReady','preferencesRetained','nativeWindowRetained','vaultUnchanged','orderlyQuit'),
 'before-crash': COMMON+('primaryUnchanged','commitBoundaryReached'),
 'after-crash': COMMON+('primaryUnchanged','commitBoundaryReached'),
 'before-reopen': COMMON+('primaryUnchanged','integrity','wholeOldState','previousState','orderlyQuit'),
 'after-reopen': COMMON+('primaryUnchanged','integrity','wholeNewState','previousState','orderlyQuit'),
}
CASES_V1 = CASES
CASES_V2 = {**CASES_V1, 'ui': CASES_V1['ui'][:-1]+('foreignSenderDenied','childFrameDenied','heldConfirmationRevoked','delayedReplyDiscarded', 'orderlyQuit')}
SCOPES = {1:'HOSTED_SETTINGS_SCHEMA3',2:'HOSTED_SETTINGS_SCHEMA3_NATIVE_NEGATIVES',3:'HOSTED_SETTINGS_SCHEMA3_RECOVERY'}
RECOVERY_STAGES=('recovery-setup','current-cancel','current-confirm','previous-cancel','previous-confirm')
RECOVERY_CASES={
 'recovery-setup':('ownedRoot','originalKeyAuthenticated','schema3BackupAuthenticated','bothSettingsRows','orderlyQuit'),
 'cancel':('ownedRoot','corruptRowConfirmed','activeDatabaseNeverOpened','noNormalWindow','nativeCancelled','oldFilesUnchanged','noRestoreCreated','orderlyQuit'),
 'confirm':('ownedRoot','corruptRowConfirmed','activeDatabaseNeverOpened','noNormalWindow','nativeConfirmed','oldFilesUnchanged','restoredNewRoot','restoredQuarantined','restoredSettingsValid','orderlyQuit')}
def recovery_cases(stage):
 if stage not in RECOVERY_STAGES:reject()
 return RECOVERY_CASES[stage if stage=='recovery-setup' else stage.rsplit('-',1)[1]]
def recovery_stdout(stage):
 recovery_cases(stage)
 return 'SETTINGS_RECOVERY_CLOSED\n' if stage=='recovery-setup' else 'PERSISTENCE_MAINTENANCE_'+('CANCELLED' if stage.endswith('-cancel') else 'COMPLETED')+'\nBOOTSTRAP_CLOSED\nSETTINGS_RECOVERY_CLOSED\n'
def validate_recovery(raw,capture,mode,stage):
 if mode not in ('source','package'):reject()
 value=parse(raw);exact_record(value,('version','mode','stage','versions','cases'))
 if type(value['version']) is not int or value['version']!=1 or value['mode']!=mode or value['stage']!=stage:reject()
 exact_record(value['versions'],VERSIONS)
 if value['versions']!=VERSIONS:reject()
 exact_record(value['cases'],recovery_cases(stage))
 if any(type(x) is not bool for x in value['cases'].values()):reject()
 exact_record(capture,('process','stdout','stderr'));normal=validate_process(capture['process'])
 for key in ('stdout','stderr'):
  if type(capture[key]) is not str or len(capture[key].encode('utf-16-le'))//2>32768:reject()
 lines=capture['stdout'].replace('\r\n','\n').split('\n')
 if lines and lines[-1]=='':lines.pop()
 if lines and lines[0]=='':lines=lines[1:]
 if lines!=recovery_stdout(stage).splitlines():reject()
 if any(marker in capture['stderr'] for marker in ('RECOVERY_FAILED','RECOVERY_DEADLINE','BOOTSTRAP_FAILED','BOOTSTRAP_CLEANUP_FAILED','PERSISTENCE_SHUTDOWN_FAILED')):reject()
 return {**value,'process':dict(capture['process']),'passed':normal and all(value['cases'].values())}
def validate_recovery_public(value,mode,stage):
 exact_record(value,('version','mode','stage','versions','cases','process','passed'))
 if type(value['passed']) is not bool:reject()
 raw={key:value[key] for key in ('version','mode','stage','versions','cases')}
 rebuilt=validate_recovery(json.dumps(raw).encode(),{'process':value['process'],'stdout':recovery_stdout(stage),'stderr':''},mode,stage)
 if value['passed'] and not rebuilt['passed']:reject()
 return value['passed']
FAILURES=('PREPARE_FAILED','PACKAGE_FAILED','CONTROL_FAILED','PREFLIGHT_FAILED','NATIVE_STAGE_FAILED','STAGE_VALIDATION_FAILED','SEQUENCE_VALIDATION_FAILED','SCREENSHOT_FAILED','CLEANUP_FAILED')
def parse(raw):
 if type(raw) is not bytes or not 0<len(raw)<=65536:reject()
 return json.loads(raw.decode('utf8'),object_pairs_hook=unique_pairs,parse_constant=lambda _:reject())
def validate_stage(raw,capture,mode,stage):
 if mode not in ('source','package') or stage not in STAGES:reject()
 value=parse(raw);exact_record(value,('version','mode','stage','versions','cases'))
 if type(value['version']) is not int or value['version'] not in (1,2) or value['mode']!=mode or value['stage']!=stage:reject()
 exact_record(value['versions'],VERSIONS)
 if value['versions']!=VERSIONS:reject()
 exact_record(value['cases'],(CASES_V1 if value['version']==1 else CASES_V2)[stage])
 if any(type(v) is not bool for v in value['cases'].values()):reject()
 exact_record(capture,('process','stdout','stderr'))
 normal=validate_process(capture['process'])
 for name in ('stdout','stderr'):
  if type(capture[name]) is not str or len(capture[name].encode('utf-16-le'))//2>32768:reject()
 lines=capture['stdout'].replace('\r\n','\n').split('\n')
 if lines and lines[-1]=='':lines.pop()
 if lines and lines[0]=='':lines=lines[1:]
 crash=stage.endswith('-crash')
 expected=['SETTINGS_ARMED'] if crash else (['BOOTSTRAP_READY','BOOTSTRAP_CLOSED','SETTINGS_CLOSED'] if stage in ('ui','reopen') else ['SETTINGS_CLOSED'])
 if lines!=expected:reject()
 if any(marker in capture['stderr'] for marker in ('SETTINGS_FAILED','SETTINGS_DEADLINE','BOOTSTRAP_FAILED','BOOTSTRAP_CLEANUP_FAILED','PERSISTENCE_SHUTDOWN_FAILED')):reject()
 p=capture['process']
 process_ok=(p['status']=='NONZERO_EXIT' and type(p['exitCode']) is int and p['exitCode']!=0 and p['cleanupComplete'] and not p['stdoutTruncated'] and not p['stderrTruncated']) if crash else normal
 return {**value,'process':dict(p),'passed':process_ok and all(value['cases'].values())}
def validate_public(value,mode,stage):
 exact_record(value,('version','mode','stage','versions','cases','process','passed'))
 if type(value['passed']) is not bool:reject()
 raw={key:value[key] for key in ('version','mode','stage','versions','cases')}
 stdout='SETTINGS_ARMED\n' if stage.endswith('-crash') else ('BOOTSTRAP_READY\nBOOTSTRAP_CLOSED\nSETTINGS_CLOSED\n' if stage in ('ui','reopen') else 'SETTINGS_CLOSED\n')
 rebuilt=validate_stage(json.dumps(raw).encode(),{'process':value['process'],'stdout':stdout,'stderr':''},mode,stage)
 if value['passed'] and not rebuilt['passed']:reject()
 return value['passed']
def screenshot(raw):
 if type(raw) is not bytes or not 45<=len(raw)<=2*1024*1024 or raw[:8]!=b'\x89PNG\r\n\x1a\n':reject()
 at=8;chunks=[];compressed=bytearray();width=height=channels=None
 while at<len(raw):
  if len(chunks)>=256 or at+12>len(raw):reject()
  size=struct.unpack('>I',raw[at:at+4])[0];kind=raw[at+4:at+8];end=at+12+size
  if end>len(raw) or kind not in (b'IHDR',b'IDAT',b'IEND',b'sRGB',b'gAMA',b'cHRM',b'pHYs'):reject()
  data=raw[at+8:at+8+size]
  if zlib.crc32(kind+data)&0xffffffff!=struct.unpack('>I',raw[end-4:end])[0]:reject()
  if not chunks and kind!=b'IHDR':reject()
  if kind==b'IHDR':
   if chunks or size!=13:reject()
   width,height,depth,color,compression,filter_method,interlace=struct.unpack('>IIBBBBB',data)
   if (width,height)!=(1024,768) or depth!=8 or color not in (2,6) or (compression,filter_method,interlace)!=(0,0,0):reject()
   channels=3 if color==2 else 4
  elif kind==b'IDAT':
   if b'IDAT' in chunks and chunks[-1]!=b'IDAT':reject()
   compressed.extend(data)
  elif kind in (b'sRGB',b'gAMA',b'cHRM',b'pHYs'):
   if kind in chunks or b'IDAT' in chunks:reject()
   if kind==b'sRGB' and (size!=1 or data[0]>3):reject()
   if kind==b'gAMA' and (size!=4 or not 1<=struct.unpack('>I',data)[0]<=1000000):reject()
   if kind==b'cHRM':
    if size!=32:reject()
    values=struct.unpack('>8I',data)
    if any(x>100000 for x in values) or any(values[n]+values[n+1]>100000 for n in (0,2,4,6)):reject()
   if kind==b'pHYs' and (size!=9 or data[8]>1 or not all(1<=x<=1000000 for x in struct.unpack('>II',data[:8]))):reject()
  elif kind==b'IEND':
   if size or end!=len(raw):reject()
  chunks.append(kind);at=end
 if not chunks or chunks[-1]!=b'IEND' or not compressed or channels is None:reject()
 limit=(1024*channels+1)*768
 decoder=zlib.decompressobj()
 try:pixels=decoder.decompress(bytes(compressed),limit+1)
 except zlib.error:reject()
 if len(pixels)!=limit or not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:reject()
 if any(pixels[row*(1024*channels+1)]>4 for row in range(768)):reject()
 return {'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'width':width,'height':height}
def validate_report(raw):
 v=parse(raw)
 if type(v) is not dict:reject()
 keys=('version','scope','excludedVaultContext','bootstrap','modes','screenshots','runtimeCopyVerified','directoryCleanup','failure')
 exact_record(v,keys+(('recovery',) if type(v.get('version')) is int and v['version']==3 else ()))
 if type(v['version']) is not int or v['version'] not in SCOPES or v['scope']!=SCOPES[v['version']] or v['excludedVaultContext']!='P106_UNMET_NOT_RERUN':reject()
 if any(type(v[k]) is not bool for k in ('runtimeCopyVerified','directoryCleanup')):reject()
 if v['failure'] is not None and (type(v['failure']) is not str or v['failure'] not in FAILURES):reject()
 passed=v['failure'] is None and v['runtimeCopyVerified'] and v['directoryCleanup']
 for key in ('bootstrap','modes'):
  if type(v[key]) is not dict or not set(v[key]).issubset({'source','package'}):reject()
  if v['failure'] is None and set(v[key])!={'source','package'}:reject()
 for mode,item in v['bootstrap'].items():passed=validate_public_mode(item,mode) and passed
 for mode,stages in v['modes'].items():
  if type(stages) is not dict or not set(stages).issubset(STAGES):reject()
  if v['failure'] is None and set(stages)!=set(STAGES):reject()
  for stage,item in stages.items():
   if type(item) is not dict or type(item.get('version')) is not int or item['version']!=(1 if v['version']==1 else 2):reject()
   passed=validate_public(item,mode,stage) and passed
 if v['version']==3:
  if type(v['recovery']) is not dict or not set(v['recovery']).issubset({'source','package'}):reject()
  if v['failure'] is None and set(v['recovery'])!={'source','package'}:reject()
  for mode,stages in v['recovery'].items():
   if type(stages) is not dict or not set(stages).issubset(RECOVERY_STAGES):reject()
   if v['failure'] is None and set(stages)!=set(RECOVERY_STAGES):reject()
   for stage,item in stages.items():passed=validate_recovery_public(item,mode,stage) and passed
 names={f'{mode}-{theme}' for mode in ('source','package') for theme in ('light','dark')}
 if type(v['screenshots']) is not dict or not set(v['screenshots']).issubset(names) or any(type(item) is not dict for item in v['screenshots'].values()):reject()
 if v['failure'] is None and set(v['screenshots'])!=names:reject()
 for mode in ('source','package'):
  if all(f'{mode}-{theme}' in v['screenshots'] for theme in ('light','dark')) and v['screenshots'][f'{mode}-light'].get('sha256')==v['screenshots'][f'{mode}-dark'].get('sha256'):reject()
 for item in v['screenshots'].values():
  exact_record(item,('bytes','sha256','width','height'))
  if type(item['bytes']) is not int or not 45<=item['bytes']<=2*1024*1024 or type(item['sha256']) is not str or re.fullmatch('[0-9a-f]{64}',item['sha256']) is None or type(item['width']) is not int or type(item['height']) is not int or (item['width'],item['height'])!=(1024,768):reject()
 return {**v,'passed':passed}
def read_image(path):
 import stat
 if path.resolve()!=path or not stat.S_ISREG(path.lstat().st_mode) or path.lstat().st_size>2*1024*1024:reject()
 with path.open('rb') as handle:raw=handle.read(2*1024*1024+1)
 return raw,screenshot(raw)
def stage_files(root,mode,stage):
 token=_admit_root(root)
 value=validate_stage(_read_owned(root,f'settings-{mode}-{stage}.json'),parse(_read_owned(root,f'settings-capture-{mode}-{stage}.json')),mode,stage)
 if _admit_root(root)!=token:reject()
 _write_new(root,f'settings-public-{mode}-{stage}.json',value)
 return value['passed']
def recovery_files(root,mode,stage):
 token=_admit_root(root)
 value=validate_recovery(_read_owned(root,f'settings-recovery-{mode}-{stage}.json'),parse(_read_owned(root,f'settings-recovery-capture-{mode}-{stage}.json')),mode,stage)
 if _admit_root(root)!=token:reject()
 _write_new(root,f'settings-recovery-public-{mode}-{stage}.json',value)
 return value['passed']
def screenshot_files(root,mode):
 import os
 if mode not in ('source','package'):reject()
 token=_admit_root(root);base=root.parent
 if not base.is_absolute() or base.resolve()!=base or base.name!='.settings-runtime':reject()
 results={}
 for theme in ('light','dark'):
  raw,metadata=read_image(root/f'settings-{mode}-{theme}.png')
  if _admit_root(root)!=token:reject()
  with (base/f'{mode}-{theme}.png').open('xb') as handle:
   handle.write(raw);handle.flush();os.fsync(handle.fileno())
  results[theme]=metadata
 if results['light']['sha256']==results['dark']['sha256']:reject()
 _write_new(root,f'settings-screenshots-{mode}.json',results)
def publish(base):
 if not base.is_absolute() or base.resolve()!=base or not base.is_dir():reject()
 value=validate_report(_read_owned(base,'unvalidated.json'))
 for name,metadata in value['screenshots'].items():
  _,observed=read_image(base/f'{name}.png')
  if observed!=metadata:reject()
 _write_new(base,'validated.json',value)
 return value['passed'],set(value['screenshots'])=={'source-light','source-dark','package-light','package-dark'}
def main():
 import sys
 try:
  if len(sys.argv)==5 and sys.argv[1]=='recovery':
   passed=recovery_files(Path(sys.argv[2]),sys.argv[3],sys.argv[4]);print('SETTINGS_RECOVERY_VALIDATION_PASS' if passed else 'SETTINGS_RECOVERY_VALIDATION_FAIL');return 0 if passed else 1
  if len(sys.argv)==5 and sys.argv[1]=='stage':
   passed=stage_files(Path(sys.argv[2]),sys.argv[3],sys.argv[4]);print('SETTINGS_VALIDATION_PASS' if passed else 'SETTINGS_VALIDATION_FAIL');return 0 if passed else 1
  if len(sys.argv)==4 and sys.argv[1]=='screenshots':
   screenshot_files(Path(sys.argv[2]),sys.argv[3]);print('SETTINGS_SCREENSHOTS_VERIFIED');return 0
  if len(sys.argv)!=2 or sys.argv[1]!='publish':reject()
  passed,images_bound=publish(Path(__file__).resolve().parents[1]/'.settings-runtime')
 except (OSError,ValueError,UnicodeError,RecursionError,TypeError):
  print('SETTINGS_VALIDATION_INVALID');return 2
 print('SETTINGS_VALIDATION_WRITTEN')
 if images_bound:print('SETTINGS_SCREENSHOTS_BOUND')
 print('SETTINGS_VALIDATION_PASS' if passed else 'SETTINGS_VALIDATION_FAIL');return 0 if passed else 1
if __name__=='__main__':raise SystemExit(main())
