"""Fixed derived scrcpy/consumer build custody. Never executes a compiler or payload.

The trusted Windows wrapper alone supervises the five fixed process plans. This module
measures source/tools/output, retains uncertainty, and never admits a runtime pair.
"""
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import stat
import struct
import sys
import tarfile
import uuid
import zipfile
import zlib
from urllib.request import Request, build_opener, HTTPRedirectHandler

BASE = Path(__file__).resolve().parents[1]
PACKET = BASE / 'video-source'
COMMIT = 'a60891aea193d92e7e5c3942700eca63f9d19a5f'
TREE = 'eb740a30415199219479610728420ebcfd8a9064'
URL = 'https://codeload.github.com/Genymobile/scrcpy/tar.gz/' + COMMIT
ARCHIVE_SHA = 'a0d699fc7388b8252416c49e6293639de39ab76a03e7302ddced56c284d45200'
ARCHIVE_BYTES = 513746
SELECTED_SHA = 'f96d6623e1e7ae129a398d8886a5676b47e85b64c40075e5740d9cbf7f036e29'
FULL_SHA = '94c62a3f7586e56da49e4a66612e0860d7ca4d8efdca46f4673a7dc195e7749e'
PROTOCOL = 'AUTO_SCRCPY_5_0_1_VIDEO_NONCE_V1'
SCOPE = 'DERIVED_SCRCPY_PAIR_COMPILE_ONLY'
STAGES = ('aidlClipboard', 'aidlDisplay', 'javac', 'd8', 'consumerCsc')
NATIVE = tuple('native/' + n + '.cs' for n in ('IsolatedAdbServer', 'RetainedAdbSession', 'RetainedAdbProtocol', 'RetainedHostAdmission', 'RetainedVideoSession'))
TOOL_KEYS = {'JDK17': 'jdkRoot', 'ANDROID36': 'platformRoot', 'BUILD_TOOLS36': 'buildToolsRoot', 'FRAMEWORK64': 'frameworkRoot'}
TOOL_FILES = {'JDK17': ('bin/java.exe', 'bin/javac.exe', 'release'), 'ANDROID36': ('android.jar', 'framework.aidl', 'source.properties'), 'BUILD_TOOLS36': ('aidl.exe', 'lib/d8.jar', 'core-lambda-stubs.jar', 'source.properties'), 'FRAMEWORK64': ('csc.exe', 'mscorlib.dll', 'System.dll', 'System.Core.dll')}
CONTEXT_KEYS = ('version', 'autoCommit', 'autoTree', 'runnerImage', 'jdkRoot', 'platformRoot', 'buildToolsRoot', 'frameworkRoot', 'jdkVersion', 'jdkVendor', 'platformRevision', 'buildToolsVersion', 'consumerCompilerVersion')
PROCESS_KEYS = ('status', 'exitCode', 'cleanupComplete', 'stdoutTruncated', 'stderrTruncated')
FAILURES = ('SOURCE_REJECTED', 'PATCH_REJECTED', 'TOOLS_UNAVAILABLE', 'TOOLS_REJECTED', 'COMPILE_FAILED', 'OUTPUT_REJECTED', 'UNRETIRED', 'CLEANUP_FAILED', 'INTERNAL_FAILURE')
EVIDENCE_CAPS = {'source.json':262144, 'tools.json':8388608, 'dependencies.json':524288, 'generated.json':2097152, 'commands.json':262144, 'outputs.json':1048576, 'server-build.json':8192, 'consumer-build.json':8192}
BUILD_CONFIG = b'package com.genymobile.scrcpy;\n\npublic final class BuildConfig {\n  public static final boolean DEBUG = false;\n  public static final String VERSION_NAME = "5.0.1";\n}\n'
PACKAGES = ('android/content', 'android/view', 'com/genymobile/scrcpy', *('com/genymobile/scrcpy/' + x for x in ('audio','control','device','display','model','opengl','util','video','wrappers')))


def fail(code='SOURCE_REJECTED'):
    raise ValueError(code if code in FAILURES else 'INTERNAL_FAILURE')


def sha(raw): return hashlib.sha256(raw).hexdigest()
def canonical(value): return json.dumps(value, ensure_ascii=True, separators=(',', ':'), allow_nan=False).encode('ascii')


def unique(pairs):
    value = {}
    for key, item in pairs:
        if key in value: fail()
        value[key] = item
    return value


def parse(raw, maximum=262144):
    if type(raw) is not bytes or not 0 < len(raw) <= maximum: fail()
    try: return json.loads(raw.decode('utf-8'), object_pairs_hook=unique, parse_constant=lambda _:fail())
    except (UnicodeError, RecursionError, json.JSONDecodeError): fail()


def exact(value, keys):
    if type(value) is not dict or tuple(value) != tuple(keys): fail()


def hexhash(value, size=64):
    return type(value) is str and re.fullmatch('[0-9a-f]{%d}' % size, value) is not None


def relative(value):
    if type(value) is not str or not 0 < len(value) <= 512 or not value.isascii() or '\\' in value or ':' in value: fail()
    parts = value.split('/')
    if len(parts) > 16: fail()
    for part in parts:
        if not part or part in ('.','..') or part[-1] in '. ' or any(ord(c)<32 or ord(c)==127 for c in part): fail()
        if re.fullmatch(r'(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?',part,re.I): fail()
    return value


def identity(s): return (s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)


def plain(path, directory=False):
    path=Path(path)
    if not path.is_absolute() or path.resolve()!=path: fail()
    s=path.lstat()
    if path.is_symlink() or getattr(s,'st_file_attributes',0)&0x400 or not (stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode)): fail()
    for parent in path.parents:
        ps=parent.lstat()
        if parent.is_symlink() or getattr(ps,'st_file_attributes',0)&0x400 or not stat.S_ISDIR(ps.st_mode): fail()
    return s


