"""Independent fixed retained evidence checks. No execution or network APIs."""
import importlib.util
import os
from pathlib import Path
import re
import sys

HERE = Path(__file__).resolve().parent

def sibling(name):
    spec = importlib.util.spec_from_file_location('_retention_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

v = sibling('validate_derived_pair_build')
h = sibling('derived_pair_build')
n = sibling('derived_notice_evidence')
REPO = HERE.parents[1]
SOURCE_PATHS = tuple(sorted((
    '.github/workflows/phase-02-software.yml', 'tools/phase-00/HostProbeNative.cs',
    *('desktop/verification/' + x for x in ('Invoke-DerivedPairBuild.ps1', 'derived_pair_build.py',
      'validate_derived_pair_build.py', 'derived_pair_retention.py', 'validate_retained_pair_evidence.py',
      'derived_notice_evidence.py', 'WindowsBoundary.psm1', 'OwnedFiles.psm1')))))
BINDING_KEYS = ('version','baseOwner','baseIdentity','scratchRoot','runId','owner','rootIdentity',
                'contextSha256','retentionContextSha256','stagingSha256','preCleanupReportSha256',
                'retentionSourceSha256','files')
NOTICE_RECEIPT = 'docs/evidence/P3-01-exact-notice-receipt-2026-11-02.json'
LICENSE_SHA = '01c12035bf35af37241298dc7ad538eb2a07e5c940437bc6876feeaa9d1951d0'
NOTICE_SHA = 'e38ceb009e011feeae1ce839a383cbd7d30d1a1b2377caec4e832e05ce2b503e'
CAPS = {'payload/server.jar':8388608,'payload/RetainedVideoConsumer.dll':8388608,
        **{'build/'+k:c for k,c in zip(v.NAMES,v.CAPS)}, 'build/report.json':65536,
        'build/retention-source.json':65536, **{'generated/'+k:1048576 for k in v.GENERATED},
        'source/upstream.tar.gz':513746,
        **{'source/'+k:262144 for k in ('verified-selected-source-manifest.json','verified-full-source-manifest.json',
                                      'auto-video-nonce-v1.patch','source-provenance.json')},
        **{'source/auto/'+k:1048576 for k in v.CS},
        'source/upstream-LICENSE':11387,'source/upstream-README.md':8141,
        'notice/NOTICE.txt':1063288,'notice/source.properties':62,'notice/capture-receipt.json':1167}
STEP = 'OWNER'
STEPS = ('OWNER','CONTEXT','SOURCE','BUILD','OUTPUT','GENERATED','NOTICE','COPY','READBACK','LAYOUT','CLEANUP','RECEIPT','PROMOTE')

def checkpoint(step):
    global STEP
    if step not in STEPS: v.reject()
    STEP = step

def identity(folder):
    s = h.plain(Path(folder), True)
    return {'dev':str(s.st_dev),'ino':str(s.st_ino)}

def data(file, cap):
    return v.read_file(Path(file), cap)

def json_file(file, cap=65536):
    raw = data(file,cap)
    value = v.parse(raw,cap)
    if v.canonical(value) != raw: v.reject()
    return value

def inventory(folder, names):
    folder=Path(folder); v.directory(folder)
    expected=set(names); parents=set()
    for name in expected:
        v.path(name)
        parents.update(str(p).replace(os.sep,'/') for p in Path(name).parents if str(p)!='.')
    files=set(); dirs=set()
    def walk(at):
        for entry in at.iterdir():
            rel=entry.relative_to(folder).as_posix()
            if entry.is_dir():
                h.plain(entry,True)
                if rel not in parents: v.reject()
                dirs.add(rel);walk(entry)
            else:
                if rel not in expected: v.reject()
                h.plain(entry);files.add(rel)
    walk(folder)
    if files!=expected or dirs!=parents: v.reject()

def file_rows(folder, final=False):
    names=set(CAPS)
    if not final:names.remove('build/report.json')
    inventory(folder,names | ({'retention-receipt.json'} if final else set()))
    rows=[]
    for name in sorted(names):
        raw=data(Path(folder)/name,CAPS[name]);rows.append({'path':name,'bytes':len(raw),'sha256':v.sha(raw)})
    if sum(r['bytes'] for r in rows)>64*1048576: v.reject()
    return rows

def retention_context(base):
    value=json_file(base/'retention-context.json',4096)
    v.exact(value,('version','githubRunId','githubRunAttempt'))
    if type(value['version']) is not int or value['version']!=1 or type(value['githubRunId']) is not str or not re.fullmatch(r'[1-9][0-9]{0,19}',value['githubRunId']):v.reject()
    v.integer(value['githubRunAttempt'],1000000,1)
    return value

class OutputRoot:
    def __init__(self,folder):self.folder=folder
    def __truediv__(self,name):
        if name!='evidence':v.reject()
        return self.folder/'payload'

def verify_payload(folder, report, final=False):
    """Read-only verification of actual payload bytes against pinned source/build evidence."""
    folder=Path(folder);checkpoint('LAYOUT');rows=file_rows(folder,final)
    checkpoint('BUILD');manifests={k:data(folder/'build'/k,c) for k,c in zip(v.NAMES,v.CAPS)}
    v.validate_report(report,manifests)
    if report['failure'] is not None or report['directoryCleanup'] is not final or report['passed'] is not final:v.reject()
    checkpoint('OUTPUT');v.check_output_bytes(OutputRoot(folder),report,manifests)
    checkpoint('SOURCE')
    closure=json_file(folder/'build/retention-source.json')
    v.exact(closure,('version','autoSourceCommit','autoSourceTree','files'))
    if type(closure['version']) is not int or closure['version']!=1 or (closure['autoSourceCommit'],closure['autoSourceTree'])!=(report['autoSourceCommit'],report['autoSourceTree']):v.reject()
    if type(closure['files']) is not list or len(closure['files'])!=len(SOURCE_PATHS):v.reject()
    for row,name in zip(closure['files'],SOURCE_PATHS):
        v.exact(row,('path','bytes','sha256'));raw=data(REPO/name,8388608)
        if row!={'path':name,'bytes':len(raw),'sha256':v.sha(raw)}:v.reject()
        if name in n.SUPERVISORS and v.sha(raw)!=n.SUPERVISORS[name]:v.reject()
    for name in ('verified-selected-source-manifest.json','verified-full-source-manifest.json','auto-video-nonce-v1.patch','source-provenance.json'):
        if data(folder/'source'/name,262144)!=data(REPO/'desktop/video-source'/name,262144):v.reject()
    selected,readme=h.inspect_archive(folder/'source/upstream.tar.gz')
    h.apply_patch(selected)
    if data(folder/'source/upstream-README.md',8141)!=readme:v.reject()
    license_raw=data(folder/'source/upstream-LICENSE',11387)
    if len(license_raw)!=11387 or v.sha(license_raw)!=LICENSE_SHA:v.reject()
    source=v.parse(manifests['source.json'],262144)
    for name in v.CS:
        raw=data(folder/'source/auto'/name,1048576)
        row=next((r for r in source['effective'] if r['namespace']=='CONSUMER' and r['path']==name),None)
        if row is None or (len(raw),v.sha(raw))!=(row['bytes'],row['sha256']):v.reject()
    if sum(len(data(folder/'source/auto'/k,1048576)) for k in v.CS)>4194304:v.reject()
    checkpoint('GENERATED');generated=v.parse(manifests['generated.json'],2097152)['files'];total=0
    for name in v.GENERATED:
        raw=data(folder/'generated'/name,1048576);total+=len(raw)
        row=next((r for r in generated if r['namespace']=='GENERATED' and r['path']==name),None)
        if row is None or (len(raw),v.sha(raw))!=(row['bytes'],row['sha256']):v.reject()
    if total>2097152 or data(folder/'generated'/v.GENERATED[2],1048576)!=v.BUILD_CONFIG:v.reject()
    checkpoint('NOTICE')
    for name,size,digest in n.INPUTS[:2]:
        raw=data(folder/'notice'/name,size)
        if len(raw)!=size or v.sha(raw)!=digest or b'\0' in raw or raw.decode('utf-8').encode('utf-8')!=raw:v.reject()
    notice=data(folder/'notice/capture-receipt.json',1167)
    if len(notice)!=1167 or v.sha(notice)!=NOTICE_SHA or notice!=data(REPO/NOTICE_RECEIPT,1167):v.reject()
    tools=v.parse(manifests['tools.json'],8388608)
    for name,size,digest in n.INPUTS[2:]:
        matches=[r for r in tools['files'] if r['namespace']=='BUILD_TOOLS36' and r['path']==name]
        if len(matches)!=1 or (matches[0]['bytes'],matches[0]['sha256'])!=(size,digest):v.reject()
    for row in closure['files']:
        raw=data(REPO/row['path'],8388608)
        if (len(raw),v.sha(raw))!=(row['bytes'],row['sha256']):v.reject()
    if file_rows(folder,final)!=rows:v.reject()
    return rows

def bound(base):
    base=v.directory(base)
    if base!=v.base_path():v.reject()
    record=json_file(base/'retention-staging.json');v.exact(record,BINDING_KEYS)
    legacy,context,report=v.staging(base)
    for key in ('rootIdentity','baseIdentity'):
        v.exact(record[key],('dev','ino'))
        if any(type(x) is not str or not re.fullmatch(r'0|[1-9][0-9]{0,39}',x) for x in record[key].values()):v.reject()
    if type(record['version']) is not int or record['version']!=1 or record['baseOwner']!=v.owner(base) or record['baseIdentity']!=identity(base):v.reject()
    for key in ('scratchRoot','runId','owner','contextSha256'):
        if record[key]!=legacy[key]:v.reject()
    for key,path in (('retentionContextSha256','retention-context.json'),('stagingSha256','staging.json'),('preCleanupReportSha256','staged-report.json')):
        if record[key]!=v.sha(data(base/path,65536)):v.reject()
    retention_context(base)
    return record,context,report

def stage(root):
    root,run_id,token=v.scratch(root);base=v.directory(v.base_path())
    legacy,context,report=v.staging(base)
    if legacy['scratchRoot']!=str(root) or legacy['owner']!=token:v.reject()
    rows=verify_payload(base/'retained-stage',report)
    record={'version':1,'baseOwner':v.owner(base),'baseIdentity':identity(base),'scratchRoot':str(root),'runId':run_id,'owner':token,'rootIdentity':identity(root),'contextSha256':legacy['contextSha256'],'retentionContextSha256':v.sha(data(base/'retention-context.json',4096)),'stagingSha256':v.sha(data(base/'staging.json',4096)),'preCleanupReportSha256':v.sha(data(base/'staged-report.json',65536)),'retentionSourceSha256':v.sha(data(base/'retained-stage/build/retention-source.json',65536)),'files':rows}
    retention_context(base)
    if json_file(base/'retention-capture.json')!=record:v.reject()
    if v.owner(root)!=token or identity(root)!=record['rootIdentity'] or v.owner(base)!=record['baseOwner'] or identity(base)!=record['baseIdentity']:v.reject()
    v.write_new(base/'retention-staging.json',v.canonical(record))

def cleanup(base):
    base=Path(base);checkpoint('CLEANUP');record,_,report=bound(base);root=Path(record['scratchRoot'])
    if verify_payload(base/'retained-stage',report)!=record['files']:v.reject()
    if identity(root)!=record['rootIdentity'] or v.owner(root)!=record['owner']:v.reject()
    inventory(root,('.owner',))
    if identity(base)!=record['baseIdentity'] or v.owner(base)!=record['baseOwner']:v.reject()
    (root/'.owner').unlink()
    if identity(root)!=record['rootIdentity'] or identity(base)!=record['baseIdentity'] or v.owner(base)!=record['baseOwner']:v.reject()
    root.rmdir()
    if os.path.lexists(root):v.reject()

def make_receipt(report, rows, attribution):
    mapping={r['path']:r for r in rows}
    return {'version':1,'scope':'DERIVED_SCRCPY_PAIR_RETAINED_EVIDENCE',**{k:attribution[k] for k in ('githubRunId','githubRunAttempt')},'autoSourceCommit':report['autoSourceCommit'],'autoSourceTree':report['autoSourceTree'],'protocolId':v.PROTOCOL,'reportSha256':mapping['build/report.json']['sha256'],'retentionSourceSha256':mapping['build/retention-source.json']['sha256'],'noticeReceiptSha256':NOTICE_SHA,'files':rows,'totalBytes':sum(r['bytes'] for r in rows),'buildProcessesRetired':True,'copyVerified':True,'sourceUnchanged':True,'noticeBytesVerified':True,'directoryCleanup':True,'passed':True}

def verify_packet(folder):
    folder=Path(folder);report=json_file(folder/'build/report.json');receipt=json_file(folder/'retention-receipt.json')
    rows=verify_payload(folder,report,True)
    attribution={k:receipt.get(k) for k in ('githubRunId','githubRunAttempt')}
    if type(attribution['githubRunId']) is not str or not re.fullmatch(r'[1-9][0-9]{0,19}',attribution['githubRunId']):v.reject()
    v.integer(attribution['githubRunAttempt'],1000000,1)
    if data(folder/'retention-receipt.json',65536)!=v.canonical(make_receipt(report,rows,attribution)) or len(v.canonical(receipt))+receipt['totalBytes']>64*1048576:v.reject()
    return receipt

def publish(base):
    base=Path(base);record,context,pre=bound(base);root=Path(record['scratchRoot']);folder=base/'retained-stage'
    if os.path.lexists(root) or verify_payload(folder,pre)!=record['files']:v.reject()
    report=json_file(base/'upload/report.json');manifests=v.load_manifests(base/'upload')
    v.validate_report(report,manifests,context['autoCommit'],context['autoTree'])
    expected=dict(pre);expected.update(directoryCleanup=True,passed=True)
    if report!=expected or not report['passed']:v.reject()
    for name,raw in manifests.items():
        if data(folder/'build'/name,dict(zip(v.NAMES,v.CAPS))[name])!=raw:v.reject()
    checkpoint('RECEIPT');v.write_new(folder/'build/report.json',v.canonical(report))
    # Exact inventory before receipt exists; no generic alternate public verifier mode.
    rows=[]
    inventory(folder,CAPS)
    for name in sorted(CAPS):
        raw=data(folder/name,CAPS[name]);rows.append({'path':name,'bytes':len(raw),'sha256':v.sha(raw)})
    receipt=make_receipt(report,rows,retention_context(base))
    v.write_new(folder/'retention-receipt.json',v.canonical(receipt))
    expected_report_raw=v.canonical(expected)
    expected_receipt_raw=v.canonical(receipt)
    def captured_packet(at):
        actual=verify_packet(at)
        if v.canonical(actual)!=expected_receipt_raw or data(at/'retention-receipt.json',65536)!=expected_receipt_raw:v.reject()
        if [row for row in actual['files'] if row['path']!='build/report.json']!=record['files'] or data(at/'build/report.json',65536)!=expected_report_raw or actual['reportSha256']!=v.sha(expected_report_raw):v.reject()
        return actual
    captured_packet(folder)
    if identity(base)!=record['baseIdentity'] or v.owner(base)!=record['baseOwner'] or os.path.lexists(root):v.reject()
    checkpoint('PROMOTE');destination=base/'retained-upload'
    if os.path.lexists(destination):v.reject()
    folder.rename(destination)
    captured_packet(destination)
    if identity(base)!=record['baseIdentity'] or v.owner(base)!=record['baseOwner'] or os.path.lexists(root):v.reject()
    return receipt

def main(argv):
    checkpoint('OWNER')
    action=argv[0] if len(argv)==2 else ''
    mapped={'stage':('VALIDATE',stage,'STAGED'),'cleanup':('CLEANUP',cleanup,'CLEANED'),'publish':('PUBLISH',publish,'PUBLISHED')}
    public=mapped.get(action,('VALIDATE',None,''))[0]
    try:
        if action not in mapped: v.reject()
        mapped[action][1](Path(argv[1]))
        print('DERIVED_PAIR_RETENTION_'+mapped[action][2]);return 0
    except Exception as error:
        reason='IO_NOT_FOUND' if isinstance(error,FileNotFoundError) else 'IO_ACCESS' if isinstance(error,PermissionError) else 'IO_OTHER' if isinstance(error,OSError) else 'PREDICATE'
        print('DERIVED_PAIR_RETENTION_DIAG|'+public+'|'+STEP+'|'+reason)
        print('DERIVED_PAIR_RETENTION_FAILED');return 1

if __name__=='__main__':sys.exit(main(sys.argv[1:]))
