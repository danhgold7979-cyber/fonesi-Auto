"""Fixed internal-package evidence; no private roots, captures or custody identifiers escape."""
import json
import re
import hashlib
import os
import stat
import zipfile
import struct
from pathlib import Path
from validate_runtime import exact_record,reject,validate_process,VERSIONS
from validate_ui import parse
from validate_persistence import _admit_root,_read_owned,_write_new
COMMON=('packageVerified','productOutsidePackage','originalPackageUnchanged')
CASES={
'first-cancel':COMMON+('provisioningCancelled','noWriterLease'),
'first-launch':COMMON+('initialized','originalKeyAuthenticated','mainReady','sixTabsEmpty','settingsObserved','orderlyClose','leaseReleased'),
'reopen':COMMON+('noReprovision','originalBackupUnchanged','settingsRetained','orderlyClose','leaseReleased'),
'guard-denied':COMMON+('guardContentionRefused','noNewLaunch','sourceBytesPreserved'),
'corrupt-current':COMMON+('invalidCurrentRefused','knownRetirement','leaseRetained','sourceBytesPreserved'),
'recover-retained':COMMON+('exactJournalMatched','freshRecoveryReceipt','oldLeaseReleased','sourceBytesPreserved'),
'restore-cancel':COMMON+('backupAuthenticated','cancelled','sourceBytesPreserved','leaseReleased'),
'restore-confirm':COMMON+('backupAuthenticated','newQuarantinedRoot','sourceBytesPreserved','leaseReleased'),
'restored-normal-denied':COMMON+('normalDenied','quarantineUnchanged','sourceBytesPreserved'),
'restored-maintenance':COMMON+('selectedStoreAdmitted','backupAuthenticated','secondQuarantinedRoot','sourceBytesPreserved','leaseReleased')}
STAGES=tuple(CASES)
NEGATIVES=('missingNode','missingElectron','missingNodeLicense','missingElectronLicense','missingChromiumLicense','missingReactLicense','missingReactDomLicense','missingSchedulerLicense','payloadTamper','lockMismatch','unknownDemoFile','fixtureCanaryRejected','promotionCollisionRejected','failingTestGate','originalPackageRestored')
FAILURES=('PREPARE_FAILED','BUILD_FAILED','PACKAGE_FAILED','NATIVE_STAGE_FAILED','STAGE_VALIDATION_FAILED','NEGATIVE_FAILED','RECOVERY_FAILED','CLEANUP_FAILED')
def expected(stage):
 if stage not in STAGES:reject()
 if stage=='corrupt-current':return ('NONZERO_EXIT',1,'PERSISTENCE_DESKTOP_APPLICATION_FAILED')
 if stage in ('restored-normal-denied','guard-denied'):return ('NONZERO_EXIT',1,'PERSISTENCE_DESKTOP_PREPARE_FAILED')
 return ('SUCCESS',0,'PERSISTENCE_DESKTOP_CANCELLED' if stage=='first-cancel' else 'PERSISTENCE_DESKTOP_RECOVERED' if stage=='recover-retained' else 'PERSISTENCE_DESKTOP_CLOSED')
def capture(value,expect):
 exact_record(value,('process','stdout','stderr'));validate_process(value['process'])
 for key in ('stdout','stderr'):
  if type(value[key]) is not str or len(value[key].encode('utf-16-le'))//2>32768:reject()
 lines=value['stdout'].replace('\r\n','\n').split('\n')
 if lines and lines[-1]=='':lines.pop()
 if lines and lines[0]=='':lines.pop(0)
 if lines!=[expect[2]]:reject()
 p=value['process']
 return p['status']==expect[0] and p['exitCode']==expect[1] and p['cleanupComplete'] and not p['stdoutTruncated'] and not p['stderrTruncated']
def bools(value,names):
 exact_record(value,names)
 if any(type(x) is not bool for x in value.values()):reject()
