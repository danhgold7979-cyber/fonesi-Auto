"""Fixed retained-pair copy. No compiler, subprocess, network or runtime admission."""
import importlib.util
from pathlib import Path
import re
import sys

HERE=Path(__file__).resolve().parent

def sibling(name):
    spec=importlib.util.spec_from_file_location('_retention_'+name,HERE/(name+'.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

h=sibling('derived_pair_build');v=sibling('validate_derived_pair_build');n=sibling('derived_notice_evidence')
REPO=HERE.parents[1]
BASE=HERE.parent/'.derived-pair-build-runtime'
SOURCE_PATHS=tuple(sorted(('desktop/verification/'+name for name in ('Invoke-DerivedPairBuild.ps1','derived_pair_build.py','validate_derived_pair_build.py','derived_pair_retention.py','validate_retained_pair_evidence.py','derived_notice_evidence.py','WindowsBoundary.psm1','OwnedFiles.psm1'))))+('.github/workflows/phase-02-software.yml','tools/phase-00/HostProbeNative.cs')
SOURCE_PATHS=tuple(sorted(SOURCE_PATHS))
GENERATED=('android/content/IOnPrimaryClipChangedListener.java','android/view/IDisplayWindowListener.java','com/genymobile/scrcpy/BuildConfig.java')
PACKET_NAMES=('verified-selected-source-manifest.json','verified-full-source-manifest.json','auto-video-nonce-v1.patch','source-provenance.json')
NOTICE_RECEIPT='docs/evidence/P3-01-exact-notice-receipt-2026-11-02.json'
NOTICE_SHA='e38ceb009e011feeae1ce839a383cbd7d30d1a1b2377caec4e832e05ce2b503e'
CAPS={**{'payload/'+name:8388608 for name in ('server.jar','RetainedVideoConsumer.dll')},**{'build/'+name:cap for name,cap in h.EVIDENCE_CAPS.items()},'build/report.json':65536,'build/retention-source.json':65536,**{'generated/'+name:1048576 for name in GENERATED},'source/upstream.tar.gz':h.ARCHIVE_BYTES,**{'source/'+name:262144 for name in PACKET_NAMES},**{'source/auto/'+name:1048576 for name in h.NATIVE},'source/upstream-LICENSE':11387,'source/upstream-README.md':8141,'notice/NOTICE.txt':1063288,'notice/source.properties':62,'notice/capture-receipt.json':1167}
CAPTURE_KEYS=('version','baseOwner','baseIdentity','scratchRoot','runId','owner','rootIdentity','contextSha256','retentionContextSha256','stagingSha256','preCleanupReportSha256','retentionSourceSha256','files')
ACTIONS=('COPY','VALIDATE','CLEANUP','PUBLISH')
STEPS=('OWNER','CONTEXT','SOURCE','BUILD','OUTPUT','GENERATED','NOTICE','COPY','READBACK','LAYOUT','CLEANUP','RECEIPT','PROMOTE')
REASONS=('PREDICATE','IDENTITY','HASH','BYTE_LIMIT','SCHEMA','IO_ACCESS','IO_NOT_FOUND','IO_OTHER','INTERNAL')
_step='OWNER'

def checkpoint(step):
    global _step
    if type(step) is not str or step not in STEPS:raise ValueError()
    _step=step

def fail(reason='PREDICATE'):raise ValueError(reason)
def ident(path):
    s=h.plain(path,True);return {'dev':str(s.st_dev),'ino':str(s.st_ino)}
def fence(root,base,binding):
    if h.owner(root)[0]!=binding['owner'] or h.owner(base)[0]!=binding['baseOwner'] or ident(root)!=binding['rootIdentity'] or ident(base)!=binding['baseIdentity']:fail('IDENTITY')
def canonical_file(path,cap):
    raw=h.read(path,cap);value=h.parse(raw,cap)
    if h.canonical(value)!=raw:fail('SCHEMA')
    return raw,value

def retention_context(base):
    raw,c=canonical_file(base/'retention-context.json',4096);h.exact(c,('version','githubRunId','githubRunAttempt'))
    if type(c['version']) is not int or c['version']!=1 or type(c['githubRunId']) is not str or re.fullmatch(r'[1-9][0-9]{0,19}',c['githubRunId']) is None or type(c['githubRunAttempt']) is not int or not 1<=c['githubRunAttempt']<=1000000:fail('SCHEMA')
    return raw

def source_manifest(context):
    rows=[]
    for path in SOURCE_PATHS:
        measured=h.digest_file(REPO/path,8388608,True)
        if path in n.SUPERVISORS and measured['sha256']!=n.SUPERVISORS[path]:fail('HASH')
        rows.append({'path':path,**measured})
    return h.canonical({'version':1,'autoSourceCommit':context['autoCommit'],'autoSourceTree':context['autoTree'],'files':rows})

def payload(root,context,report):
    checkpoint('SOURCE');state=h.revalidate(root);h.closed_layout(root,state)
    if state['context']!=context:fail('SCHEMA')
    checkpoint('BUILD');manifests=v.load_manifests(root/'evidence')
    v.validate_report(report,manifests,context['autoCommit'],context['autoTree'])
    if report['failure'] is not None or any(report[k] is not True for k in ('outputInspected','sourceUnchanged','toolsUnchanged')) or report['directoryCleanup'] is not False or report['passed'] is not False:fail()
    if set(manifests)!=set(h.EVIDENCE_CAPS):fail('SCHEMA')
    v.check_invocations(root,context,report,manifests)
    checkpoint('OUTPUT');v.check_output_bytes(root,report,manifests)
    inspected,_,_=h.inspect_outputs(root)
    if h.canonical(inspected)!=manifests['outputs.json']:fail('HASH')
    result={'build/'+name:raw for name,raw in manifests.items()}
    for name in ('server.jar','RetainedVideoConsumer.dll'):result['payload/'+name]=h.read(root/'evidence'/name,8388608)
    # check_output_bytes validates evidence copies against actual output and report.
    outputs=h.parse(manifests['outputs.json'],1048576)
    for key,name in (('server','server.jar'),('consumer','RetainedVideoConsumer.dll')):
        raw=result['payload/'+name]
        if len(raw)!=outputs[key]['bytes'] or h.sha(raw)!=outputs[key]['sha256']:fail('HASH')
    checkpoint('GENERATED');generated=h.parse(manifests['generated.json'],2097152)['files']
    for name in GENERATED:
        raw=h.read(root/'generated'/name,1048576);matches=[r for r in generated if r['namespace']=='GENERATED' and r['path']==name]
        if len(matches)!=1 or matches[0]['bytes']!=len(raw) or matches[0]['sha256']!=h.sha(raw):fail('HASH')
        result['generated/'+name]=raw
    if sum(len(result['generated/'+name]) for name in GENERATED)>2097152 or result['generated/com/genymobile/scrcpy/BuildConfig.java']!=h.BUILD_CONFIG:fail('BYTE_LIMIT')
    checkpoint('SOURCE');archive=root/'upstream.tar.gz';upstream,readme=h.inspect_archive(archive)
    derived,patch_sha=h.apply_patch(upstream)
    if patch_sha!=state['source']['patchSha256']:fail('HASH')
    for row in state['source']['effective']:
        if row['namespace']=='SERVER' and (row['path'] not in derived or h.sha(derived[row['path']])!=row['sha256'] or len(derived[row['path']])!=row['bytes']):fail('HASH')
    result['source/upstream.tar.gz']=h.read(archive,h.ARCHIVE_BYTES)
    for name in PACKET_NAMES:result['source/'+name]=h.read(h.PACKET/name,262144)
    h.packet()
    for name in h.NATIVE:
        raw=h.read(root/'source/consumer'/name,1048576);matches=[r for r in state['source']['effective'] if r['namespace']=='CONSUMER' and r['path']==name]
        if len(matches)!=1 or matches[0]['sha256']!=h.sha(raw) or matches[0]['bytes']!=len(raw):fail('HASH')
        result['source/auto/'+name]=raw
    if sum(len(result['source/auto/'+name]) for name in h.NATIVE)>4194304:fail('BYTE_LIMIT')
    result['source/upstream-LICENSE']=upstream['LICENSE'];result['source/upstream-README.md']=readme
    checkpoint('NOTICE')
    if context['buildToolsRoot']!=str(n.SDK):fail()
    texts=n.inputs()
    for row in n.rows():
        matches=[r for r in state['tools']['files'] if r['namespace']=='BUILD_TOOLS36' and r['path']==row['name']]
        if len(matches)!=1 or matches[0]['sha256']!=row['sha256'] or matches[0]['bytes']!=row['bytes']:fail('HASH')
    for name,raw in zip(('NOTICE.txt','source.properties'),texts):
        if h.read(n.SDK/name,len(raw),True)!=raw:fail('HASH')
        result['notice/'+name]=raw
    raw=h.read(REPO/NOTICE_RECEIPT,1167)
    if len(raw)!=1167 or h.sha(raw)!=NOTICE_SHA:fail('HASH')
    result['notice/capture-receipt.json']=raw
    checkpoint('SOURCE');result['build/retention-source.json']=source_manifest(context)
    validate_payload(result)
    return result

def validate_payload(data):
    if set(data)!=set(CAPS)-{'build/report.json'}:fail('SCHEMA')
    if len(data)!=29 or sum(map(len,data.values()))>64*1024**2:fail('BYTE_LIMIT')
    for name,raw in data.items():
        if type(raw) is not bytes or not 0<len(raw)<=CAPS[name]:fail('BYTE_LIMIT')

def inventory(folder,names):
    expected=set(names);allowed_dirs={'.'}
    for name in expected:
        parts=name.split('/');allowed_dirs.update('/'.join(parts[:i]) for i in range(1,len(parts)))
    found=set();dirs={'.'};count=0;limit=len(expected)+len(allowed_dirs)-1
    h.plain(folder,True)
    def walk(parent):
        nonlocal count
        for path in parent.iterdir():
            count+=1
            if count>limit:fail('SCHEMA')
            rel=path.relative_to(folder).as_posix()
            # Refuse unknown entries before stat/traversal, especially unknown subtrees.
            if rel in allowed_dirs:
                h.plain(path,True);dirs.add(rel);walk(path)
            elif rel in expected:
                h.plain(path);found.add(rel)
            else:fail('SCHEMA')
    walk(folder)
    if found!=expected or dirs!=allowed_dirs:fail('SCHEMA')


def stage(root):
    root=Path(root);base=BASE;checkpoint('OWNER')
    legacy,context,report=v.staging(base)
    if legacy['scratchRoot']!=str(root):fail('IDENTITY')
    binding={'owner':legacy['owner'],'baseOwner':legacy['baseOwner'],'rootIdentity':ident(root),'baseIdentity':ident(base)}
    fence(root,base,binding);checkpoint('CONTEXT');rc=retention_context(base)
    original_staging=h.read(base/'staging.json',4096);original_report=h.read(root/'private/report.json',65536)
    if h.sha(original_report)!=legacy['reportSha256'] or h.parse(original_report)!=report:fail('HASH')
    data=payload(root,context,report);fence(root,base,binding)
    target=base/'retained-stage';checkpoint('COPY');target.mkdir()
    for name in sorted(data):
        fence(root,base,binding);path=target/name
        path.parent.mkdir(parents=True,exist_ok=True);h.plain(path.parent,True)
        h.write_new(path,data[name],CAPS[name])
    checkpoint('READBACK');files=[]
    for name in sorted(data):
        raw=h.read(target/name,CAPS[name])
        if raw!=data[name]:fail('HASH')
        files.append({'path':name,'bytes':len(raw),'sha256':h.sha(raw)})
    # Revalidation includes actual original output/source/generated/tool inputs after copies.
    if payload(root,context,report)!=data or retention_context(base)!=rc or h.read(base/'staging.json',4096)!=original_staging or h.read(root/'private/report.json',65536)!=original_report:fail('HASH')
    checkpoint('LAYOUT');inventory(target,data)
    for row in files:
        if h.digest_file(target/row['path'],CAPS[row['path']],True)!={'bytes':row['bytes'],'sha256':row['sha256']}:fail('HASH')
    fence(root,base,binding);checkpoint('RECEIPT')
    record={'version':1,'baseOwner':binding['baseOwner'],'baseIdentity':binding['baseIdentity'],'scratchRoot':str(root),'runId':legacy['runId'],'owner':binding['owner'],'rootIdentity':binding['rootIdentity'],'contextSha256':legacy['contextSha256'],'retentionContextSha256':h.sha(rc),'stagingSha256':h.sha(original_staging),'preCleanupReportSha256':h.sha(original_report),'retentionSourceSha256':h.sha(data['build/retention-source.json']),'files':files}
    h.write_new(base/'retention-capture.json',h.canonical(record),65536)
    return record

def diagnostic(error):
    kind=type(error)
    reason=error.args[0] if kind is ValueError and len(error.args)==1 and type(error.args[0]) is str and error.args[0] in REASONS else 'INTERNAL'
    if kind is PermissionError:reason='IO_ACCESS'
    elif kind is FileNotFoundError:reason='IO_NOT_FOUND'
    elif kind is OSError:reason='IO_OTHER'
    return 'DERIVED_PAIR_RETENTION_DIAG|COPY|'+(_step if type(_step) is str and _step in STEPS else 'OWNER')+'|'+reason

def main(args=None):
    args=sys.argv[1:] if args is None else args;checkpoint('OWNER')
    try:
        if len(args)!=2 or args[0]!='stage':fail('SCHEMA')
        stage(args[1]);print('DERIVED_PAIR_RETENTION_COPIED');return 0
    except Exception as error:
        print(diagnostic(error));print('DERIVED_PAIR_RETENTION_FAILED');return 1

if __name__=='__main__':sys.exit(main())