def read(path, maximum, owned=True):
    path=Path(path); initial=plain(path)
    if initial.st_size > maximum or (owned and initial.st_nlink!=1): fail()
    fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    try:
        before=os.fstat(fd)
        if identity(before)!=identity(initial): fail()
        data=bytearray()
        while len(data)<=before.st_size:
            chunk=os.read(fd,min(65536,before.st_size+1-len(data)))
            if not chunk: break
            data.extend(chunk)
        if len(data)!=before.st_size or identity(before)!=identity(os.fstat(fd)) or identity(before)!=identity(plain(path)): fail()
        return bytes(data)
    finally: os.close(fd)


def digest_file(path, maximum, owned=False):
    s=plain(path)
    if s.st_size>maximum or (owned and s.st_nlink!=1): fail()
    fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0)); h=hashlib.sha256(); count=0
    try:
        if identity(s)!=identity(os.fstat(fd)): fail()
        while count<=s.st_size:
            b=os.read(fd,min(65536,s.st_size+1-count))
            if not b: break
            count+=len(b);h.update(b)
        if count!=s.st_size or identity(s)!=identity(os.fstat(fd)) or identity(s)!=identity(plain(path)): fail()
    finally: os.close(fd)
    return {'bytes':s.st_size,'sha256':h.hexdigest()}


def write_new(path, raw, maximum):
    if type(raw) is not bytes or len(raw)>maximum: fail()
    plain(Path(path).parent,True)
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    try:
        view=memoryview(raw)
        while view:
            n=os.write(fd,view)
            if n<=0: fail()
            view=view[n:]
        os.fsync(fd)
    finally: os.close(fd)
    if read(path,maximum)!=raw: fail()


def write_json(path,value,maximum=262144): write_new(path,canonical(value),maximum)


def ensure_dirs(root, rel):
    cursor=Path(root)
    for part in relative(rel).split('/'):
        cursor/=part
        if not cursor.exists(): cursor.mkdir(mode=0o700)
        plain(cursor,True)
    return cursor


def inventory(root, namespace, max_files=10000, max_bytes=2*1024**3, per_file=256*1024**2, owned=False, combined_entries=None):
    root=Path(root);plain(root,True);rows=[];seen=set();total=0;count=0
    for parent,dirs,files in os.walk(root,followlinks=False):
        dirs.sort();files.sort()
        for name in dirs+files:
            child=Path(parent)/name; rel=relative(child.relative_to(root).as_posix());fold=rel.lower();count+=1
            if combined_entries is not None:
                combined_entries[0]+=1
                if combined_entries[0]>max_files:fail('TOOLS_REJECTED')
            if count>max_files or fold in seen: fail()
            seen.add(fold)
            if name in dirs: plain(child,True)
            else:
                measured=digest_file(child,per_file,owned);total+=measured['bytes']
                if total>max_bytes: fail()
                rows.append({'namespace':namespace,'path':rel,**measured})
    return sorted(rows,key=lambda r:(r['namespace'],r['path']))


def packet():
    full_raw=read(PACKET/'verified-full-source-manifest.json',100000)
    selected_raw=read(PACKET/'verified-selected-source-manifest.json',32768)
    if sha(full_raw)!=FULL_SHA or sha(selected_raw)!=SELECTED_SHA: fail()
    full=parse(full_raw);selected=parse(selected_raw)
    if len(full['files'])!=387 or len(selected['files'])!=95: fail()
    return full,selected


def inspect_archive(path):
    raw=read(path,4*1024**2)
    if len(raw)!=ARCHIVE_BYTES or sha(raw)!=ARCHIVE_SHA: fail()
    decoder=zlib.decompressobj(31);tar=decoder.decompress(raw,4*1024**2+1)
    if len(tar)!=2242560 or not decoder.eof or decoder.unconsumed_tail or decoder.unused_data: fail()
    full,selected=packet(); expected={r['path']:r for r in full['files']};root='scrcpy-'+COMMIT
    directories={root}
    for rel in expected:
        parts=rel.split('/')
        directories.update(root+'/'+'/'.join(parts[:n]) for n in range(1,len(parts)))
    observed=set();files={}
    with tarfile.open(fileobj=io.BytesIO(tar),mode='r:') as archive:
        members=archive.getmembers()
        if len(members)!=447 or archive.pax_headers!={'comment':COMMIT}: fail()
        for member in members:
            name=member.name.rstrip('/');relative(name)
            if name.lower() in observed or member.pax_headers!={'comment':COMMIT} or member.mode&0o7000: fail()
            observed.add(name.lower())
            if member.isdir():
                if name not in directories or member.mode!=0o775: fail()
                continue
            if not member.isreg() or not name.startswith(root+'/'): fail()
            rel=name[len(root)+1:];row=expected.get(rel)
            if row is None or member.size!=row['bytes'] or member.size>262144 or format(member.mode,'04o')!=row['tarMode']: fail()
            f=archive.extractfile(member);data=f.read(member.size+1)
            if len(data)!=member.size or sha(data)!=row['sha256'] or hashlib.sha1(('blob '+str(len(data))+'\0').encode()+data).hexdigest()!=row['gitBlobSha1']: fail()
            files[rel]=data
    if set(files)!=set(expected) or len(observed)!=len(expected)+len(directories): fail()
    return {r['path']:files[r['path']] for r in selected['files']},files['README.md']


