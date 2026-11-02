"""Owned synthetic packet tests. No compilers, SDK or genuine retained pair claims."""
import contextlib
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import uuid
import validate_retained_pair_evidence as q
import derived_pair_retention as producer

class ValidatorTests(unittest.TestCase):
    def fixture(self):
        tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup)
        top=Path(tmp.name).resolve();root=top/('derived-pair-'+str(uuid.uuid4()));base=top/'base'
        root.mkdir();base.mkdir()
        for at in (root,base):(at/'.owner').write_text(str(uuid.uuid4()))
        folder=base/'retained-stage';folder.mkdir()
        for name in q.CAPS:
            if name=='build/report.json':continue
            at=folder/name;at.parent.mkdir(parents=True,exist_ok=True);at.write_bytes(b'SYNTHETIC_NO_EXECUTION')
        context={'autoCommit':'1'*40,'autoTree':'2'*40}
        report={'autoSourceCommit':'1'*40,'autoSourceTree':'2'*40,'directoryCleanup':False,'passed':False,'failure':None}
        (base/'staged-report.json').write_bytes(q.v.canonical(report))
        (base/'retention-context.json').write_bytes(q.v.canonical({'version':1,'githubRunId':'123','githubRunAttempt':1}))
        legacy={'scratchRoot':str(root),'runId':root.name[len('derived-pair-'):],'owner':q.v.owner(root),'baseOwner':q.v.owner(base),'contextSha256':'a'*64}
        (base/'staging.json').write_bytes(q.v.canonical(legacy))
        rows=q.file_rows(folder)
        binding={'version':1,'baseOwner':q.v.owner(base),'baseIdentity':q.identity(base),'scratchRoot':str(root),'runId':legacy['runId'],'owner':legacy['owner'],'rootIdentity':q.identity(root),'contextSha256':legacy['contextSha256'],'retentionContextSha256':q.v.sha((base/'retention-context.json').read_bytes()),'stagingSha256':q.v.sha((base/'staging.json').read_bytes()),'preCleanupReportSha256':q.v.sha((base/'staged-report.json').read_bytes()),'retentionSourceSha256':q.v.sha((folder/'build/retention-source.json').read_bytes()),'files':rows}
        (base/'retention-capture.json').write_bytes(q.v.canonical(binding))
        # Transform only external build/provenance validation for synthetic non-binary bytes.
        for obj,name,value in ((q.v,'base_path',lambda:base),(q.v,'scratch',lambda p:(root,legacy['runId'],legacy['owner'])),(q.v,'staging',lambda p:(legacy,context,dict(report))),(q,'verify_payload',lambda f,r,final=False:q.file_rows(f,final)),(q.v,'validate_report',lambda *args:args[0])):
            p=patch.object(obj,name,value);p.start();self.addCleanup(p.stop)
        return root,base,folder,report,binding

    def test_exact_caps_source_closure_and_private_schema_match_producer(self):
        self.assertEqual(q.CAPS,producer.CAPS)
        self.assertEqual(q.SOURCE_PATHS,producer.SOURCE_PATHS)
        self.assertEqual(q.BINDING_KEYS,producer.CAPTURE_KEYS)
        self.assertEqual(len(q.CAPS),30)

    def test_stage_cleanup_publish_actual_files_and_second_publication_refusal(self):
        root,base,folder,report,binding=self.fixture();q.stage(root)
        self.assertEqual(q.json_file(base/'retention-staging.json'),binding)
        q.cleanup(base);self.assertFalse(root.exists())
        upload=base/'upload';upload.mkdir()
        report.update(directoryCleanup=True,passed=True)
        (upload/'report.json').write_bytes(q.v.canonical(report))
        for name in q.v.NAMES:(upload/name).write_bytes((folder/'build'/name).read_bytes())
        receipt=q.publish(base)
        self.assertEqual(len(receipt['files']),30)
        self.assertEqual(q.verify_packet(base/'retained-upload'),receipt)
        self.assertFalse(folder.exists())
        with self.assertRaises((ValueError,FileNotFoundError)):q.publish(base)

    def test_publish_rejects_self_consistent_replacement_after_initial_capture(self):
        for moment in ('verify','rename','attribution'):
            root,base,folder,report,binding=self.fixture();q.stage(root);q.cleanup(base)
            upload=base/'upload';upload.mkdir();report.update(directoryCleanup=True,passed=True)
            (upload/'report.json').write_bytes(q.v.canonical(report))
            for name in q.v.NAMES:(upload/name).write_bytes((folder/'build'/name).read_bytes())
            original_verify=q.verify_packet;original_rename=Path.rename
            def replace(at):
                if moment!='attribution':(at/'payload/server.jar').write_bytes(b'OTHER_INTERNALLY_CONSISTENT_SYNTHETIC_PAYLOAD')
                rows=q.file_rows(at,True)
                receipt=q.make_receipt(report,rows,{'githubRunId':'999' if moment=='attribution' else '123','githubRunAttempt':2 if moment=='attribution' else 1})
                (at/'retention-receipt.json').write_bytes(q.v.canonical(receipt))
                # The replacement is self-consistent, not a malformed receipt.
                self.assertEqual(original_verify(at),receipt)
            def verify(at):
                if moment in ('verify','attribution'):replace(at)
                return original_verify(at)
            def rename(at,to):
                result=original_rename(at,to)
                if moment=='rename':replace(to)
                return result
            with patch.object(q,'verify_packet',side_effect=verify),patch.object(Path,'rename',rename):
                with self.assertRaises(ValueError):q.publish(base)
            self.assertTrue((folder if moment in ('verify','attribution') else base/'retained-upload').exists())

    def test_stage_rejects_changed_capture_without_deleting_root(self):
        root,base,folder,report,binding=self.fixture();binding['owner']=str(uuid.uuid4())
        (base/'retention-capture.json').write_bytes(q.v.canonical(binding))
        with self.assertRaises(ValueError):q.stage(root)
        self.assertTrue(root.exists());self.assertFalse((base/'retention-staging.json').exists())

    def test_cleanup_rejects_same_token_replacement_and_unknown_file(self):
        for replacement in (False,True):
            root,base,folder,report,binding=self.fixture();q.stage(root)
            if replacement:
                old=root.with_name(root.name+'-old');root.rename(old);root.mkdir();(root/'.owner').write_text(binding['owner'])
            else:(root/'foreign').write_bytes(b'keep')
            with self.assertRaises(ValueError):q.cleanup(base)
            self.assertTrue((root/'.owner').exists())

    def test_cleanup_rechecks_identity_after_marker_unlink(self):
        root,base,folder,report,binding=self.fixture();q.stage(root);original=Path.unlink
        def unlink(path,*args,**kwargs):
            result=original(path,*args,**kwargs)
            if path==root/'.owner':
                root.rename(root.with_name(root.name+'-old'));root.mkdir()
            return result
        with patch.object(Path,'unlink',unlink):
            with self.assertRaises(ValueError):q.cleanup(base)
        self.assertTrue(root.exists())

    def test_closed_inventory_rejects_extra_empty_directory_and_hardlink(self):
        for mutation in ('file','directory','hardlink'):
            root,base,folder,report,binding=self.fixture()
            if mutation=='file':(folder/'extra').write_bytes(b'x')
            elif mutation=='directory':(folder/'empty').mkdir()
            else:os.link(folder/'payload/server.jar',base/'other-link')
            with self.assertRaises(ValueError):q.file_rows(folder)

    def test_public_receipt_canonical_order_and_payload_tamper_refuse(self):
        root,base,folder,report,binding=self.fixture();report.update(directoryCleanup=True,passed=True)
        (folder/'build/report.json').write_bytes(q.v.canonical(report))
        rows=[]
        for name in sorted(q.CAPS):
            raw=(folder/name).read_bytes();rows.append({'path':name,'bytes':len(raw),'sha256':q.v.sha(raw)})
        receipt=q.make_receipt(report,rows,{'githubRunId':'123','githubRunAttempt':1})
        file=folder/'retention-receipt.json';file.write_bytes(q.v.canonical(receipt))
        self.assertEqual(q.verify_packet(folder),receipt)
        file.write_bytes(q.v.canonical(dict(reversed(list(receipt.items())))))
        with self.assertRaises(ValueError):q.verify_packet(folder)
        file.write_bytes(q.v.canonical(receipt));(folder/'payload/server.jar').write_bytes(b'changed')
        with self.assertRaises(ValueError):q.verify_packet(folder)

    def test_diagnostics_are_closed_and_do_not_echo_exception_or_path(self):
        for action in ('stage','cleanup','publish'):
            out=io.StringIO()
            with patch.object(q,action,side_effect=ValueError('PRIVATE/secret')),contextlib.redirect_stdout(out):
                self.assertEqual(q.main([action,'PRIVATE/path']),1)
            lines=out.getvalue().splitlines()
            self.assertEqual(len(lines),2);self.assertNotIn('PRIVATE',out.getvalue())
            self.assertEqual(lines[1],'DERIVED_PAIR_RETENTION_FAILED')
            self.assertRegex(lines[0],r'^DERIVED_PAIR_RETENTION_DIAG\|(VALIDATE|CLEANUP|PUBLISH)\|[A-Z_]+\|PREDICATE$')


