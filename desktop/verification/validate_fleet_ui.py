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
SCOPE='HOSTED_FLEET_UI_SOURCE_ONLY'
CASES=('mainReady','oneFleetHydration','preferencesHydrated','emptyProduction','readObserved','emptySelectionUnchanged','selectionTimeoutObserved','selectionReconcileRequired','explicitReadReconciled','lateReplyNoReplay','foreignSenderDenied','subframeDenied','revokedSessionDenied','sixTabsPresent','noDeviceActions','lightLayout','darkLayout','mainClosed')
BOOTSTRAP=('auditedCopy','provisioned','authenticated','mainReady','schema3','leaseReleased','journalSettled')
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
 exact_record(value,('version','scope','cases','screenshots','readyCount','closedCount'))
 if type(value['version']) is not int or value['version']!=1 or value['scope']!=SCOPE or type(value['readyCount']) is not int or value['readyCount']!=1 or type(value['closedCount']) is not int or value['closedCount']!=1:reject()
 cases=booleans(value['cases'],CASES)
 exact_record(value['screenshots'],('light','dark'))
 images={}
 for theme in ('light','dark'):
  item=value['screenshots'][theme];exact_record(item,('file','sha256','width','height','bytes'))
  if item['file']!=f'fleet-{theme}.png' or type(item['sha256']) is not str or not re.fullmatch('[0-9a-f]{64}',item['sha256']) or type(item['width']) is not int or item['width']!=1024 or type(item['height']) is not int or item['height']!=768 or type(item['bytes']) is not int or not 32<=item['bytes']<=2097152:reject()
  images[theme]=dict(item)
 if images['light']['sha256']==images['dark']['sha256']:reject()
 return {'version':1,'scope':SCOPE,'cases':cases,'screenshots':images,'readyCount':1,'closedCount':1}
def validate(value):
 keys=('version','scope','excludedVaultContext','bootstrap','ui','process','directoryCleanup','failure')
 exact_record(value,keys+(('passed',) if 'passed' in value else ()))
 if type(value['version']) is not int or value['version']!=1 or value['scope']!=SCOPE or value['excludedVaultContext']!='P106_UNMET_NOT_RERUN' or type(value['directoryCleanup']) is not bool:reject()
 if value['failure'] is not None and value['failure'] not in FAILURES:reject()
 bootstrap=value['bootstrap'];observed=value['ui'];process=value['process']
 if bootstrap is not None:
  exact_record(bootstrap,('version','cases'))
  if type(bootstrap['version']) is not int or bootstrap['version']!=1:reject()
  bootstrap={'version':1,'cases':booleans(bootstrap['cases'],BOOTSTRAP)}
 if observed is not None:observed=ui(observed)
 normal=False
 if process is not None:normal=validate_process(process)
 if value['failure'] is None and any(x is None for x in (bootstrap,observed,process)):reject()
 passed=bool(value['failure'] is None and value['directoryCleanup'] and normal and bootstrap and all(bootstrap['cases'].values()) and observed and all(observed['cases'].values()))
 if 'passed' in value and (type(value['passed']) is not bool or value['passed']!=passed):reject()
 return {'version':1,'scope':SCOPE,'excludedVaultContext':'P106_UNMET_NOT_RERUN','bootstrap':bootstrap,'ui':observed,'process':process,'directoryCleanup':value['directoryCleanup'],'failure':value['failure'],'passed':passed}
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
 if root.parent.name!='.fleet-ui-runtime':reject()
 capture=parse(_read_owned(root,'launcher-capture.json'));exact_record(capture,('process','stdout','stderr'))
 normal=validate_process(capture['process'])
 for key in ('stdout','stderr'):
  if type(capture[key]) is not str or len(capture[key].encode('utf-16-le'))//2>32768:reject()
 if not normal or capture['stdout'].replace('\r\n','\n')!='PERSISTENCE_DESKTOP_CLOSED\n':reject()
 if any(s in capture['stderr'].splitlines() for s in ('FLEET_UI_FAILED','PERSISTENCE_LAUNCH_PROBE_FAILED','BOOTSTRAP_FAILED','BOOTSTRAP_CLEANUP_FAILED')):reject()
 observed=ui(parse(_read_owned(root,'fleet-ui-result.json')))
 result=validate({'version':1,'scope':SCOPE,'excludedVaultContext':'P106_UNMET_NOT_RERUN','bootstrap':parse(_read_owned(root,'bootstrap.json')),'ui':observed,'process':capture['process'],'directoryCleanup':False,'failure':None})
 images=bound_images(root,observed)
 if _admit_root(root)[1]!=token:reject()
 for name,raw in images:write_image(root.parent/name,raw)
 _write_new(root,'public.json',result)
 return all(result['bootstrap']['cases'].values()) and all(observed['cases'].values())
def publish(base):
 if not base.is_absolute() or base.resolve()!=base or not stat.S_ISDIR(base.lstat().st_mode):reject()
 value=validate(parse(_read_owned(base,'unvalidated.json')))
 bound=False
 if value['ui'] is not None:bound_images(base,value['ui']);bound=True
 _write_new(base,'validated.json',value)
 return value['passed'],bound
def main(argv=None):
 import sys
 args=sys.argv[1:] if argv is None else argv
 try:
  if len(args)==2 and args[0]=='stage':
   ok=stage(Path(args[1]));print('FLEET_UI_STAGE_VALIDATED');return 0 if ok else 1
  if args!=['publish']:reject()
  ok,bound=publish(Path(__file__).resolve().parents[1]/'.fleet-ui-runtime')
 except (OSError,ValueError,TypeError,UnicodeError,RecursionError):
  print('FLEET_UI_VALIDATION_INVALID');return 2
 print('FLEET_UI_VALIDATION_WRITTEN')
 if bound:print('FLEET_UI_SCREENSHOTS_BOUND')
 print('FLEET_UI_VALIDATION_PASS' if ok else 'FLEET_UI_VALIDATION_FAIL');return 0 if ok else 1
if __name__=='__main__':raise SystemExit(main())
