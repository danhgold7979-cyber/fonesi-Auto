"""Fixed notice evidence only. Never invokes a compiler, vendor tool or network."""
import importlib.util
import os
from pathlib import Path
import re
import sys

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location('_notice_owned_helpers', HERE / 'derived_pair_build.py')
h = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(h)
REPO = HERE.parents[1]
BASE = HERE.parent / '.derived-notice-runtime'
SDK = Path(r'C:\Program Files (x86)\Android\android-sdk\build-tools\36.0.0')
SAMPLE = 'docs/evidence/P3-01-derived-pair-build-sample-2026-11-02/'
BASELINES = {
 'tools.json':'15634991ffb5d5c5a4419a62ce6cdceeb8957fc0313587c779c6911f8e241047',
 'report.json':'1d9ba8ee1466a138a5c8d0b5166fedd65a3756a5794ff3d7cb76ab17601ad2f6',
 'dependencies.json':'052271a1f838628f2421d5fe0c410dbaf203c81e06d69886c3d052a7060a4dd8',
}
INPUTS = (
 ('NOTICE.txt',1063288,'2df581726e404bf9f5385107b650f6bf7800945348745ea54b7970d98e816b86'),
 ('source.properties',62,'7dee6632e9ad6cb111da2bb99d747211e27927061b1276d040bb1d71fded5ebb'),
 ('aidl.exe',3512416,'266dcf772ad1791b43f1ec5702af2e152d1222b051d3676af4e47006dd47d359'),
 ('lib/d8.jar',17998582,'4097ff9c46c185c6e7214da7fe9b1befb5adeea5cc9ca349270e0249904f9240'),
 ('core-lambda-stubs.jar',17103,'2feb8df434cae3218ed9ffe9bae01ddec101d1dc5e12824c4209f61e283e0d3d'),
)
SUPERVISORS = {
 'desktop/verification/WindowsBoundary.psm1':'d796fa5596b4d3c140bd1044033274481e4d90cf0d69226bdde09eae8a602aaf',
 'desktop/verification/OwnedFiles.psm1':'17884274d9647f22a431aca83fbd7bc7c624f7b5cf334a2aba7b7da44eea2a29',
 'tools/phase-00/HostProbeNative.cs':'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89',
}
CLOSURE = tuple(sorted((*SUPERVISORS, *(SAMPLE+n for n in BASELINES),
 'desktop/verification/derived_notice_evidence.py','desktop/verification/Invoke-DerivedNoticeEvidence.ps1',
 'desktop/verification/derived_pair_build.py')))
CONTEXT_KEYS = ('version','owner','baseOwner','scratchRoot','autoSourceCommit','autoSourceTree','buildToolsRoot','sourceClosure')
CAPTURE_KEYS = ('version','rootIdentity','baseIdentity','contextSha256','files','toolBindings')
STAGING_KEYS = ('version','owner','baseOwner','rootIdentity','baseIdentity','scratchRoot','contextSha256','captureSha256','autoSourceCommit','autoSourceTree')
FAILURES = ('BASELINE_REJECTED','SDK_PROFILE_REJECTED','INPUT_REJECTED','TEXT_REJECTED','SOURCE_CHANGED','STAGING_FAILED','UNRETIRED','CLEANUP_FAILED','PUBLICATION_FAILED','INTERNAL_FAILURE')


def fail(code='INPUT_REJECTED'):
    raise ValueError(code)


def json_read(path):
    raw=h.read(path,16384);value=h.parse(raw,16384)
    if h.canonical(value)!=raw:fail()
    return value


def write_json(path,value):h.write_new(path,h.canonical(value),16384)
def rows():return [{'name':n,'bytes':b,'sha256':s} for n,b,s in INPUTS]
def identity(path):
    s=h.plain(path,True)
    return {'dev':str(s.st_dev),'ino':str(s.st_ino)}