@contextlib.contextmanager
def semantic_packet(folder):
    """Real strict build/DEX/CLI/schema; only archive/notice provenance is synthetic."""
    from test_validate_derived_pair_build import fixture,bind
    from test_derived_pair_build import dex_fixture,pe_fixture
    import zipfile
    report,m=fixture();report.update(directoryCleanup=False,passed=False)
    dex=dex_fixture();stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w',compression=zipfile.ZIP_DEFLATED) as z:z.writestr('classes.dex',dex)
    server=stream.getvalue();dll=pe_fixture()
    m['outputs.json']['server'].update(bytes=len(server),sha256=q.v.sha(server),entries=[{'name':'classes.dex','bytes':len(dex),'sha256':q.v.sha(dex)}])
    m['outputs.json']['consumer'].update(bytes=len(dll),sha256=q.v.sha(dll))
    report['serverOutput']={'bytes':len(server),'sha256':q.v.sha(server),'dexBytes':len(dex),'dexSha256':q.v.sha(dex)}
    report['consumerOutput']={'bytes':len(dll),'sha256':q.v.sha(dll)}
    m['server-build.json'].update(serverBytes=len(server),serverSha256=q.v.sha(server))
    m['consumer-build.json']['consumerSha256']=q.v.sha(dll)
    payload={'payload/server.jar':server,'payload/RetainedVideoConsumer.dll':dll}
    for name in q.v.GENERATED:
        raw=q.v.BUILD_CONFIG if name.endswith('BuildConfig.java') else b'SYNTHETIC GENERATED JAVA'
        payload['generated/'+name]=raw
        row=next(r for r in m['generated.json']['files'] if r['namespace']=='GENERATED' and r['path']==name)
        row.update(bytes=len(raw),sha256=q.v.sha(raw))
    notices=(b'SYNTHETIC NOTICE',b'SYNTHETIC PROPERTIES')
    inputs=tuple((name,len(raw),q.v.sha(raw)) for (name,_,_),raw in zip(q.n.INPUTS[:2],notices))+q.n.INPUTS[2:]
    for name,size,digest in inputs:
        row=next((r for r in m['tools.json']['files'] if r['namespace']=='BUILD_TOOLS36' and r['path']==name),None)
        if row is not None:row.update(bytes=size,sha256=digest)
    # Build manifest digest links are recalculated, not bypassed.
    bind(report,m)
    for field in ('toolchainManifestSha256','dependenciesManifestSha256','buildCommandSha256'):
        m['server-build.json'][field]=report[field]
    manifests=bind(report,m)
    payload.update({'build/'+k:raw for k,raw in manifests.items()})
    payload['source/upstream.tar.gz']=b'SYNTHETIC_ARCHIVE'
    for name in ('verified-selected-source-manifest.json','verified-full-source-manifest.json','auto-video-nonce-v1.patch','source-provenance.json'):
        payload['source/'+name]=(q.REPO/'desktop/video-source'/name).read_bytes()
    for name in q.v.CS:payload['source/auto/'+name]=(q.REPO/'desktop'/name).read_bytes()
    license_raw=b'L'*11387;readme=b'SYNTHETIC README'
    payload['source/upstream-LICENSE']=license_raw;payload['source/upstream-README.md']=readme
    payload['notice/NOTICE.txt'],payload['notice/source.properties']=notices
    payload['notice/capture-receipt.json']=(q.REPO/q.NOTICE_RECEIPT).read_bytes()
    closure=[]
    for name in q.SOURCE_PATHS:
        raw=(q.REPO/name).read_bytes();closure.append({'path':name,'bytes':len(raw),'sha256':q.v.sha(raw)})
    payload['build/retention-source.json']=q.v.canonical({'version':1,'autoSourceCommit':report['autoSourceCommit'],'autoSourceTree':report['autoSourceTree'],'files':closure})
    folder.mkdir()
    for name,raw in payload.items():
        at=folder/name;at.parent.mkdir(parents=True,exist_ok=True);at.write_bytes(raw)
    with patch.object(q.n,'INPUTS',inputs),patch.object(q.h,'inspect_archive',return_value=({},readme)),patch.object(q.h,'apply_patch',return_value=None),patch.object(q,'LICENSE_SHA',q.v.sha(license_raw)):
        yield report,payload

class SemanticTests(unittest.TestCase):
    def test_strict_semantic_packet_with_real_static_binary_parsers_and_tamper(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp).resolve()/'packet'
            with semantic_packet(folder) as (report,payload):
                self.assertEqual(len(q.verify_payload(folder,report)),29)
                generated=folder/'generated'/q.v.GENERATED[0]
                original=generated.read_bytes();generated.write_bytes(b'changed')
                with self.assertRaises(ValueError):q.verify_payload(folder,report)
                generated.write_bytes(original)
                (folder/'payload/RetainedVideoConsumer.dll').write_bytes(b'MZ_NOT_A_MANAGED_DLL')
                with self.assertRaises(ValueError):q.verify_payload(folder,report)

if __name__=='__main__':unittest.main()
