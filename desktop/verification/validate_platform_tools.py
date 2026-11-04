"""Development-only fixed adb-version evidence; never publishes raw paths/output or binaries."""
import hashlib
import json
import ntpath
import os
from pathlib import Path
import re
import stat

ARCHIVE_SHA = '45f4d63113e895ebde0c90f194099a4676b6ac653bd28d54314a9e022bbc1a99'
SCOPE = 'HOSTED_ADB_VERSION_DEVELOPMENT_ONLY'
CASES = ('archiveVerified','inventoryVerified','architectureVerified','missingRejected','tamperRejected','architectureRejected','pathShadowIgnored','sourceBound','profileUnchanged','candidateUnchanged','commandVersionOnly')
PREFLIGHT = CASES[1:8]
SOURCES = ('src/main/platform-tools-files.ts','verification/platform-tools-candidate.json','verification/platform-tools-version-control.cjs','verification/Invoke-PlatformToolsVersion.ps1','verification/platform_tools_archive.py','verification/validate_platform_tools.py','../tools/phase-00/HostProbeNative.cs','verification/WindowsBoundary.psm1','verification/OwnedFiles.psm1','verification/persistence-restore-contract.cjs')
STATUSES = ('SUCCESS','NONZERO_EXIT','EMPTY_OUTPUT','TIMEOUT','LAUNCH_FAILED','ACCESS_DENIED','CAPTURE_FAILED','CLEANUP_FAILED')
FAILURES = ('PREFLIGHT_FAILED','PROCESS_FAILED','VERSION_REJECTED','OWNERSHIP_REJECTED','CLEANUP_FAILED')
UUID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')

def reject():
    raise ValueError('PLATFORM_TOOLS_VALIDATION_REJECTED')

def unique(pairs):
    value = {}
    for key, item in pairs:
        if key in value: reject()
        value[key] = item
    return value

def parse(raw, maximum=65536):
    if type(raw) is not bytes or not raw or len(raw)>maximum: reject()
    try:
        return json.loads(raw.decode('utf-8'),object_pairs_hook=unique,parse_constant=lambda _:reject())
    except (UnicodeError,ValueError,RecursionError):
        reject()

def exact(value, keys):
    if type(value) is not dict or set(value)!=set(keys): reject()

def normal_process(value):
    exact(value,('status','exitCode','cleanupComplete','stdoutTruncated','stderrTruncated'))
    if type(value['status']) is not str or value['status'] not in STATUSES: reject()
    code=value['exitCode']
    if code is not None and (type(code) is not int or not -2147483648<=code<=2147483647): reject()
    if any(type(value[k]) is not bool for k in ('cleanupComplete','stdoutTruncated','stderrTruncated')): reject()
    if value['status']=='SUCCESS' and code!=0: reject()
    if value['status']=='NONZERO_EXIT' and (code is None or code==0): reject()
    return value['status']=='SUCCESS' and code==0 and value['cleanupComplete'] and not value['stdoutTruncated'] and not value['stderrTruncated']

def version_output(capture, expected_executable):
    exact(capture,('process','stdout','stderr'))
    process_ok=normal_process(capture['process'])
    for key in ('stdout','stderr'):
        if type(capture[key]) is not str: reject()
        try: size=len(capture[key].encode('utf-16-le'))//2
        except UnicodeError: reject()
        if size>32768: reject()
    if not process_ok or capture['stderr']!='': return False
    lines=capture['stdout'].replace('\r\n','\n').split('\n')
    if lines and lines[-1]=='': lines.pop()
    if len(lines)!=4: return False
    if not re.fullmatch(r'Android Debug Bridge version [0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}',lines[0]): return False
    if not re.fullmatch(r'Version 37\.0\.1-[0-9]{1,20}',lines[1]): return False
    if not lines[2].startswith('Installed as '): return False
    actual=lines[2][len('Installed as '):]
    # No path is returned or used for access. Identity/custody was checked separately.
    if not actual or '\0' in actual or ntpath.normcase(actual)!=ntpath.normcase(str(expected_executable)): return False
    return re.fullmatch(r'Running on Windows [0-9]{1,8}(?:\.[0-9]{1,8}){1,3}',lines[3]) is not None

def blank():
    return {'version':1,'scope':SCOPE,'candidateSha256':ARCHIVE_SHA,'revision':'37.0.1','binaryArchitecture':'IA32','hostArchitecture':'X64','cases':{k:False for k in CASES},'process':None,'versionObserved':False,'directoryCleanup':False,'failure':None}

def normalize(value):
    keys=tuple(blank())
    exact(value,keys if 'passed' not in value else keys+('passed',))
    fixed=blank()
    for key in ('version','scope','candidateSha256','revision','binaryArchitecture','hostArchitecture'):
        if type(value[key]) is not type(fixed[key]) or value[key]!=fixed[key]: reject()
    exact(value['cases'],CASES)
    if any(type(flag) is not bool for flag in value['cases'].values()): reject()
    if any(type(value[key]) is not bool for key in ('versionObserved','directoryCleanup')): reject()
    failure=value['failure']
    if failure is not None and (type(failure) is not str or failure not in FAILURES): reject()
    process_ok=False
    if value['process'] is not None: process_ok=normal_process(value['process'])
    passed=process_ok and all(value['cases'].values()) and value['versionObserved'] and value['directoryCleanup'] and failure is None
    if 'passed' in value and (type(value['passed']) is not bool or value['passed']!=passed): reject()
    return {**{key:value[key] for key in keys},'passed':passed}