def validate_stage(raw,observed,stage):
 v=parse(raw);exact_record(v,('version','stage','versions','cases'))
 if type(v['version']) is not int or v['version']!=1 or v['stage']!=stage or stage not in STAGES or v['versions']!=VERSIONS:reject()
 exact_record(v['versions'],VERSIONS);bools(v['cases'],CASES[stage])
 passed=capture(observed,expected(stage)) and all(v['cases'].values())
 return {**v,'process':dict(observed['process']),'passed':passed}
def validate_stage_public(v,stage):
 exact_record(v,('version','stage','versions','cases','process','passed'))
 if type(v['passed']) is not bool:reject()
 result=validate_stage(json.dumps({k:v[k] for k in ('version','stage','versions','cases')}).encode(),{'process':v['process'],'stdout':expected(stage)[2]+'\n','stderr':''},stage)
 if v['passed']!=result['passed']:reject()
 return result['passed']
def validate_negatives(raw,observed):
 v=parse(raw);exact_record(v,('version','cases'))
 if type(v['version']) is not int or v['version']!=1:reject()
 bools(v['cases'],NEGATIVES)
 return {**v,'process':dict(observed['process']),'passed':capture(observed,('SUCCESS',0,'PACKAGE_NEGATIVES_VERIFIED')) and all(v['cases'].values())}
def validate_negative_public(v):
 exact_record(v,('version','cases','process','passed'))
 if type(v['passed']) is not bool:reject()
 result=validate_negatives(json.dumps({k:v[k] for k in ('version','cases')}).encode(),{'process':v['process'],'stdout':'PACKAGE_NEGATIVES_VERIFIED\n','stderr':''})
 if result['passed']!=v['passed']:reject()
 return result['passed']
def validate_report(raw):
 v=parse(raw);exact_record(v,('version','scope','excludedVaultContext','sourceHead','sourceTree','package','stages','negatives','relocatedCopyVerified','originalPackageUnchanged','dataOutsidePackage','directoryCleanup','failure'))
 if type(v['version']) is not int or v['version']!=1 or v['scope']!='HOSTED_INTERNAL_PRODUCTION_PACKAGE' or v['excludedVaultContext']!='P106_UNMET_NOT_RERUN':reject()
 for key in ('sourceHead','sourceTree'):
  if type(v[key]) is not str or re.fullmatch('[0-9a-f]{40}',v[key]) is None:reject()
 p=v['package']
 if p is None:
  if v['failure'] is None:reject()
 else:
  exact_record(p,('sha256','bytes','fileCount','node','electron'))
 if p is not None and (type(p['sha256']) is not str or re.fullmatch('[0-9a-f]{64}',p['sha256']) is None or type(p['bytes']) is not int or not 1<=p['bytes']<=640*1024*1024 or type(p['fileCount']) is not int or not 1<=p['fileCount']<=512 or p['node']!='24.22.1' or p['electron']!='45.1.0'):reject()
 flags=('relocatedCopyVerified','originalPackageUnchanged','dataOutsidePackage','directoryCleanup')
 if any(type(v[k]) is not bool for k in flags):reject()
 if v['failure'] is not None and (type(v['failure']) is not str or v['failure'] not in FAILURES):reject()
 if type(v['stages']) is not dict or not set(v['stages']).issubset(STAGES):reject()
 if v['failure'] is None and set(v['stages'])!=set(STAGES):reject()
 passed=v['failure'] is None and all(v[k] for k in flags)
 for stage,item in v['stages'].items():passed=validate_stage_public(item,stage) and passed
 if v['negatives'] is None:
  if v['failure'] is None:reject()
  passed=False
 else:passed=validate_negative_public(v['negatives']) and passed
 return {**v,'passed':passed}