def owner(path):
    h.plain(path,True);raw=h.read(path/'.owner',36)
    try:value=raw.decode('ascii')
    except UnicodeError:fail()
    if re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',value) is None:fail()
    return value


def fence(path,token,witness):
    if owner(path)!=token or identity(path)!=witness:fail('CLEANUP_FAILED')


def inventory(path,names):
    h.plain(path,True)
    if {p.name for p in path.iterdir()}!=set(names):fail('STAGING_FAILED')
    for name in names:
        h.plain(path/name,name=='upload')


def baseline():
    values={}
    for name,digest in BASELINES.items():
        raw=h.read(REPO/SAMPLE/name,8388608)
        if h.sha(raw)!=digest:fail('BASELINE_REJECTED')
        values[name]=h.parse(raw,8388608)
    report=values['report.json']
    if report['passed'] is not True or report['failure'] is not None or report['directoryCleanup'] is not True:fail('BASELINE_REJECTED')
    for name,size,digest in INPUTS:
        for collection in (values['tools.json']['files'],values['dependencies.json']['entries']):
            matches=[r for r in collection if r['namespace']=='BUILD_TOOLS36' and r['path']==name]
            if len(matches)!=1 or matches[0]['bytes']!=size or matches[0]['sha256']!=digest:fail('BASELINE_REJECTED')


def context(path):
    c=json_read(path);h.exact(c,CONTEXT_KEYS)
    if type(c['version']) is not int or c['version']!=1 or not h.hexhash(c['autoSourceCommit'],40) or not h.hexhash(c['autoSourceTree'],40):fail()
    if type(c['scratchRoot']) is not str:fail()
    scratch=Path(c['scratchRoot'])
    if not scratch.is_absolute() or scratch.resolve()!=scratch or re.fullmatch(r'run-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',scratch.name) is None:fail()
    if c['buildToolsRoot']!=str(SDK):fail('SDK_PROFILE_REJECTED')
    if type(c['sourceClosure']) is not list or len(c['sourceClosure'])!=len(CLOSURE):fail('SOURCE_CHANGED')
    for row,name in zip(c['sourceClosure'],CLOSURE):
        h.exact(row,('name','sha256'))
        if row['name']!=name or not h.hexhash(row['sha256']):fail('SOURCE_CHANGED')
        digest=h.digest_file(REPO/name,8388608)['sha256']
        if digest!=row['sha256'] or (name in SUPERVISORS and digest!=SUPERVISORS[name]):fail('SOURCE_CHANGED')
    baseline()
    return c


def inputs():
    texts=[]
    for i,(name,size,digest) in enumerate(INPUTS):
        measured=h.digest_file(SDK/name,size)
        if measured!={'bytes':size,'sha256':digest}:fail()
        if i<2:
            raw=h.read(SDK/name,size,False)
            if len(raw)!=size or h.sha(raw)!=digest:fail()
            try:decoded=raw.decode('utf-8')
            except UnicodeError:fail('TEXT_REJECTED')
            if '\0' in decoded or decoded.encode('utf-8')!=raw:fail('TEXT_REJECTED')
            texts.append(raw)
    if sum(map(len,texts))>2*1024**2:fail('TEXT_REJECTED')
    return texts


def validate_capture(cap,c,context_hash):
    h.exact(cap,CAPTURE_KEYS)
    for key in ('rootIdentity','baseIdentity'):
        h.exact(cap[key],('dev','ino'))
        if any(type(v) is not str or re.fullmatch(r'0|[1-9][0-9]*',v) is None for v in cap[key].values()):fail()
    if type(cap['version']) is not int or cap['version']!=1 or cap['contextSha256']!=context_hash or cap['files']!=rows()[:2] or cap['toolBindings']!=rows()[2:]:fail()


