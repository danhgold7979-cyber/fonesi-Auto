"""Strict demo-only native evidence. Private identifiers, captures and source roots are dropped."""
import json
import re
from pathlib import Path
from validate_runtime import exact_record, reject, validate_process, VERSIONS
from validate_persistence import _admit_root, _read_owned, _write_new, validate_public_mode
from validate_ui import parse, screenshot, read_image
MODES=('source','package','production')
DEMO_CASES=('verifiedDemoBuild','explicitArgument','ownedProfile','sandboxAndIsolation','isolatedOrigin','noPreloadOrIpc','syntheticFixtureCounts','allSixTabs','bannerEveryPage','bannerBothThemes','bannerWithModal','media25Reachable','dependentSelection','domainUnavailable','localPreferenceReadback','invalidPreferenceDefaults','deniedPreferenceVisible','orderlyQuit')
PRODUCTION_CASES=('realMain','originalKeyAuthenticated','demoEnvironmentIgnored','productionEmpty','fixtureCanaryAbsent','productionOrigin','orderlyQuit')
NEGATIVES=('production-argument','marker','manifest')
FAILURES=('PREPARE_FAILED','PACKAGE_FAILED','CONTROL_FAILED','PREFLIGHT_FAILED','NATIVE_STAGE_FAILED','STAGE_VALIDATION_FAILED','SEQUENCE_VALIDATION_FAILED','SCREENSHOT_FAILED','ISOLATION_FAILED','CLEANUP_FAILED')
def cases(mode):
 if mode not in MODES:reject()
 return PRODUCTION_CASES if mode=='production' else DEMO_CASES
def specs(mode):
 cases(mode)
 names=('demo-source-overview-light.png','demo-source-overview-dark.png','demo-source-setup-light.png') if mode=='source' else ('demo-package-overview-light.png',) if mode=='package' else ('demo-production-overview-light.png',)
 return [(name,1440,900) for name in names]
def metadata(item,spec):
 exact_record(item,('name','width','height','bytes','sha256'))
 if item['name']!=spec[0] or type(item['width']) is not int or type(item['height']) is not int or (item['width'],item['height'])!=spec[1:]:reject()
 if type(item['bytes']) is not int or not 45<=item['bytes']<=4194304 or type(item['sha256']) is not str or re.fullmatch('[0-9a-f]{64}',item['sha256']) is None:reject()
def capture(value):
 exact_record(value,('process','stdout','stderr'));normal=validate_process(value['process'])
 for key in ('stdout','stderr'):
  if type(value[key]) is not str or len(value[key].encode('utf-16-le'))//2>32768:reject()
 lines=value['stdout'].replace('\r\n','\n').split('\n')
 if lines and lines[-1]=='':lines.pop()
 if lines and lines[0]=='':lines.pop(0)
 return normal,lines

def stdout(mode):
 return ['BOOTSTRAP_READY','BOOTSTRAP_CLOSED','DEMO_PRODUCTION_VERIFIED'] if mode=='production' else ['DEMO_READY','DEMO_CLOSED','DEMO_VERIFIED']
def validate_stage(raw,observed,mode):
 value=parse(raw);exact_record(value,('version','mode','versions','cases','images'))
 if type(value['version']) is not int or value['version']!=1 or value['mode']!=mode:reject()
 exact_record(value['versions'],VERSIONS)
 if value['versions']!=VERSIONS:reject()
 exact_record(value['cases'],cases(mode))
 if any(type(flag) is not bool for flag in value['cases'].values()):reject()
 expected=specs(mode)
 if type(value['images']) is not list or len(value['images'])!=len(expected):reject()
 for image,spec in zip(value['images'],expected):metadata(image,spec)
 normal,lines=capture(observed)
 if lines!=stdout(mode):reject()
 if any(marker in observed['stderr'] for marker in ('DEMO_FAILED','DEMO_PROBE_FAILED','DEMO_PROBE_DEADLINE','DEMO_PRODUCTION_FAILED','DEMO_PRODUCTION_DEADLINE','BOOTSTRAP_FAILED','BOOTSTRAP_CLEANUP_FAILED','PERSISTENCE_SHUTDOWN_FAILED')):reject()
 return {**value,'process':dict(observed['process']),'passed':normal and all(value['cases'].values())}
def validate_public(value,mode):
 exact_record(value,('version','mode','versions','cases','images','process','passed'))
 if type(value['passed']) is not bool:reject()
 raw={key:value[key] for key in ('version','mode','versions','cases','images')}
 rebuilt=validate_stage(json.dumps(raw).encode(),{'process':value['process'],'stdout':'\n'.join(stdout(mode))+'\n','stderr':''},mode)
 if value['passed'] and not rebuilt['passed']:reject()
 return value['passed']
def validate_negative(observed,name):
 if name not in NEGATIVES:reject()
 _,lines=capture(observed);process=observed['process']
 marker='BOOTSTRAP_FAILED' if name=='production-argument' else 'DEMO_FAILED'
 denied=not lines and observed['stderr'].replace('\r\n','\n').splitlines().count(marker)==1
 passed=denied and process['status']=='NONZERO_EXIT' and process['exitCode']==1 and process['cleanupComplete'] and not process['stdoutTruncated'] and not process['stderrTruncated']
 return {'name':name,'process':dict(process),'denialObserved':denied,'passed':passed}