def stage_files(root,stage):
 if stage not in STAGES:reject()
 token=_admit_root(root)
 v=validate_stage(_read_owned(root,f'package-result-{stage}.json'),parse(_read_owned(root,f'package-capture-{stage}.json')),stage)
 if _admit_root(root)!=token:reject()
 _write_new(root,f'package-public-{stage}.json',v);return v['passed']
def negative_files(root):
 token=_admit_root(root);v=validate_negatives(_read_owned(root,'package-negatives.json'),parse(_read_owned(root,'package-negatives-capture.json')))
 if _admit_root(root)!=token:reject()
 _write_new(root,'package-negatives-public.json',v);return v['passed']
def plain_directory(value):
 if not value.is_absolute() or value.resolve()!=value or not stat.S_ISDIR(value.lstat().st_mode) or value.is_symlink():reject()
 return value

def hash_file(file,limit):
 info=file.lstat()
 if not stat.S_ISREG(info.st_mode) or file.is_symlink() or info.st_size>limit:reject()
 digest=hashlib.sha256();count=0
 with file.open('rb') as stream:
  while chunk:=stream.read(65536):
   count+=len(chunk)
   if count>limit:reject()
   digest.update(chunk)
 if count!=info.st_size:reject()
 return count,digest.hexdigest()

def safe_member_name(name):
 if type(name) is not str or not name or len(name)>240 or len(name.split('/'))>16:reject()
 for part in name.split('/'):
  if re.fullmatch('[A-Za-z0-9._-]+',part) is None or part in ('.','..') or part.endswith('.') or re.match(r'^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)',part,re.I):reject()
 return name