def capture(root):
    root=Path(root);base=BASE
    inventory(root,('.owner','context.json'));inventory(base,('.owner',))
    c=context(root/'context.json');ri=identity(root);bi=identity(base)
    if str(root)!=c['scratchRoot']:fail()
    fence(root,c['owner'],ri);fence(base,c['baseOwner'],bi)
    texts=inputs();context_hash=h.sha(h.read(root/'context.json',16384))
    for (name,_,_),raw in zip(INPUTS,texts):
        fence(root,c['owner'],ri);fence(base,c['baseOwner'],bi);h.write_new(root/name,raw,2*1024**2)
    context(root/'context.json');inputs();fence(root,c['owner'],ri);fence(base,c['baseOwner'],bi)
    write_json(root/'capture.json',{'version':1,'rootIdentity':ri,'baseIdentity':bi,'contextSha256':context_hash,'files':rows()[:2],'toolBindings':rows()[2:]})


def root_capture(root):
    inventory(root,('.owner','context.json','capture.json','NOTICE.txt','source.properties'))
    c=context(root/'context.json');raw=h.read(root/'context.json',16384);cap=json_read(root/'capture.json')
    if str(root)!=c['scratchRoot']:fail()
    validate_capture(cap,c,h.sha(raw));fence(root,c['owner'],cap['rootIdentity']);fence(BASE,c['baseOwner'],cap['baseIdentity'])
    for name,size,digest in INPUTS[:2]:
        if h.digest_file(root/name,size,True)!={'bytes':size,'sha256':digest}:fail()
    return c,cap


def stage(root,base):
    root=Path(root);base=Path(base)
    if base!=BASE:fail()
    c,cap=root_capture(root);inventory(base,('.owner',));inputs()
    fence(base,c['baseOwner'],cap['baseIdentity']);(base/'upload').mkdir()
    for name in ('context.json','capture.json','NOTICE.txt','source.properties'):
        fence(root,c['owner'],cap['rootIdentity']);fence(base,c['baseOwner'],cap['baseIdentity'])
        target=base/name if name.endswith('.json') else base/'upload'/name
        h.write_new(target,h.read(root/name,2*1024**2),2*1024**2)
    fence(base,c['baseOwner'],cap['baseIdentity'])
    write_json(base/'staging.json',{'version':1,'owner':c['owner'],'baseOwner':c['baseOwner'],'rootIdentity':cap['rootIdentity'],'baseIdentity':cap['baseIdentity'],'scratchRoot':str(root),'contextSha256':cap['contextSha256'],'captureSha256':h.sha(h.read(root/'capture.json',16384)),'autoSourceCommit':c['autoSourceCommit'],'autoSourceTree':c['autoSourceTree']})


def staged(base,publishing=False):
    if base!=BASE:fail()
    inventory(base,('.owner','context.json','capture.json','staging.json','upload',*(('processes.json',) if publishing else ())))
    inventory(base/'upload',('NOTICE.txt','source.properties'))
    c=context(base/'context.json');cap=json_read(base/'capture.json');s=json_read(base/'staging.json');h.exact(s,STAGING_KEYS)
    validate_capture(cap,c,h.sha(h.read(base/'context.json',16384)))
    expected={'version':1,'owner':c['owner'],'baseOwner':c['baseOwner'],'rootIdentity':cap['rootIdentity'],'baseIdentity':cap['baseIdentity'],'scratchRoot':c['scratchRoot'],'contextSha256':cap['contextSha256'],'captureSha256':h.sha(h.read(base/'capture.json',16384)),'autoSourceCommit':c['autoSourceCommit'],'autoSourceTree':c['autoSourceTree']}
    if s!=expected or type(s['scratchRoot']) is not str:fail()
    root=Path(s['scratchRoot'])
    if str(root)!=c['scratchRoot']:fail()
    fence(base,c['baseOwner'],cap['baseIdentity'])
    for name,size,digest in INPUTS[:2]:
        if h.digest_file(base/'upload'/name,size,True)!={'bytes':size,'sha256':digest}:fail()
    return c,cap,s,root