def apply_patch(files):
    provenance=parse(read(PACKET/'source-provenance.json',32768));patch=read(PACKET/'auto-video-nonce-v1.patch',65536)
    if sha(patch)!=provenance['patchSha256'] or provenance['upstreamCommit']!=COMMIT: fail('PATCH_REJECTED')
    lines=patch.decode('utf-8').splitlines(keepends=True);i=0;changed=set();result=dict(files)
    allowed={r['path']:r for r in provenance['files']}
    while i<len(lines):
        if not lines[i].startswith('--- a/'): fail('PATCH_REJECTED')
        name=lines[i][6:].rstrip('\n');i+=1
        if i>=len(lines) or lines[i]!='+++ b/'+name+'\n' or name not in allowed or name in changed: fail('PATCH_REJECTED')
        i+=1;changed.add(name);row=allowed[name];original=files[name]
        if len(original)!=row['upstreamBytes'] or sha(original)!=row['upstreamSha256']: fail('PATCH_REJECTED')
        src=original.decode('utf-8').splitlines(keepends=True);out=[];cursor=0
        while i<len(lines) and lines[i].startswith('@@ '):
            match=re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@[^\n]*\n',lines[i])
            if not match: fail('PATCH_REJECTED')
            old=int(match[1])-1;oldcount=int(match[2] or '1');newcount=int(match[4] or '1');i+=1
            if old<cursor or old>len(src): fail('PATCH_REJECTED')
            out.extend(src[cursor:old]);cursor=old;removed=added=0
            if len(out)!=int(match[3])-1: fail('PATCH_REJECTED')
            while i<len(lines) and lines[i][:1] in (' ','+','-') and not lines[i].startswith('--- a/'):
                line=lines[i];i+=1
                if line[0] in ' -':
                    if cursor>=len(src) or src[cursor]!=line[1:]: fail('PATCH_REJECTED')
                    cursor+=1;removed+=1
                if line[0] in ' +':out.append(line[1:]);added+=1
            if removed!=oldcount or added!=newcount: fail('PATCH_REJECTED')
        out.extend(src[cursor:]);data=''.join(out).encode()
        if len(data)!=row['derivedBytes'] or sha(data)!=row['derivedSha256']: fail('PATCH_REJECTED')
        result[name]=data
    if changed!={r['path'] for r in provenance['files'] if r['modified']}: fail('PATCH_REJECTED')
    return result,provenance['patchSha256']


def owner(root):
    root=Path(root);s=plain(root,True);raw=read(root/'.owner',36)
    if re.fullmatch(b'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',raw) is None: fail()
    return raw.decode(),(s.st_dev,s.st_ino)


def context_value(path):
    c=parse(read(path,8192));exact(c,CONTEXT_KEYS)
    if type(c['version']) is not int or c['version']!=1 or not hexhash(c['autoCommit'],40) or not hexhash(c['autoTree'],40): fail()
    if re.fullmatch(r'win22/[0-9.]{1,58}',c['runnerImage']) is None or c['jdkVendor'] not in ('MICROSOFT','TEMURIN','ORACLE','OTHER'): fail('TOOLS_REJECTED')
    for k in ('jdkVersion','platformRevision','buildToolsVersion','consumerCompilerVersion'):
        if type(c[k]) is not str or re.fullmatch(r'[0-9A-Za-z.+_-]{1,64}',c[k]) is None: fail('TOOLS_REJECTED')
    if not c['jdkVersion'].startswith('17.') or c['buildToolsVersion']!='36.0.0' or re.fullmatch(r'[0-9]+(?:\.[0-9]+){1,3}',c['consumerCompilerVersion']) is None: fail('TOOLS_REJECTED')
    for key in TOOL_KEYS.values():plain(Path(c[key]),True)
    if len({os.path.normcase(c[k]) for k in TOOL_KEYS.values()})!=4: fail('TOOLS_REJECTED')
    return c


def tools_snapshot(c):
    rows=[];count=0;total=0;entries=[0]
    for ns,key in TOOL_KEYS.items():
        root=Path(c[key]);part=inventory(root,ns,combined_entries=entries);rows.extend(part);count+=len(part);total+=sum(r['bytes'] for r in part)
        if count>10000 or total>2*1024**3:fail('TOOLS_REJECTED')
        names={r['path'] for r in part}
        if not set(TOOL_FILES[ns])<=names:fail('TOOLS_UNAVAILABLE')
    release=read(Path(c['jdkRoot'])/'release',65536,False).decode('utf-8')
    if 'JAVA_VERSION="'+c['jdkVersion']+'"' not in release.splitlines():fail('TOOLS_REJECTED')
    def props(file):
        data=read(file,65536,False).decode('utf-8');v={}
        for line in data.splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                k,val=line.split('=',1);k=k.strip()
                if k in v:fail('TOOLS_REJECTED')
                v[k]=val.strip()
        return v
    a=props(Path(c['platformRoot'])/'source.properties');b=props(Path(c['buildToolsRoot'])/'source.properties')
    if a.get('AndroidVersion.ApiLevel')!='36' or a.get('Pkg.Revision')!=c['platformRevision'] or b.get('Pkg.Revision')!='36.0.0':fail('TOOLS_REJECTED')
    return {'version':1,'runnerImage':c['runnerImage'],'jdkVersion':c['jdkVersion'],'jdkVendor':c['jdkVendor'],'platformApi':36,'platformRevision':c['platformRevision'],'buildToolsVersion':'36.0.0','consumerCompilerVersion':c['consumerCompilerVersion'],'files':sorted(rows,key=lambda r:(r['namespace'],r['path']))}


def runner_closure():
    paths=('verification/derived_pair_build.py','verification/validate_derived_pair_build.py',
           'verification/Invoke-DerivedPairBuild.ps1','verification/WindowsBoundary.psm1',
           'verification/OwnedFiles.psm1',*NATIVE)
    paths+=tuple('video-source/'+name for name in ('verified-full-source-manifest.json','verified-selected-source-manifest.json','source-provenance.json','auto-video-nonce-v1.patch'))
    return [{'path':name,**digest_file(BASE/name,1048576)} for name in paths]+[{'path':'HOST_PROBE_NATIVE',**digest_file(BASE.parent/'tools/phase-00/HostProbeNative.cs',1048576)}]