def verify_bundle(v,candidate_file):
 # Revalidate exact bounded archive/payload bytes without executing candidate code.
 plain_directory(candidate_file.parent)
 candidate=parse(_read_owned(candidate_file.parent,candidate_file.name))
 exact_record(candidate,('directory','zip','sha256','bytes'))
 if any(type(candidate[k]) is not str for k in ('directory','zip','sha256')) or type(candidate['bytes']) is not int:reject()
 directory=plain_directory(Path(candidate['directory']));archive=Path(candidate['zip'])
 parent=plain_directory(directory.parent)
 if parent.parent!=candidate_file.parent or directory.name!='package' or archive!=parent/'Fonesi-Auto.zip':reject()
 p=v['package']
 if type(p['bytes']) is not int or not 1<=p['bytes']<=640*1024*1024 or type(p['sha256']) is not str or re.fullmatch('[0-9a-f]{64}',p['sha256']) is None:reject()
 if candidate['sha256']!=p['sha256'] or candidate['bytes']!=p['bytes'] or hash_file(archive,640*1024*1024)!=(p['bytes'],p['sha256']):reject()
 manifest=parse(_read_owned(directory,'package-manifest.json'))
 if not all(type(v[k]) is str and re.fullmatch('[0-9a-f]{40}',v[k]) for k in ('sourceHead','sourceTree')):reject()
 if manifest.get('sourceHead')!=v['sourceHead'] or manifest.get('sourceTree')!=v['sourceTree'] or manifest.get('mode')!='INTERNAL_PRODUCTION' or type(manifest.get('files')) is not list or not 1<=len(manifest['files'])<=511 or len(manifest['files'])!=p['fileCount']:reject()
 expected={'package-manifest.json'};total=hash_file(directory/'package-manifest.json',65536)[0]
 for entry in manifest['files']:
  exact_record(entry,('path','bytes','sha256'));name=safe_member_name(entry['path'])
  if type(name) is not str or not name or '\\' in name or name.startswith('/') or any(part in ('','.','..') for part in name.split('/')) or ':' in name or name in expected:reject()
  if type(entry['bytes']) is not int or not 0<=entry['bytes']<=640*1024*1024 or type(entry['sha256']) is not str or re.fullmatch('[0-9a-f]{64}',entry['sha256']) is None:reject()
  file=directory/name
  if file.resolve()!=file or hash_file(file,entry['bytes'])!=(entry['bytes'],entry['sha256']):reject()
  expected.add(name);total+=entry['bytes']
  if total>640*1024*1024:reject()
 runtime=parse(_read_owned(directory/'provenance','runtime-manifest.json'))
 if type(runtime.get('entries')) is not list or len(runtime['entries'])>256:reject()
 allowed_dirs=set()
 for name in expected:
  parent_name=Path(name).parent
  while str(parent_name)!='.':
   allowed_dirs.add(parent_name.as_posix());parent_name=parent_name.parent
 for entry in runtime['entries']:
  if entry.get('kind')=='directory':
   name=safe_member_name(entry.get('name'))
   if type(name) is not str or not name or '\\' in name or name.startswith('/') or any(part in ('','.','..') for part in name.split('/')) or ':' in name:reject()
   allowed_dirs.add(safe_member_name('runtime/electron/'+name))
 actual=set();actual_dirs=set();entries=0
 for folder,dirs,files in os.walk(directory,followlinks=False):
  for name in dirs+files:
   entries+=1;item=Path(folder)/name
   if entries>1024 or item.is_symlink() or item.resolve()!=item:reject()
  actual.update((Path(folder)/name).relative_to(directory).as_posix() for name in files)
  actual_dirs.update((Path(folder)/name).relative_to(directory).as_posix() for name in dirs)
 if actual!=expected or actual_dirs!=allowed_dirs or len({name.lower() for name in expected|allowed_dirs})!=len(expected|allowed_dirs):reject()
 # Bound central-directory allocation before ZipFile parses any entry list.
 with archive.open('rb') as stream:
  if p['bytes']<22:reject()
  stream.seek(-22,2);tail=stream.read(22)
 signature,disk,central_disk,on_disk,count,central_size,central_offset,comment_size=struct.unpack('<4s4H2LH',tail)
 if signature!=b'PK\x05\x06' or disk!=0 or central_disk!=0 or on_disk!=count or not 1<=count<=1024 or central_size>1024*287 or central_offset+central_size+22!=p['bytes'] or comment_size!=0:reject()
 with zipfile.ZipFile(archive,'r') as zipped:
  infos=zipped.infolist();names=[item.filename for item in infos]
  if len(infos)>1024 or len(set(names))!=len(names) or set(names)!=expected|{name+'/' for name in allowed_dirs}:reject()
  for item in infos:
   if item.compress_type!=zipfile.ZIP_STORED or item.flag_bits not in (0,0x800) or item.extra or item.comment or len(item.filename.encode('utf8'))>241:reject()
   kind=stat.S_IFMT(item.external_attr>>16)
   if kind not in (0,stat.S_IFREG,stat.S_IFDIR) or (kind==stat.S_IFDIR and not item.is_dir()) or (kind==stat.S_IFREG and item.is_dir()):reject()
   if item.is_dir():
    if item.file_size!=0:reject()
    continue
   source=directory/item.filename;size,digest=hash_file(source,640*1024*1024)
   if item.file_size!=size or item.compress_size!=size:reject()
   observed=hashlib.sha256();count=0
   with zipped.open(item) as stream:
    while chunk:=stream.read(65536):
     count+=len(chunk)
     if count>size:reject()
     observed.update(chunk)
   if count!=size or observed.hexdigest()!=digest:reject()
 return archive,directory,expected,allowed_dirs

def bind_bundle(base,v,candidate_file):
 if v.get('passed') is not True:reject()
 archive,_,_,_=verify_bundle(v,candidate_file);p=v['package']
 destination=base/'Fonesi-Auto.zip';checksum=base/'Fonesi-Auto.zip.sha256'
 if destination.exists() or destination.is_symlink() or checksum.exists() or checksum.is_symlink():reject()
 digest=hashlib.sha256();count=0
 with archive.open('rb') as source,destination.open('xb') as target:
  while chunk:=source.read(65536):
   count+=len(chunk)
   if count>p['bytes']:reject()
   digest.update(chunk);target.write(chunk)
  target.flush();os.fsync(target.fileno())
 if (count,digest.hexdigest())!=(p['bytes'],p['sha256']) or hash_file(destination,p['bytes'])!=(p['bytes'],p['sha256']):reject()
 with checksum.open('x',encoding='ascii',newline='\n') as target:
  target.write(p['sha256']+'  Fonesi-Auto.zip\n');target.flush();os.fsync(target.fileno())
 return True

