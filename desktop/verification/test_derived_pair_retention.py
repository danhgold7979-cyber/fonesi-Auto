"""Synthetic payload and owned copy tests; no compiler, SDK capture or retained real binary."""
import contextlib
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import uuid
import derived_pair_retention as r

class RetentionTests(unittest.TestCase):
    def fixture(self):
        tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup);top=Path(tmp.name).resolve();root=top/('derived-pair-'+str(uuid.uuid4()));base=top/'base'
        root.mkdir();base.mkdir();(root/'private').mkdir()
        for folder in (root,base):(folder/'.owner').write_text(str(uuid.uuid4()))
        report={'synthetic':True};raw=r.h.canonical(report);(root/'private/report.json').write_bytes(raw)
        context={'autoCommit':'1'*40,'autoTree':'2'*40}
        legacy={'scratchRoot':str(root),'runId':root.name[13:],'owner':r.h.owner(root)[0],'baseOwner':r.h.owner(base)[0],'contextSha256':'3'*64,'reportSha256':r.h.sha(raw)}
        (base/'staging.json').write_bytes(r.h.canonical(legacy));(base/'retention-context.json').write_bytes(r.h.canonical({'version':1,'githubRunId':'1234','githubRunAttempt':1}))
        data={name:b'SYNTHETIC_NOT_EXECUTABLE' for name in r.CAPS if name!='build/report.json'}
        for obj,name,value in ((r,'BASE',base),(r.v,'staging',lambda b:(legacy,context,report)),(r,'payload',lambda a,b,c:dict(data))):
            p=patch.object(obj,name,value);p.start();self.addCleanup(p.stop)
        return root,base,data

    def test_closed_29_copies_no_report_no_source_mutation(self):
        root,base,data=self.fixture();before=(root/'private/report.json').read_bytes();result=r.stage(root)
        self.assertEqual(tuple(result),r.CAPTURE_KEYS);self.assertEqual(len(result['files']),29)
        self.assertEqual((root/'private/report.json').read_bytes(),before)
        for row in result['files']:
            path=base/'retained-stage'/row['path'];self.assertEqual(path.read_bytes(),data[row['path']]);self.assertEqual(path.stat().st_nlink,1)
        self.assertFalse((base/'retained-stage/build/report.json').exists());self.assertFalse((base/'retained-stage/retention-receipt.json').exists())
        with self.assertRaises(FileExistsError):r.stage(root)

    def test_payload_shape_and_perfile_caps(self):
        _,_,data=self.fixture();r.validate_payload(data)
        for mutate in (lambda d:d.update(foreign=b'x'),lambda d:d.pop('payload/server.jar'),lambda d:d.update({'payload/server.jar':b'x'*8388609})):
            bad=dict(data);mutate(bad)
            with self.assertRaises(ValueError):r.validate_payload(bad)

    def test_original_change_during_copy_refuses_seal(self):
        root,base,data=self.fixture();calls=0
        def changes(*args):
            nonlocal calls
            calls+=1;value=dict(data)
            if calls>1:value['payload/server.jar']=b'changed'
            return value
        with patch.object(r,'payload',side_effect=changes):
            with self.assertRaises(ValueError):r.stage(root)
        self.assertFalse((base/'retention-capture.json').exists());self.assertTrue(root.exists())

    def test_destination_tamper_during_final_source_check_refuses(self):
        root,base,data=self.fixture();calls=0
        def changes(*args):
            nonlocal calls
            calls+=1
            if calls>1:(base/'retained-stage/payload/server.jar').write_bytes(b'changed')
            return dict(data)
        with patch.object(r,'payload',side_effect=changes):
            with self.assertRaises(ValueError):r.stage(root)
        self.assertFalse((base/'retention-capture.json').exists())

    def test_unknown_file_and_emptydirectory_refuse(self):
        for directory in (False,True):
            root,base,data=self.fixture();calls=0
            def changes(*args):
                nonlocal calls
                calls+=1
                if calls>1:
                    path=base/'retained-stage/foreign'
                    if directory:path.mkdir()
                    else:path.write_bytes(b'unknown')
                return dict(data)
            with patch.object(r,'payload',side_effect=changes):
                with self.assertRaises(ValueError):r.stage(root)
            self.assertFalse((base/'retention-capture.json').exists())

    def test_unknown_subtree_rejected_without_descending_or_unbounded_iteration(self):
        root,base,data=self.fixture();folder=base/'inventory';folder.mkdir();unknown=folder/'foreign';unknown.mkdir()
        witness=unknown/'retained';witness.write_bytes(b'not ours')
        original=Path.iterdir;visited=[]
        def bounded(path):
            visited.append(path)
            if path==unknown:raise AssertionError('unknown subtree traversed')
            if path==folder:
                yield unknown
                raise AssertionError('continued after unknown entry')
            else:yield from original(path)
        with patch.object(Path,'iterdir',bounded):
            with self.assertRaises(ValueError):r.inventory(folder,data)
        self.assertNotIn(unknown,visited);self.assertEqual(witness.read_bytes(),b'not ours')
        # A hostile iterator cannot consume more than the fixed admitted entry count.
        known=folder/'known';known.write_bytes(b'x');calls=0
        def repeated(path):
            nonlocal calls
            for _ in range(1000000):calls+=1;yield known
        with patch.object(Path,'iterdir',repeated):
            with self.assertRaises(ValueError):r.inventory(folder,{'known'})
        self.assertEqual(calls,2);self.assertTrue(known.exists())

    def test_partial_write_keeps_original_and_no_receipt(self):
        root,base,data=self.fixture();original=r.h.write_new
        def writing(path,*args):
            if path.name=='server.jar':raise OSError('PRIVATE')
            return original(path,*args)
        with patch.object(r.h,'write_new',side_effect=writing):
            with self.assertRaises(OSError):r.stage(root)
        self.assertTrue(root.exists());self.assertFalse((base/'retention-capture.json').exists())

    def test_same_token_root_replacement_refuses(self):
        root,base,data=self.fixture();calls=0
        def changes(*args):
            nonlocal calls
            calls+=1
            if calls==2:
                token=(root/'.owner').read_bytes();root.rename(root.with_name('old'));root.mkdir();(root/'.owner').write_bytes(token)
                (root/'private').mkdir();(root/'private/report.json').write_bytes(r.h.canonical({'synthetic':True}))
            return dict(data)
        with patch.object(r,'payload',side_effect=changes):
            with self.assertRaises(ValueError):r.stage(root)
        self.assertFalse((base/'retention-capture.json').exists())

    def test_retained_hardlink_refuses_independent_copy_claim(self):
        root,base,data=self.fixture();calls=0
        def changes(*args):
            nonlocal calls
            calls+=1
            if calls==2:os.link(base/'retained-stage/payload/server.jar',base/'second-link')
            return dict(data)
        with patch.object(r,'payload',side_effect=changes):
            with self.assertRaises(ValueError):r.stage(root)
        self.assertFalse((base/'retention-capture.json').exists())

    def test_failed_report_cannot_enter_payload_output_copy(self):
        # Real payload gate, synthetic source/manifest admission only; output inspector must not run.
        context={'autoCommit':'1'*40,'autoTree':'2'*40}
        state={'context':context}
        report={'failure':'COMPILE_FAILED','directoryCleanup':False,'passed':False}
        with patch.object(r.h,'revalidate',return_value=state),patch.object(r.h,'closed_layout'),patch.object(r.v,'load_manifests',return_value={}),patch.object(r.v,'validate_report'),patch.object(r.v,'check_output_bytes',side_effect=AssertionError('UNREACHABLE')):
            with self.assertRaises(ValueError):r.payload(Path('/synthetic'),context,report)

    def test_producer_copy_to_strict_independent_publish_semantic_packet(self):
        import validate_retained_pair_evidence as q
        from test_validate_retained_pair_evidence import semantic_packet
        root,base,_=self.fixture();source=base/'synthetic-source-packet'
        with semantic_packet(source) as (observed,payload):
            final=dict(observed);final.update(directoryCleanup=True,passed=True)
            pre=dict(final);pre.update(directoryCleanup=False,passed=False)
            raw=r.h.canonical(pre);(root/'private/report.json').write_bytes(raw);(base/'staged-report.json').write_bytes(raw)
            context={'autoCommit':pre['autoSourceCommit'],'autoTree':pre['autoSourceTree']}
            legacy={'scratchRoot':str(root),'runId':root.name[13:],'owner':r.h.owner(root)[0],'baseOwner':r.h.owner(base)[0],'contextSha256':'3'*64,'reportSha256':r.h.sha(raw)}
            (base/'staging.json').write_bytes(r.h.canonical(legacy))
            # Explicit synthetic original build/provenance admission. Copy and the independent
            # complete report/manifests/generated/DEX/CLI/notice validation remain real.
            with patch.object(r,'payload',return_value=payload),patch.object(r.v,'staging',return_value=(legacy,context,pre)),patch.object(q.v,'base_path',return_value=base),patch.object(q.v,'scratch',return_value=(root,legacy['runId'],legacy['owner'])),patch.object(q.v,'staging',return_value=(legacy,context,pre)):
                r.stage(root);q.stage(root)
                # This fixture root has only the mocked build report, not compiler work files.
                (root/'private/report.json').unlink();(root/'private').rmdir()
                q.cleanup(base);self.assertFalse(root.exists())
                upload=base/'upload';upload.mkdir()
                for name in q.v.NAMES:(upload/name).write_bytes(payload['build/'+name])
                (upload/'report.json').write_bytes(q.v.canonical(final))
                receipt=q.publish(base)
                self.assertEqual(q.verify_packet(base/'retained-upload'),receipt)
                self.assertEqual(len(receipt['files']),30)

    def test_runcontext_exact_and_inert_diagnostics(self):
        root,base,data=self.fixture();(base/'retention-context.json').write_bytes(b'{"version":1,"githubRunId":"01","githubRunAttempt":1}')
        with self.assertRaises(ValueError):r.stage(root)
        class Hostile(Exception):
            def __str__(self):raise AssertionError('PRIVATE')
        output=io.StringIO()
        with patch.object(r,'stage',side_effect=Hostile()),contextlib.redirect_stdout(output):self.assertEqual(r.main(['stage','PRIVATE']),1)
        self.assertEqual(output.getvalue(),'DERIVED_PAIR_RETENTION_DIAG|COPY|OWNER|INTERNAL\nDERIVED_PAIR_RETENTION_FAILED\n')

if __name__=='__main__':unittest.main()