def prepare(root,archive,context):
    root=Path(root);token,ident=owner(root)
    permitted={'.owner'}
    if Path(archive)==root/'upstream.tar.gz':permitted.add('upstream.tar.gz')
    if {p.name for p in root.iterdir()}!=permitted:fail()
    c=context_value(context);files,readme=inspect_archive(archive);derived,patchsha=apply_patch(files);tools=tools_snapshot(c)
    for name in ('source','generated','classes','output','private','evidence'): (root/name).mkdir(mode=0o700)
    for name in ('java-home','java-tmp'): (root/'private'/name).mkdir(mode=0o700)
    write_json(root/'private/context.json',c,8192)
    for name,data in derived.items():
        target=root/'source'/name;ensure_dirs(root/'source',str(Path(name).parent).replace('\\','/')) if '/' in name else None
        write_new(target,data,65536)
    for name in NATIVE:
        target=root/'source'/'consumer'/name;ensure_dirs(root/'source','consumer/native');write_new(target,read(BASE/name,1048576),1048576)
    ensure_dirs(root/'generated','com/genymobile/scrcpy');write_new(root/'generated/com/genymobile/scrcpy/BuildConfig.java',BUILD_CONFIG,4096)
    write_new(root/'private/README.md',readme,262144)
    _,selected=packet();upstream=[{k:r[k] for k in ('path','bytes','gitBlobSha1','sha256')} for r in selected['files']]
    effective=[{'namespace':'SERVER','path':n,'bytes':len(data),'sha256':sha(data)} for n,data in derived.items()]
    effective.extend({'namespace':'CONSUMER','path':n,**digest_file(root/'source/consumer'/n,1048576,True)} for n in NATIVE)
    effective.sort(key=lambda r:(r['namespace'],r['path']))
    source={'version':1,'upstreamCommit':COMMIT,'upstreamTree':TREE,'autoCommit':c['autoCommit'],'autoTree':c['autoTree'],'archiveSha256':ARCHIVE_SHA,'selectionManifestSha256':SELECTED_SHA,'patchSha256':patchsha,'upstream':upstream,'effective':effective}
    state={'version':1,'owner':token,'rootIdentity':list(ident),'context':c,'source':source,'tools':tools,'runnerClosure':runner_closure()}
    write_json(root/'private/admission.json',state,9*1024**2)
    write_json(root/'evidence/source.json',source,EVIDENCE_CAPS['source.json']);write_json(root/'evidence/tools.json',tools,EVIDENCE_CAPS['tools.json'])
    return state


def load(root):
    root=Path(root);token,ident=owner(root);s=parse(read(root/'private/admission.json',9*1024**2),9*1024**2)
    if s['owner']!=token or s['rootIdentity']!=list(ident):fail()
    return s


def revalidate(root):
    root=Path(root);s=load(root)
    if runner_closure()!=s['runnerClosure']:fail('SOURCE_REJECTED')
    expected=s['source']['effective'];actual=[]
    for r in expected:
        file=root/'source'/('consumer' if r['namespace']=='CONSUMER' else '')/r['path'];actual.append({'namespace':r['namespace'],'path':r['path'],**digest_file(file,1048576,True)})
    if actual!=expected:fail('SOURCE_REJECTED')
    allfiles=inventory(root/'source','SOURCE',2048,16*1024**2,1048576,True)
    if len(allfiles)!=100:fail('SOURCE_REJECTED')
    if tools_snapshot(s['context'])!=s['tools']:fail('TOOLS_REJECTED')
    return s


def process_value(raw):
    p=parse(raw,4096);exact(p,PROCESS_KEYS)
    if p['status'] not in ('SUCCESS','EMPTY_OUTPUT','NONZERO_EXIT','TIMEOUT','LAUNCH_FAILED','ACCESS_DENIED','CAPTURE_FAILED','CLEANUP_FAILED'):fail('COMPILE_FAILED')
    if p['exitCode'] is not None and (type(p['exitCode']) is not int or not -2147483648<=p['exitCode']<=2147483647):fail('COMPILE_FAILED')
    if any(type(p[k]) is not bool for k in PROCESS_KEYS[2:]):fail('COMPILE_FAILED')
    return p


def successful(p):return p['status'] in ('SUCCESS','EMPTY_OUTPUT') and p['exitCode']==0 and p['cleanupComplete'] and not p['stdoutTruncated'] and not p['stderrTruncated']
def retired(p):return p['status'] in ('SUCCESS','EMPTY_OUTPUT','NONZERO_EXIT') and p['exitCode'] is not None and p['cleanupComplete']


def generated(root):
    rows=inventory(Path(root)/'generated','GENERATED',2048,32*1024**2,32*1024**2,True)+inventory(Path(root)/'classes','CLASSES',2048,32*1024**2,32*1024**2,True)
    if len(rows)>2048 or sum(r['bytes'] for r in rows)>32*1024**2:fail('OUTPUT_REJECTED')
    return {'version':1,'files':sorted(rows,key=lambda r:(r['namespace'],r['path']))}


def quote_windows(value):
    # Exact unchanged HostProbeNative.QuoteArgument algorithm, not shell quoting.
    if '\0' in value:fail('COMPILE_FAILED')
    out='"';slashes=0
    for char in value:
        if char=='\\':slashes+=1;continue
        out+='\\'*(slashes*2+1 if char=='"' else slashes)+char;slashes=0
    return out+'\\'*(slashes*2)+'"'