def extract_bundle(root,candidate_file):
 token=_admit_root(root)
 candidate=parse(_read_owned(candidate_file.parent,candidate_file.name));exact_record(candidate,('directory','zip','sha256','bytes'))
 if type(candidate['directory']) is not str:reject()
 manifest=parse(_read_owned(plain_directory(Path(candidate['directory'])),'package-manifest.json'))
 if type(manifest.get('files')) is not list:reject()
 value={'sourceHead':manifest.get('sourceHead'),'sourceTree':manifest.get('sourceTree'),'package':{'sha256':candidate['sha256'],'bytes':candidate['bytes'],'fileCount':len(manifest['files'])}}
 archive,directory,files,dirs=verify_bundle(value,candidate_file)
 if _admit_root(root)!=token:reject()
 destination=root/'relocated-package';destination.mkdir(mode=0o700)
 for name in sorted(dirs,key=lambda item:(item.count('/'),item)):
  (destination/name).mkdir(mode=0o700)
 with zipfile.ZipFile(archive,'r') as zipped:
  for name in sorted(files):
   size,digest=hash_file(directory/name,640*1024*1024);actual=hashlib.sha256();count=0
   with zipped.open(name) as source,(destination/name).open('xb') as output:
    while chunk:=source.read(65536):
     count+=len(chunk)
     if count>size:reject()
     actual.update(chunk);output.write(chunk)
    output.flush();os.fsync(output.fileno())
   if count!=size or actual.hexdigest()!=digest or hash_file(destination/name,size)!=(size,digest):reject()
 if _admit_root(root)!=token or hash_file(archive,640*1024*1024)!=(candidate['bytes'],candidate['sha256']):reject()
 return True

def publish(base,candidate_file=None):
 plain_directory(base)
 v=validate_report(_read_owned(base,'unvalidated.json'));_write_new(base,'validated.json',v)
 return v

def main():
 import sys
 try:
  if len(sys.argv)==4 and sys.argv[1]=='stage':passed=stage_files(Path(sys.argv[2]),sys.argv[3])
  elif len(sys.argv)==3 and sys.argv[1]=='extract':
   extract_bundle(Path(sys.argv[2]),Path(__file__).resolve().parents[1]/'.package-build'/'candidate.json');print('PACKAGE_EXTRACTED');return 0
  elif len(sys.argv)==3 and sys.argv[1]=='negative':passed=negative_files(Path(sys.argv[2]))
  elif len(sys.argv)==2 and sys.argv[1]=='publish':
   desktop=Path(__file__).resolve().parents[1];base=desktop/'.package-runtime'
   result=publish(base);print('PACKAGE_VALIDATION_WRITTEN',flush=True)
   if result['passed']:
    bind_bundle(base,result,desktop/'.package-build'/'candidate.json');print('PACKAGE_PROMOTION_READY',flush=True)
   print('PACKAGE_HOSTED_PASS' if result['passed'] else 'PACKAGE_HOSTED_FAIL');return 0 if result['passed'] else 1
  else:reject()
 except (OSError,ValueError,UnicodeError,RecursionError,TypeError,KeyError,zipfile.BadZipFile,NotImplementedError,struct.error):print('PACKAGE_VALIDATION_FAILED');return 1
 print('PACKAGE_VALIDATION_PASS' if passed else 'PACKAGE_VALIDATION_FAIL');return 0 if passed else 1
if __name__=='__main__':raise SystemExit(main())
