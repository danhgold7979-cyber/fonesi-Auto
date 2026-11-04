"""Strict SOURCE-only fleet smoke; fixed JSON and two checked production-empty UI PNGs in an owned test run only."""
import hashlib
import json
import os
import re
import stat
from pathlib import Path
from validate_runtime import exact_record, unique_pairs, reject, validate_process
from validate_settings import screenshot
from validate_persistence import _admit_root, _read_owned, _write_new
SCOPE='HOSTED_RECIPIENT_SETUP_SOURCE_ONLY'
FIRST_CASES=('mainReady','initialStatus','termsCancel','termsPageNoConsent','routeCancel','pickerCancel','finalCancel','noCoreBeforeConsent','pendingAcknowledged','duplicateBusy','pendingReadObserved','wrongHashRejected','revisionReconciled','localArchiveVerified','fleetStillUnavailable','foreignSenderDenied','subframeDenied','lightLayout','darkLayout','mainClosed')
REOPEN_CASES=('mainReady','persistedVerifiedLocal','noAutomaticConsent','installationRevisionRetained','secondStartupObserved','fleetStillUnavailable','mainClosed')
BOOTSTRAP=('auditedCopy','provisioned','authenticated','mainReady','schema4','migration3BackupAuthenticated','migration4ReceiptBound','durableStartupCommitted','captureStoreEmpty','leaseReleased','journalSettled')
MODES=('FIRST','REOPEN')
FAILURES=('PREPARE_FAILED','INSTALL_FAILED','CONTROL_FAILED','NATIVE_FAILED','VALIDATION_FAILED','CLEANUP_FAILED')
def parse(raw):
 if type(raw) is not bytes or not 0<len(raw)<=65536:reject()
 try:return json.loads(raw.decode('utf-8'),object_pairs_hook=unique_pairs,parse_constant=lambda _:reject())
 except (UnicodeError,ValueError,RecursionError):reject()
def booleans(value,keys):
 exact_record(value,keys)
 if any(type(v) is not bool for v in value.values()):reject()
 return dict(value)
def ui(value):
 exact_record(value,('version','scope','mode','cases','screenshots','readyCount','closedCount'))
 if type(value['version']) is not int or value['version']!=1 or value['scope']!=SCOPE or type(value['readyCount']) is not int or value['readyCount']!=1 or type(value['closedCount']) is not int or value['closedCount']!=1:reject()
 if value['mode'] not in MODES:reject()
 cases=booleans(value['cases'],FIRST_CASES if value['mode']=='FIRST' else REOPEN_CASES)
 exact_record(value['screenshots'],('light','dark') if value['mode']=='FIRST' else ())
 images={}
 for theme in (('light','dark') if value['mode']=='FIRST' else ()):
  item=value['screenshots'][theme];exact_record(item,('file','sha256','width','height','bytes'))
  if item['file']!=f'setup-{theme}.png' or type(item['sha256']) is not str or not re.fullmatch('[0-9a-f]{64}',item['sha256']) or type(item['width']) is not int or item['width']!=1024 or type(item['height']) is not int or item['height']!=768 or type(item['bytes']) is not int or not 32<=item['bytes']<=2097152:reject()
  images[theme]=dict(item)
 if value['mode']=='FIRST' and images['light']['sha256']==images['dark']['sha256']:reject()
 return {'version':1,'scope':SCOPE,'mode':value['mode'],'cases':cases,'screenshots':images,'readyCount':1,'closedCount':1}
def validate(value):
 keys=('version','scope','excludedVaultContext','bootstrap','modes','processes','originalArchiveUnchanged','originalSourceUnchanged','directoryCleanup','failure')
 exact_record(value,keys+(('passed',) if 'passed' in value else ()))
 if type(value['version']) is not int or value['version']!=1 or value['scope']!=SCOPE or value['excludedVaultContext']!='P106_UNMET_NOT_RERUN':reject()
 for key in ('directoryCleanup','originalArchiveUnchanged','originalSourceUnchanged'):
  if type(value[key]) is not bool:reject()
 if value['failure'] is not None and value['failure'] not in FAILURES:reject()
 bootstrap={};modes={};processes={};normal={}
 for group in ('bootstrap','modes','processes'):
  if type(value[group]) is not dict or any(k not in MODES for k in value[group]):reject()
 for mode in MODES:
  if mode in value['bootstrap']:
   row=value['bootstrap'][mode];exact_record(row,('version','cases'))
   if type(row['version']) is not int or row['version']!=1:reject()
   bootstrap[mode]={'version':1,'cases':booleans(row['cases'],BOOTSTRAP)}
  if mode in value['modes']:
   row=ui(value['modes'][mode])
   if row['mode']!=mode:reject()
   modes[mode]=row
  if mode in value['processes']:
   row=value['processes'][mode];normal[mode]=validate_process(row);processes[mode]=dict(row)
 if value['failure'] is None and any(set(group)!=set(MODES) for group in (bootstrap,modes,processes)):reject()
 passed=bool(value['failure'] is None and value['directoryCleanup'] and value['originalArchiveUnchanged'] and value['originalSourceUnchanged'] and all(normal.values()) and all(all(row['cases'].values()) for row in bootstrap.values()) and all(all(row['cases'].values()) for row in modes.values()))
 if 'passed' in value and (type(value['passed']) is not bool or value['passed']!=passed):reject()
 return {'version':1,'scope':SCOPE,'excludedVaultContext':'P106_UNMET_NOT_RERUN','bootstrap':bootstrap,'modes':modes,'processes':processes,'originalArchiveUnchanged':value['originalArchiveUnchanged'],'originalSourceUnchanged':value['originalSourceUnchanged'],'directoryCleanup':value['directoryCleanup'],'failure':value['failure'],'passed':passed}