def validate_negative_public(value,name):
 exact_record(value,('name','process','denialObserved','passed'))
 if value['name']!=name or type(value['denialObserved']) is not bool or type(value['passed']) is not bool:reject()
 marker='BOOTSTRAP_FAILED' if name=='production-argument' else 'DEMO_FAILED'
 rebuilt=validate_negative({'process':value['process'],'stdout':'','stderr':marker+'\n' if value['denialObserved'] else ''},name)
 if value['passed'] and not rebuilt['passed']:reject()
 return value['passed']
def validate_report(raw):
 value=parse(raw);exact_record(value,('version','scope','excludedVaultContext','bootstrap','modes','negatives','productionFilesUnchanged','productionPayloadCopyVerified','screenshots','runtimeCopyVerified','directoryCleanup','failure'))
 if type(value['version']) is not int or value['version']!=1 or value['scope']!='HOSTED_EXPLICIT_DEMO_BOUNDARY' or value['excludedVaultContext']!='P106_UNMET_NOT_RERUN':reject()
 flags=('productionFilesUnchanged','productionPayloadCopyVerified','runtimeCopyVerified','directoryCleanup')
 if any(type(value[key]) is not bool for key in flags):reject()
 if value['failure'] is not None and (type(value['failure']) is not str or value['failure'] not in FAILURES):reject()
 passed=value['failure'] is None and all(value[key] for key in flags)
 for key,allowed in (('bootstrap',('source',)),('modes',MODES),('negatives',NEGATIVES)):
  if type(value[key]) is not dict or not set(value[key]).issubset(allowed):reject()
  if value['failure'] is None and set(value[key])!=set(allowed):reject()
 for mode,item in value['bootstrap'].items():passed=validate_public_mode(item,mode) and passed
 for mode,item in value['modes'].items():passed=validate_public(item,mode) and passed
 for name,item in value['negatives'].items():passed=validate_negative_public(item,name) and passed
 expected={name:(name,w,h) for mode in MODES for name,w,h in specs(mode)}
 if type(value['screenshots']) is not dict or not set(value['screenshots']).issubset(expected):reject()
 if value['failure'] is None and set(value['screenshots'])!=set(expected):reject()
 total=0
 for name,item in value['screenshots'].items():
  metadata(item,expected[name]);total+=item['bytes']
  mode=next(mode for mode in MODES if name.startswith('demo-'+mode+'-'))
  if mode not in value['modes'] or item not in value['modes'][mode]['images']:reject()
 if total>20971520:reject()
 light=value['screenshots'].get('demo-source-overview-light.png');dark=value['screenshots'].get('demo-source-overview-dark.png')
 if light and dark and light['sha256']==dark['sha256']:reject()
 return {**value,'passed':passed}
def stage_files(root,mode):
 token=_admit_root(root);cases(mode)
 directory=root if mode=='production' else root/f'demo-{mode}'
 value=validate_stage(_read_owned(directory,f'demo-{mode}.json'),parse(_read_owned(root,f'demo-capture-{mode}.json')),mode)
 if _admit_root(root)!=token:reject()
 _write_new(root,f'demo-public-{mode}.json',value);return value['passed']
def negative_files(root,name):
 token=_admit_root(root)
 value=validate_negative(parse(_read_owned(root,f'demo-capture-{name}.json')),name)
 if _admit_root(root)!=token:reject()
 _write_new(root,f'demo-negative-public-{name}.json',value);return value['passed']
def screenshot_files(root,mode):
 import os
 token=_admit_root(root);base=root.parent
 if base.name!='.demo-verification' or base.resolve()!=base:reject()
 public=parse(_read_owned(root,f'demo-public-{mode}.json'));validate_public(public,mode)
 directory=root if mode=='production' else root/f'demo-{mode}'
 images=[]
 for spec,expected in zip(specs(mode),public['images']):
  raw,observed=read_image(directory/spec[0],spec)
  if observed!=expected or _admit_root(root)!=token:reject()
  with (base/spec[0]).open('xb') as handle:handle.write(raw);handle.flush();os.fsync(handle.fileno())
  images.append(observed)
 _write_new(root,f'demo-screenshots-{mode}.json',{'images':images})
def publish(base):
 if not base.is_absolute() or base.resolve()!=base or not base.is_dir():reject()
 value=validate_report(_read_owned(base,'unvalidated.json'))
 for name,item in value['screenshots'].items():
  _,observed=read_image(base/name,(name,item['width'],item['height']))
  if observed!=item:reject()
 _write_new(base,'validated.json',value);return value['passed'],len(value['screenshots'])==5
def main():
 import sys
 try:
  if len(sys.argv)==4 and sys.argv[1] in ('stage','negative','screenshots'):
   action,root,mode=sys.argv[1:];root=Path(root)
   if action=='screenshots':screenshot_files(root,mode);print('DEMO_SCREENSHOTS_VERIFIED');return 0
   passed=stage_files(root,mode) if action=='stage' else negative_files(root,mode)
   print('DEMO_VALIDATION_PASS' if passed else 'DEMO_VALIDATION_FAIL');return 0 if passed else 1
  if len(sys.argv)!=2 or sys.argv[1]!='publish':reject()
  passed,bound=publish(Path(__file__).resolve().parents[1]/'.demo-verification')
 except (OSError,ValueError,UnicodeError,RecursionError,TypeError,StopIteration):print('DEMO_VALIDATION_INVALID');return 2
 print('DEMO_VALIDATION_WRITTEN')
 if bound:print('DEMO_SCREENSHOTS_BOUND')
 print('DEMO_VALIDATION_PASS' if passed else 'DEMO_VALIDATION_FAIL');return 0 if passed else 1
if __name__=='__main__':raise SystemExit(main())