def plain(path):
    path=Path(path)
    if not path.is_absolute() or path.resolve()!=path: reject()
    for item in (path,*path.parents):
        info=item.lstat()
        if not stat.S_ISDIR(info.st_mode) or item.is_symlink() or getattr(info,'st_file_attributes',0)&0x400: reject()
    return path

def read(path,maximum=65536):
    path=Path(path);plain(path.parent);info=path.lstat()
    if not stat.S_ISREG(info.st_mode) or path.is_symlink() or getattr(info,'st_file_attributes',0)&0x400 or info.st_nlink!=1 or info.st_size>maximum: reject()
    with path.open('rb') as stream:
        raw=stream.read(maximum+1)
        after=os.fstat(stream.fileno())
    current=path.lstat()
    if len(raw)!=info.st_size or len(raw)>maximum or (info.st_dev,info.st_ino,info.st_size,info.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns) or (current.st_dev,current.st_ino)!=(info.st_dev,info.st_ino): reject()
    return raw

def write_new(path,value):
    path=Path(path);plain(path.parent)
    raw=(json.dumps(value,separators=(',',':'),ensure_ascii=True)+'\n').encode('ascii')
    if len(raw)>65536: reject()
    with path.open('xb') as output:
        output.write(raw);output.flush();os.fsync(output.fileno())
    if read(path)!=raw: reject()
    return raw

def entries(path, limit):
    names=set()
    with os.scandir(path) as items:
        for item in items:
            if len(names)>=limit: reject()
            names.add(item.name)
    return names

def candidate_at(root,token):
    from platform_tools_archive import EXPECTED_FILES, COMPLETE_NAME, _summary
    if EXPECTED_FILES is None: reject()
    folder=plain(root/'candidate');payload=plain(folder/'platform-tools')
    if entries(folder,3)!={'.owner',COMPLETE_NAME,'platform-tools'}: reject()
    if read(folder/'.owner',36)!=token.encode('ascii') or read(folder/COMPLETE_NAME,512)!=json.dumps(_summary(),sort_keys=True,separators=(',',':')).encode('ascii'): reject()
    if entries(payload,14)!={Path(n).name for n in EXPECTED_FILES}: reject()
    for name,(size,digest) in EXPECTED_FILES.items():
        raw=read(folder/name,size)
        if len(raw)!=size or hashlib.sha256(raw).hexdigest()!=digest: reject()
    return True

def stage(root):
    root=plain(Path(root))
    if root.parent.name!='.platform-tools-runtime' or not root.name.startswith('run-') or not UUID.fullmatch(root.name[4:]): reject()
    token=read(root/'.owner',36).decode('ascii')
    if not UUID.fullmatch(token): reject()
    admission=parse(read(root/'admission.json'))
    exact(admission,('version','runToken','sources','candidateManifestSha256'))
    if type(admission['version']) is not int or admission['version']!=1 or admission['runToken']!=token: reject()
    exact(admission['sources'],SOURCES)
    desktop=Path(__file__).resolve().parent.parent
    for name in SOURCES:
        if admission['sources'][name]!=hashlib.sha256(read((desktop/name).resolve())).hexdigest(): reject()
    if admission['candidateManifestSha256']!=hashlib.sha256(read(desktop/'verification/platform-tools-candidate.json')).hexdigest(): reject()
    preflight=parse(read(root/'preflight.json'));exact(preflight,PREFLIGHT)
    if any(type(v) is not bool for v in preflight.values()): reject()
    capture=parse(read(root/'capture.json'));observed=version_output(capture,root/'candidate/platform-tools/adb.exe')
    candidate_at(root,token)
    profile=plain(root/'profile')
    with os.scandir(profile) as entries:
        if next(entries,None) is not None: reject()
    value=blank();value['cases'].update(preflight)
    for name in ('archiveVerified','profileUnchanged','candidateUnchanged','commandVersionOnly'): value['cases'][name]=True
    value['process']=capture['process'];value['versionObserved']=observed
    if not normal_process(capture['process']): value['failure']='PROCESS_FAILED'
    elif not observed: value['failure']='VERSION_REJECTED'
    elif not all(preflight.values()): value['failure']='PREFLIGHT_FAILED'
    result=normalize(value)
    if read(root/'.owner',36)!=token.encode('ascii'): reject()
    write_new(root/'public.json',result)
    return result

def publish(source,output):
    value=normalize(parse(read(Path(source))))
    write_new(Path(output),value)
    return value

def main(argv=None):
    import sys
    args=sys.argv[1:] if argv is None else argv
    try:
        if len(args)==2 and args[0]=='stage':
            value=stage(args[1]);print('PLATFORM_TOOLS_STAGE_VALIDATED')
            return 0 if value['versionObserved'] and value['failure'] is None else 1
        if len(args)==3 and args[0]=='publish':
            value=publish(args[1],args[2]);print('PLATFORM_TOOLS_VALIDATION_WRITTEN')
            print('PLATFORM_TOOLS_HOSTED_PASS' if value['passed'] else 'PLATFORM_TOOLS_HOSTED_FAIL')
            return 0 if value['passed'] else 1
        reject()
    except (ValueError,OSError,UnicodeError,TypeError,KeyError,RecursionError):
        print('PLATFORM_TOOLS_VALIDATION_REJECTED');return 1
if __name__=='__main__':
    raise SystemExit(main())