def read_image(file):
 if not file.is_absolute() or file.resolve()!=file:reject()
 s=file.lstat()
 if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or not 32<=s.st_size<=2097152:reject()
 with file.open('rb') as stream:raw=stream.read(2097153)
 if len(raw)!=s.st_size:reject()
 return raw,screenshot(raw)
def write_image(file,raw):
 fd=os.open(file,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'wb') as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
 if read_image(file)[0]!=raw:reject()
def bound_images(base,observed):
 result=[]
 for theme in ('light','dark'):
  row=observed['screenshots'][theme];raw,measured=read_image(base/row['file'])
  if measured!={key:row[key] for key in ('bytes','sha256','width','height')}:reject()
  result.append((row['file'],raw))
 return result
def stage(root):
 root,token=_admit_root(root)
 if root.parent.name!='.recipient-setup-runtime':reject()
 bootstrap={};modes={};processes={}
 for mode in MODES:
  suffix=mode.lower();capture=parse(_read_owned(root,f'launcher-{suffix}-capture.json'));exact_record(capture,('process','stdout','stderr'))
  normal=validate_process(capture['process'])
  for key in ('stdout','stderr'):
   if type(capture[key]) is not str or len(capture[key].encode('utf-16-le'))//2>32768:reject()
  if not normal or capture['stdout'].replace('\r\n','\n') not in ('PERSISTENCE_DESKTOP_CLOSED\n','\nPERSISTENCE_DESKTOP_CLOSED\n'):reject()
  if any(s in capture['stderr'].splitlines() for s in ('RECIPIENT_SETUP_FAILED','PERSISTENCE_LAUNCH_PROBE_FAILED','BOOTSTRAP_FAILED','BOOTSTRAP_CLEANUP_FAILED')):reject()
  modes[mode]=ui(parse(_read_owned(root,f'setup-{suffix}-result.json')))
  bootstrap[mode]=parse(_read_owned(root,f'bootstrap-{suffix}.json'));processes[mode]=capture['process']
 integrity=parse(_read_owned(root,'integrity.json'));exact_record(integrity,('version','originalArchiveUnchanged','originalSourceUnchanged'))
 if type(integrity['version']) is not int or integrity['version']!=1:reject()
 result=validate({'version':1,'scope':SCOPE,'excludedVaultContext':'P106_UNMET_NOT_RERUN','bootstrap':bootstrap,'modes':modes,'processes':processes,'originalArchiveUnchanged':integrity['originalArchiveUnchanged'],'originalSourceUnchanged':integrity['originalSourceUnchanged'],'directoryCleanup':False,'failure':None})
 images=bound_images(root,modes['FIRST'])
 if _admit_root(root)[1]!=token:reject()
 for name,raw in images:write_image(root.parent/name,raw)
 _write_new(root,'public.json',result)
 return all(all(row['cases'].values()) for row in result['bootstrap'].values()) and all(all(row['cases'].values()) for row in result['modes'].values()) and result['originalArchiveUnchanged'] and result['originalSourceUnchanged']
def publish(base):
 if not base.is_absolute() or base.resolve()!=base or not stat.S_ISDIR(base.lstat().st_mode):reject()
 value=validate(parse(_read_owned(base,'unvalidated.json')))
 bound=False
 if 'FIRST' in value['modes']:bound_images(base,value['modes']['FIRST']);bound=True
 _write_new(base,'validated.json',value)
 return value['passed'],bound
def main(argv=None):
 import sys
 args=sys.argv[1:] if argv is None else argv
 try:
  if len(args)==2 and args[0]=='stage':
   ok=stage(Path(args[1]));print('RECIPIENT_SETUP_STAGE_VALIDATED');return 0 if ok else 1
  if args!=['publish']:reject()
  ok,bound=publish(Path(__file__).resolve().parents[1]/'.recipient-setup-runtime')
 except (OSError,ValueError,TypeError,UnicodeError,RecursionError):
  print('RECIPIENT_SETUP_VALIDATION_INVALID');return 2
 print('RECIPIENT_SETUP_VALIDATION_WRITTEN')
 if bound:print('RECIPIENT_SETUP_SCREENSHOTS_BOUND')
 print('RECIPIENT_SETUP_VALIDATION_PASS' if ok else 'RECIPIENT_SETUP_VALIDATION_FAIL');return 0 if ok else 1
if __name__=='__main__':raise SystemExit(main())