def make_plan(root,stage,state):
    if stage not in STAGES:fail()
    root=Path(root);c=state['context'];tokens={'SOURCE':root/'source','GENERATED':root/'generated','CLASSES':root/'classes','OUTPUT':root/'output','PRIVATE':root/'private',**{ns:Path(c[k]) for ns,k in TOOL_KEYS.items()}}
    t=lambda ns,p:'${'+ns+'}/'+p
    if stage.startswith('aidl'):
        ns='BUILD_TOOLS36';exe='aidl.exe';args=['-o'+t('GENERATED',''),'-I'+t('SOURCE','server/src/main/aidl')]
        if stage=='aidlDisplay':args+=['-p',t('ANDROID36','framework.aidl')]
        args+=[t('SOURCE','server/src/main/aidl/android/'+('content/IOnPrimaryClipChangedListener.aidl' if stage=='aidlClipboard' else 'view/IDisplayWindowListener.aidl'))];deadline=30000
    elif stage=='javac':
        ns='JDK17';exe='bin/javac.exe';args=['-J-Xmx512m','-J-Duser.home='+t('PRIVATE','java-home'),'-J-Djava.io.tmpdir='+t('PRIVATE','java-tmp'),'-proc:none','-encoding','UTF-8','-bootclasspath',t('ANDROID36','android.jar'),'-cp',t('BUILD_TOOLS36','core-lambda-stubs.jar')+';'+t('GENERATED',''),'-d',t('CLASSES',''),'-source','1.8','-target','1.8']
        args += [t('SOURCE',r['path']) for r in state['source']['effective'] if r['namespace']=='SERVER' and r['path'].endswith('.java')];deadline=120000
    elif stage=='d8':
        ns='JDK17';exe='bin/java.exe';args=['-Xmx512m','-Duser.home='+t('PRIVATE','java-home'),'-Djava.io.tmpdir='+t('PRIVATE','java-tmp'),'-cp',t('BUILD_TOOLS36','lib/d8.jar'),'com.android.tools.r8.D8','--classpath',t('ANDROID36','android.jar'),'--output',t('OUTPUT','classes.zip')]
        classes=inventory(root/'classes','CLASSES',2048,32*1024**2,32*1024**2,True)
        if not classes:fail('OUTPUT_REJECTED')
        for r in classes:
            if not r['path'].endswith('.class') or str(Path(r['path']).parent).replace('\\','/') not in PACKAGES:fail('OUTPUT_REJECTED')
        args += [t('CLASSES',r['path']) for r in classes];deadline=120000
    else:
        ns='FRAMEWORK64';exe='csc.exe';args=['/noconfig','/nostdlib+','/nologo','/target:library','/platform:x64','/optimize+','/out:'+t('OUTPUT','RetainedVideoConsumer.dll')]
        args += ['/reference:'+t('FRAMEWORK64',n) for n in ('mscorlib.dll','System.dll','System.Core.dll')]
        args += [t('SOURCE','consumer/'+n) for n in NATIVE];deadline=30000
    def expand(arg):
        for name,path in tokens.items():arg=arg.replace('${'+name+'}/',str(path)+os.sep)
        return arg
    actual=[expand(arg) for arg in args];executable=str(Path(c[TOOL_KEYS[ns]])/exe)
    if len(' '.join(quote_windows(x) for x in [executable,*actual]).encode('utf-16-le'))//2>30000:fail('COMPILE_FAILED')
    invocation={'executable':executable,'workingDirectory':str(Path(executable).parent),'arguments':actual}
    public={'stage':stage,'executable':{'namespace':ns,'path':exe},'workingDirectory':'EXECUTABLE_DIRECTORY','arguments':args,'actualInvocationSha256':sha(canonical(invocation))}
    private={'version':1,'stage':stage,'executable':executable,'arguments':actual,'deadlineMs':deadline,'workingDirectory':'EXECUTABLE_DIRECTORY'}
    return private,public


def plan(root,stage):
    root=Path(root);s=revalidate(root)
    if stage not in STAGES:fail()
    for prior in STAGES[:STAGES.index(stage)]:
        if not successful(process_value(read(root/('private/process-'+prior+'.json'),4096))):fail('COMPILE_FAILED')
    private,public=make_plan(root,stage,s)
    write_json(root/('private/plan-'+stage+'.json'),private)
    write_json(root/('private/command-'+stage+'.json'),public)
    return private


def verify(root,stage):
    s=revalidate(root)
    stored=parse(read(Path(root)/('private/plan-'+stage+'.json'),262144))
    if make_plan(root,stage,s)[0]!=stored:fail('COMPILE_FAILED')
    return True


def inspect_dex(data):
    if not 112<=len(data)<=16*1024**2 or data[:8] not in [b'dex\n'+v+b'\0' for v in (b'035',b'037',b'038',b'039',b'040')]:fail('OUTPUT_REJECTED')
    u=lambda off:struct.unpack_from('<I',data,off)[0]
    if u(32)!=len(data) or u(36)!=112 or u(40)!=0x12345678 or u(8)!=zlib.adler32(data[12:])&0xffffffff or data[12:32]!=hashlib.sha1(data[32:]).digest():fail('OUTPUT_REJECTED')
    def table(count,offset,size,cap):
        if count>cap or (count and (offset<112 or offset+count*size>len(data))):fail('OUTPUT_REJECTED')
    strings,so=u(56),u(60);types,to=u(64),u(68);classes,co=u(96),u(100)
    table(strings,so,4,65536);table(types,to,4,65536);table(classes,co,32,2048)
    if not classes:fail('OUTPUT_REJECTED')
    descriptors=[]
    for i in range(classes):
        idx=u(co+i*32)
        if idx>=types:fail('OUTPUT_REJECTED')
        stridx=u(to+4*idx)
        if stridx>=strings:fail('OUTPUT_REJECTED')
        off=u(so+4*stridx);count=0;shift=0
        for _ in range(5):
            if off>=len(data):fail('OUTPUT_REJECTED')
            b=data[off];off+=1;count|=(b&127)<<shift;shift+=7
            if not b&128:break
        else:fail('OUTPUT_REJECTED')
        if not 1<=count<=256 or off+count>=len(data) or data[off+count]!=0:fail('OUTPUT_REJECTED')
        try:name=data[off:off+count].decode('ascii')
        except UnicodeError:fail('OUTPUT_REJECTED')
        if re.fullmatch(r'L(?:[A-Za-z_$][A-Za-z0-9_$]*/)*[A-Za-z_$][A-Za-z0-9_$]*;',name) is None:fail('OUTPUT_REJECTED')
        package=name[1:-1].rsplit('/',1)[0]
        if package not in PACKAGES:fail('OUTPUT_REJECTED')
        descriptors.append(name)
    if len(set(descriptors))!=len(descriptors):fail('OUTPUT_REJECTED')
    descriptors.sort();counts={}
    for name in descriptors:
        ns=name[1:-1].rsplit('/',1)[0].replace('/','.');counts[ns]=counts.get(ns,0)+1
    return descriptors,[{'prefix':k,'count':v} for k,v in sorted(counts.items())]