def cleanup(root,base):
    root=Path(root);base=Path(base);c,cap,s,original=staged(base)
    if root!=original:fail()
    rc,rp=root_capture(root)
    if rc!=c or rp!=cap:fail()
    inputs()
    for name in ('NOTICE.txt','source.properties','capture.json','context.json'):
        fence(root,c['owner'],cap['rootIdentity']);fence(base,c['baseOwner'],cap['baseIdentity']);(root/name).unlink()
    fence(root,c['owner'],cap['rootIdentity']);inventory(root,('.owner',))
    fence(base,c['baseOwner'],cap['baseIdentity']);fence(root,c['owner'],cap['rootIdentity'])
    (root/'.owner').unlink()
    if identity(root)!=cap['rootIdentity']:fail('CLEANUP_FAILED')
    fence(base,c['baseOwner'],cap['baseIdentity'])
    if identity(root)!=cap['rootIdentity']:fail('CLEANUP_FAILED')
    root.rmdir()


def publish(base):
    base=Path(base);c,cap,s,root=staged(base,True)
    if os.path.lexists(root):fail('CLEANUP_FAILED')
    p=json_read(base/'processes.json');h.exact(p,('version','contextSha256','capture','stage','cleanup','directoryCleanup'))
    if type(p['version']) is not int or p['version']!=1 or p['contextSha256']!=cap['contextSha256'] or p['directoryCleanup'] is not True:fail('UNRETIRED')
    for key,marker in (('capture','CAPTURED'),('stage','STAGED'),('cleanup','CLEANED')):
        expected={'status':'SUCCESS','exitCode':0,'cleanupComplete':True,'stdoutTruncated':False,'stderrTruncated':False,'stderrEmpty':True,'marker':'DERIVED_NOTICE_'+marker}
        h.exact(p[key],tuple(expected))
        if h.canonical(p[key])!=h.canonical(expected):fail('UNRETIRED')
    context(base/'context.json');inputs()
    for name,size,digest in INPUTS[:2]:
        if h.digest_file(base/'upload'/name,size,True)!={'bytes':size,'sha256':digest}:fail('PUBLICATION_FAILED')
    fence(base,c['baseOwner'],cap['baseIdentity'])
    if os.path.lexists(root):fail('CLEANUP_FAILED')
    receipt={'version':1,'scope':'EXACT_BUILD_TOOLS_NOTICE_EVIDENCE','autoSourceCommit':c['autoSourceCommit'],'autoSourceTree':c['autoSourceTree'],'baselineReportSha256':BASELINES['report.json'],'baselineToolsSha256':BASELINES['tools.json'],'baselineDependenciesSha256':BASELINES['dependencies.json'],'files':rows()[:2],'toolBindings':rows()[2:],'sourceUnchanged':True,'inputsUnchanged':True,'processRetired':True,'directoryCleanup':True,'passed':True}
    h.write_new(base/'upload/receipt.json',h.canonical(receipt),8192)
    return receipt


def main(args=None):
    args=sys.argv[1:] if args is None else args
    try:
        if len(args)==2 and args[0]=='capture':capture(args[1]);marker='CAPTURED'
        elif len(args)==3 and args[0]=='stage':stage(args[1],args[2]);marker='STAGED'
        elif len(args)==3 and args[0]=='cleanup':cleanup(args[1],args[2]);marker='CLEANED'
        elif len(args)==2 and args[0]=='publish':publish(args[1]);marker='PUBLISHED'
        else:fail('INTERNAL_FAILURE')
        print('DERIVED_NOTICE_'+marker);return 0
    except Exception as error:
        code=error.args[0] if type(error) is ValueError and len(error.args)==1 and type(error.args[0]) is str and error.args[0] in FAILURES else 'INTERNAL_FAILURE'
        print('DERIVED_NOTICE_FAILED|'+code);return 1


if __name__=='__main__':sys.exit(main())