def inspect_pe(data):
    if not 256<=len(data)<=8388608 or data[:2]!=b'MZ':fail('OUTPUT_REJECTED')
    pe=struct.unpack_from('<I',data,60)[0]
    if pe+264>len(data) or data[pe:pe+4]!=b'PE\0\0':fail('OUTPUT_REJECTED')
    machine,sections=struct.unpack_from('<HH',data,pe+4);optional,flags=struct.unpack_from('<HH',data,pe+20)
    if machine!=34404 or not 1<=sections<=96 or optional<240 or not flags&0x2000:fail('OUTPUT_REJECTED')
    op=pe+24
    if struct.unpack_from('<H',data,op)[0]!=523 or op+optional+sections*40>len(data) or struct.unpack_from('<I',data,op+108)[0]<15:fail('OUTPUT_REJECTED')
    regions=[]
    for i in range(sections):
        off=op+optional+i*40;vs,va,rs,rp=struct.unpack_from('<IIII',data,off+8)
        if rs and (rp+rs>len(data) or rp<op+optional+sections*40):fail('OUTPUT_REJECTED')
        regions.append((va,rs,rp))
    def map_rva(rva,size):
        matches=[rp+rva-va for va,rs,rp in regions if va<=rva and size<=rs-(rva-va)]
        if len(matches)!=1:fail('OUTPUT_REJECTED')
        return matches[0]
    cli_rva,cli_size=struct.unpack_from('<II',data,op+112+14*8)
    if cli_size<72:fail('OUTPUT_REJECTED')
    cli=map_rva(cli_rva,cli_size)
    cb,major,minor,mrva,msize,cflags,entry=struct.unpack_from('<IHHIIII',data,cli)
    if cb<72 or cb>cli_size or not cflags&1 or cflags&0x12 or entry!=0 or msize<24:fail('OUTPUT_REJECTED')
    md=map_rva(mrva,msize)
    if data[md:md+4]!=b'BSJB':fail('OUTPUT_REJECTED')
    vl=struct.unpack_from('<I',data,md+12)[0]
    if not 1<=vl<=256 or 16+vl+4>msize:fail('OUTPUT_REJECTED')
    cursor=md+16+vl;_,streams=struct.unpack_from('<HH',data,cursor);cursor+=4
    if not 1<=streams<=16:fail('OUTPUT_REJECTED')
    names=set();ranges=[]
    for _ in range(streams):
        if cursor+9>md+msize:fail('OUTPUT_REJECTED')
        off,size=struct.unpack_from('<II',data,cursor);cursor+=8;end=data.find(b'\0',cursor,min(cursor+32,md+msize))
        if end<0:fail('OUTPUT_REJECTED')
        name=data[cursor:end]
        if name in names or not name or off+size>msize:fail('OUTPUT_REJECTED')
        names.add(name);ranges.append((off,off+size));cursor+=((end-cursor+1+3)//4)*4
    if b'#Strings' not in names or not ({b'#~',b'#-'}&names):fail('OUTPUT_REJECTED')
    for a,b in ranges:
        if a<cursor-md or any(c<b and a<d for c,d in ranges if (c,d)!=(a,b)):fail('OUTPUT_REJECTED')
    return {'machine':34404,'optionalMagic':523}


def inspect_outputs(root):
    root=Path(root);raw=read(root/'output/classes.zip',8388608)
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        infos=z.infolist()
        if len(infos)!=1:fail('OUTPUT_REJECTED')
        info=infos[0]
        if info.filename!='classes.dex' or info.flag_bits&~0x808 or info.file_size>16*1024**2 or info.compress_type not in (0,8) or stat.S_ISLNK(info.external_attr>>16):fail('OUTPUT_REJECTED')
        with z.open(info) as f:data=f.read(16*1024**2+1)
        if len(data)!=info.file_size or zlib.crc32(data)&0xffffffff!=info.CRC:fail('OUTPUT_REJECTED')
    descriptors,namespaces=inspect_dex(data)
    dll=read(root/'output/RetainedVideoConsumer.dll',8388608);pe=inspect_pe(dll)
    if {p.name for p in (root/'output').iterdir()}!={'classes.zip','RetainedVideoConsumer.dll'}:fail('OUTPUT_REJECTED')
    server={'name':'server.jar','bytes':len(raw),'sha256':sha(raw),'entries':[{'name':'classes.dex','bytes':len(data),'sha256':sha(data)}]}
    consumer={'name':'RetainedVideoConsumer.dll','bytes':len(dll),'sha256':sha(dll),**pe}
    return {'version':1,'server':server,'consumer':consumer,'dexClasses':descriptors,'dexNamespaces':namespaces},raw,dll


def dependencies(state,root):
    rows=[]
    for row in state['source']['effective']:
        if row['namespace']=='SERVER':
            role='BUNDLED_SOURCE' if row['path'].endswith(('.java','.aidl')) else 'BUILD_TOOL'
            rows.append({**row,'role':role,'license':'APACHE_2_0' if not row['path'].endswith('.java') else 'UNRESOLVED'})
    full,_=packet();readme=next(r for r in full['files'] if r['path']=='README.md')
    if sha(read(Path(root)/'private/README.md',262144))!=readme['sha256']:fail()
    rows.append({'namespace':'FULL_SOURCE','path':'README.md','bytes':readme['bytes'],'sha256':readme['sha256'],'role':'BUNDLED_SOURCE','license':'APACHE_2_0'})
    for row in state['tools']['files']:
        name=row['path'].lower()
        if row['path'] in TOOL_FILES[row['namespace']] or 'license' in name or 'notice' in name or 'copyright' in name:
            role='COMPILE_ONLY' if row['path'] in ('android.jar','core-lambda-stubs.jar','framework.aidl') else 'BUILD_TOOL'
            rows.append({**row,'role':role,'license':'UNRESOLVED'})
    if len(rows)>512:fail('TOOLS_REJECTED')
    return {'version':1,'entries':sorted(rows,key=lambda r:(r['namespace'],r['path']))}


def blank_report(context=None):
    c=context or {};r={'version':1,'scope':SCOPE,'sourceCommit':COMMIT,'sourceTree':TREE,'autoSourceCommit':c.get('autoCommit'),'autoSourceTree':c.get('autoTree'),'sourceArchiveSha256':ARCHIVE_SHA,'sourceManifestSha256':SELECTED_SHA,'sourceEvidenceSha256':None,'patchSha256':None,'effectiveManifestSha256':None,'generatedInputsSha256':None,'toolchainManifestSha256':None,'dependenciesManifestSha256':None,'buildCommandSha256':None,'outputsManifestSha256':None,'serverBuildManifestSha256':None,'consumerBuildManifestSha256':None,**{stage:None for stage in STAGES},'serverOutput':None,'consumerOutput':None,'sourceUnchanged':False,'toolsUnchanged':False,'outputInspected':False,'directoryCleanup':False,'failure':None,'passed':False}
    return r


def closed_layout(root,state):
    """Only fixed producer names and admitted package outputs can be retired."""
    root=Path(root)
    allowed={'.owner','upstream.tar.gz','private/context.json','private/admission.json','private/README.md','private/report.json','private/cleanup-inventory.json'}
    allowed.update('source/'+('consumer/' if r['namespace']=='CONSUMER' else '')+r['path'] for r in state['source']['effective'])
    allowed.update('private/'+kind+'-'+stage+'.json' for kind in ('plan','command','process') for stage in STAGES)
    allowed.update('evidence/'+name for name in (*EVIDENCE_CAPS,'server.jar','RetainedVideoConsumer.dll'))
    allowed.update(('output/classes.zip','output/RetainedVideoConsumer.dll'))
    allowed.update('generated/'+name for name in ('com/genymobile/scrcpy/BuildConfig.java','android/content/IOnPrimaryClipChangedListener.java','android/view/IDisplayWindowListener.java'))
    rows=inventory(root,'ROOT',15000,96*1024**2,32*1024**2,True)
    for row in rows:
        name=row['path']
        if name.startswith('classes/'):
            rel=name[8:]
            if str(Path(rel).parent).replace('\\','/') not in PACKAGES or re.fullmatch(r'[A-Za-z_$][A-Za-z0-9_$]*\.class',Path(rel).name) is None:fail('CLEANUP_FAILED')
            allowed.add(name)
        elif name not in allowed:fail('CLEANUP_FAILED')
    dirs={'.','source','generated','classes','output','private','evidence','private/java-home','private/java-tmp'}
    for name in allowed:
        parts=name.split('/');dirs.update('/'.join(parts[:i]) for i in range(1,len(parts)))
    if any(Path(p).relative_to(root).as_posix() not in dirs for p,_,_ in os.walk(root)):fail('CLEANUP_FAILED')
    return rows


def finish(root,failure='NONE'):
    root=Path(root)
    if failure not in ('NONE',*FAILURES):fail()
    state=load(root);report=blank_report(state['context']);report['failure']=None if failure=='NONE' else failure
    for stage in STAGES:
        file=root/('private/process-'+stage+'.json')
        if file.exists():report[stage]=process_value(read(file,4096))
    try:
        revalidate(root);report['sourceUnchanged']=True;report['toolsUnchanged']=True
        source=state['source'];report.update(sourceArchiveSha256=ARCHIVE_SHA,sourceManifestSha256=SELECTED_SHA,sourceEvidenceSha256=sha(read(root/'evidence/source.json',262144)),patchSha256=source['patchSha256'],effectiveManifestSha256=sha(canonical(source['effective'])),toolchainManifestSha256=sha(read(root/'evidence/tools.json',8388608)))
        dep=dependencies(state,root);write_json(root/'evidence/dependencies.json',dep,EVIDENCE_CAPS['dependencies.json']);report['dependenciesManifestSha256']=sha(canonical(dep))
        if report['failure'] is None:
            if any(p is None or not successful(p) for p in (report[stage] for stage in STAGES)):fail('COMPILE_FAILED')
            gen=generated(root)
            expected_gen={'com/genymobile/scrcpy/BuildConfig.java','android/content/IOnPrimaryClipChangedListener.java','android/view/IDisplayWindowListener.java'}
            if {r['path'] for r in gen['files'] if r['namespace']=='GENERATED'}!=expected_gen:fail('OUTPUT_REJECTED')
            if read(root/'generated/com/genymobile/scrcpy/BuildConfig.java',4096)!=BUILD_CONFIG:fail('SOURCE_REJECTED')
            commands={'version':1,'stages':[]}
            for stage in STAGES:
                stored=parse(read(root/('private/command-'+stage+'.json'),262144))
                if stored!=make_plan(root,stage,state)[1]:fail('SOURCE_REJECTED')
                commands['stages'].append(stored)
            outputs,jar,dll=inspect_outputs(root)
            for name,value in (('generated.json',gen),('commands.json',commands),('outputs.json',outputs)):write_json(root/'evidence'/name,value,EVIDENCE_CAPS[name])
            report.update(generatedInputsSha256=sha(canonical(gen)),buildCommandSha256=sha(canonical(commands)),outputsManifestSha256=sha(canonical(outputs)))
            server=outputs['server'];consumer=outputs['consumer'];report['serverOutput']={'bytes':server['bytes'],'sha256':server['sha256'],'dexBytes':server['entries'][0]['bytes'],'dexSha256':server['entries'][0]['sha256']};report['consumerOutput']={k:consumer[k] for k in ('bytes','sha256')}
            tools={(r['namespace'],r['path']):r for r in state['tools']['files']}
            sb={'version':1,'upstreamCommit':COMMIT,'sourcePatchSha256':source['patchSha256'],'toolchainManifestSha256':report['toolchainManifestSha256'],'dependenciesManifestSha256':report['dependenciesManifestSha256'],'buildCommandSha256':report['buildCommandSha256'],'serverBytes':server['bytes'],'serverSha256':server['sha256'],'protocolId':PROTOCOL}
            cb={'version':1,'sourceCommit':state['context']['autoCommit'],'compilerSha256':tools['FRAMEWORK64','csc.exe']['sha256'],'compilerVersion':state['context']['consumerCompilerVersion'],'arguments':['/nologo','/target:library','/platform:x64','/optimize+'],'frameworkReferences':{n:tools['FRAMEWORK64',n]['sha256'] for n in ('System.dll','System.Core.dll')},'sources':{n:next(r['sha256'] for r in source['effective'] if r['namespace']=='CONSUMER' and r['path']==n) for n in NATIVE},'consumerSha256':consumer['sha256']}
            for name,value in (('server-build.json',sb),('consumer-build.json',cb)):write_json(root/'evidence'/name,value,8192)
            report.update(serverBuildManifestSha256=sha(canonical(sb)),consumerBuildManifestSha256=sha(canonical(cb)),outputInspected=True)
            write_new(root/'evidence/server.jar',jar,8388608);write_new(root/'evidence/RetainedVideoConsumer.dll',dll,8388608)
    except (ValueError,OSError,KeyError,UnicodeError,zipfile.BadZipFile,struct.error) as error:
        report['failure']=str(error) if str(error) in FAILURES else 'OUTPUT_REJECTED'
    if any(p is not None and not retired(p) for p in (report[stage] for stage in STAGES)):report['failure']='UNRETIRED'
    write_json(root/'private/report.json',report,65536)
    # Seal an exact physical inventory for later cleanup; no broad unknown-file deletion.
    sealed=closed_layout(root,state)
    write_json(root/'private/cleanup-inventory.json',{'version':1,'files':sealed},12*1024**2)
    return report


def cleanup(root):
    root=Path(root);state=load(root)
    report=parse(read(root/'private/report.json',65536))
    if any(p is not None and not retired(p) for p in (report[stage] for stage in STAGES)):fail('UNRETIRED')
    # Independently require publisher acceptance and byte-bound JSON handoff before deletion.
    verification=str(Path(__file__).resolve().parent)
    if verification not in sys.path:sys.path.insert(0,verification)
    from validate_derived_pair_build import validate_report
    manifests={name:read(root/'evidence'/name,cap) for name,cap in EVIDENCE_CAPS.items() if (root/'evidence'/name).exists()}
    validate_report(report,manifests)
    from validate_derived_pair_build import staging, base_path
    base=base_path();binding,context,staged=staging(base)
    if binding['scratchRoot']!=str(root) or binding['owner']!=state['owner'] or context!=state['context'] or staged!=report:fail('CLEANUP_FAILED')
    if any(read(base/'upload'/name,EVIDENCE_CAPS[name])!=raw for name,raw in manifests.items()):fail('CLEANUP_FAILED')
    closed_layout(root,state)
    expected=parse(read(root/'private/cleanup-inventory.json',12*1024**2),12*1024**2)['files']
    actual=inventory(root,'ROOT',15000,96*1024**2,32*1024**2,True)
    if [r for r in actual if r['path']!='private/cleanup-inventory.json']!=expected:fail('CLEANUP_FAILED')
    known_dirs={'.'}
    for r in actual:
        parts=r['path'].split('/')
        known_dirs.update('/'.join(parts[:i]) for i in range(1,len(parts)))
    # The two explicitly empty JVM directories are part of the known owned layout.
    known_dirs.update(('private/java-home','private/java-tmp'))
    found_dirs={Path(p).relative_to(root).as_posix() for p,_,_ in os.walk(root)}
    if not found_dirs<=known_dirs:fail('CLEANUP_FAILED')
    for r in actual:
        if r['path']=='.owner':continue
        file=root/r['path']
        if digest_file(file,32*1024**2,True)!={k:r[k] for k in ('bytes','sha256')}:fail('CLEANUP_FAILED')
        if owner(root)!=(state['owner'],tuple(state['rootIdentity'])):fail('CLEANUP_FAILED')
        file.unlink()
    for directory in sorted((p for p in root.rglob('*') if p.is_dir()),key=lambda p:len(p.parts),reverse=True):
        if owner(root)!=(state['owner'],tuple(state['rootIdentity'])):fail('CLEANUP_FAILED')
        plain(directory,True);directory.rmdir()
    if {p.name for p in root.iterdir()}!={'.owner'}:fail('CLEANUP_FAILED')
    return True


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):fail('SOURCE_REJECTED')


def acquire(root):
    import time
    root=Path(root);owner(root)
    if {p.name for p in root.iterdir()}!={'.owner'}:fail()
    begin=time.monotonic();chunks=[];size=0
    with build_opener(NoRedirect()).open(Request(URL,headers={'User-Agent':'Fonesi-Auto-source-build'}),timeout=30) as response:
        if response.status!=200 or response.geturl()!=URL:fail()
        while True:
            if time.monotonic()-begin>60:fail()
            b=response.read(min(65536,ARCHIVE_BYTES+1-size))
            if not b:break
            chunks.append(b);size+=len(b)
            if size>ARCHIVE_BYTES:fail()
    raw=b''.join(chunks)
    if len(raw)!=ARCHIVE_BYTES or sha(raw)!=ARCHIVE_SHA:fail()
    owner(root);write_new(root/'upstream.tar.gz',raw,ARCHIVE_BYTES)
    return True


def main(argv=None):
    args=sys.argv[1:] if argv is None else argv
    try:
        if len(args)==2 and args[0]=='acquire':acquire(Path(args[1]))
        elif len(args)==4 and args[0]=='prepare':prepare(Path(args[1]),Path(args[2]),Path(args[3]))
        elif len(args)==3 and args[0]=='plan':plan(Path(args[1]),args[2])
        elif len(args)==3 and args[0]=='verify':verify(Path(args[1]),args[2])
        elif len(args)==3 and args[0]=='finish':finish(Path(args[1]),args[2])
        elif len(args)==2 and args[0]=='cleanup':cleanup(Path(args[1]))
        else:fail('INTERNAL_FAILURE')
        print('DERIVED_PAIR_CONTROL_PASS');return 0
    except (OSError,ValueError,KeyError,TypeError,UnicodeError,OverflowError,RecursionError,struct.error,zipfile.BadZipFile,tarfile.TarError):
        print('DERIVED_PAIR_CONTROL_FAILED');return 1


if __name__=='__main__':sys.exit(main())
