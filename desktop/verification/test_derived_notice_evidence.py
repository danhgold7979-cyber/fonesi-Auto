"""Synthetic owned-files only; no real SDK capture or process execution."""
import contextlib
import io
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
import uuid
import derived_notice_evidence as n


class NoticeTests(unittest.TestCase):
    def fixture(self,text=b'Vendor notice\r\n'):
        tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup);top=Path(tmp.name).resolve()
        root=top/('run-'+str(uuid.uuid4()));base=top/'base';sdk=top/'sdk';repo=top/'repo'
        for d in (root,base,sdk,repo):d.mkdir()
        owner=str(uuid.uuid4());bo=str(uuid.uuid4())
        (root/'.owner').write_text(owner);(base/'.owner').write_text(bo)
        inputs=[]
        for name,raw in [('NOTICE.txt',text),('source.properties',b'Pkg.Revision=36.0.0\n'),('aidl.exe',b'NEVER_EXECUTE'),('lib/d8.jar',b'NEVER_LOAD'),('core-lambda-stubs.jar',b'NEVER_LOAD')]:
            p=sdk/name;p.parent.mkdir(exist_ok=True);p.write_bytes(raw);inputs.append((name,len(raw),n.h.sha(raw)))
        rows=[{'namespace':'BUILD_TOOLS36','path':name,'bytes':size,'sha256':digest} for name,size,digest in inputs]
        baseline={'tools.json':{'files':rows},'dependencies.json':{'entries':rows},'report.json':{'passed':True,'failure':None,'directoryCleanup':True}}
        pins={}
        for name,value in baseline.items():
            p=repo/n.SAMPLE/name;p.parent.mkdir(parents=True,exist_ok=True);raw=n.h.canonical(value);p.write_bytes(raw);pins[name]=n.h.sha(raw)
        for name in n.CLOSURE:
            p=repo/name
            if not p.exists():p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'SYNTHETIC_SOURCE_NEVER_EXECUTED')
        supervisors={name:n.h.sha((repo/name).read_bytes()) for name in n.SUPERVISORS}
        for key,value in [('REPO',repo),('BASE',base),('SDK',sdk),('INPUTS',tuple(inputs)),('BASELINES',pins),('SUPERVISORS',supervisors)]:
            p=patch.object(n,key,value);p.start();self.addCleanup(p.stop)
        c={'version':1,'owner':owner,'baseOwner':bo,'scratchRoot':str(root),'autoSourceCommit':'1'*40,'autoSourceTree':'2'*40,'buildToolsRoot':str(sdk),'sourceClosure':[{'name':name,'sha256':n.h.sha((repo/name).read_bytes())} for name in n.CLOSURE]}
        n.write_json(root/'context.json',c)
        return root,base,sdk,repo,c

    def completed(self):
        root,base,sdk,repo,c=self.fixture();n.capture(root);n.stage(root,base);n.cleanup(root,base)
        self.processes(base)
        return root,base,sdk,repo,c

    def processes(self,base):
        p={'version':1,'contextSha256':n.h.sha((base/'context.json').read_bytes())}
        for key,marker in [('capture','CAPTURED'),('stage','STAGED'),('cleanup','CLEANED')]:p[key]={'status':'SUCCESS','exitCode':0,'cleanupComplete':True,'stdoutTruncated':False,'stderrTruncated':False,'stderrEmpty':True,'marker':'DERIVED_NOTICE_'+marker}
        p['directoryCleanup']=True;n.write_json(base/'processes.json',p)

    def test_real_owned_four_action_composition_exact_receipt_and_bytes(self):
        root,base,sdk,repo,c=self.completed();receipt=n.publish(base)
        self.assertTrue(receipt['passed']);self.assertFalse(root.exists())
        self.assertNotEqual(root.name[4:],c['owner'])
        self.assertEqual(n.json_read(base/'staging.json')['scratchRoot'],c['scratchRoot'])
        self.assertEqual({p.name for p in (base/'upload').iterdir()},{'NOTICE.txt','source.properties','receipt.json'})
        self.assertEqual((base/'upload/NOTICE.txt').read_bytes(),b'Vendor notice\r\n')
        self.assertEqual(n.h.canonical(receipt),(base/'upload/receipt.json').read_bytes())
        with self.assertRaises(ValueError):n.publish(base)

    def test_exact_text_preserves_bom_and_refuses_invalid_utf8_nul(self):
        for raw,valid in [(b'\xef\xbb\xbfVendor\r\n',True),(b'bad\xff',False),(b'bad\0',False)]:
            with self.subTest(raw=raw):
                root,base,sdk,repo,c=self.fixture(raw)
                if valid:n.capture(root);self.assertEqual((root/'NOTICE.txt').read_bytes(),raw)
                else:
                    with self.assertRaises(ValueError):n.capture(root)

    def test_each_original_input_mutation_refuses_capture(self):
        for index in range(5):
            root,base,sdk,repo,c=self.fixture();p=sdk/n.INPUTS[index][0];p.write_bytes(p.read_bytes()+b'x')
            with self.assertRaises(ValueError):n.capture(root)
            self.assertFalse((root/'capture.json').exists())

    def test_source_and_baseline_changes_refuse(self):
        for name in (n.CLOSURE[0],n.SAMPLE+'tools.json'):
            root,base,sdk,repo,c=self.fixture();(repo/name).write_bytes(b'changed')
            with self.assertRaises(ValueError):n.capture(root)

    def test_unknown_scratch_entry_prevents_deletion(self):
        root,base,sdk,repo,c=self.fixture();n.capture(root);n.stage(root,base);(root/'foreign').write_bytes(b'unknown')
        with self.assertRaises(ValueError):n.cleanup(root,base)
        self.assertTrue((root/'NOTICE.txt').exists());self.assertTrue((root/'foreign').exists())

    def test_same_token_replacement_and_owner_change_refuse(self):
        for replace_base in (False,True):
            root,base,sdk,repo,c=self.fixture();n.capture(root);n.stage(root,base)
            target=base if replace_base else root;saved=target.with_name(target.name+'-original');target.rename(saved);shutil.copytree(saved,target)
            with self.assertRaises(ValueError):n.cleanup(root,base)
            self.assertTrue((root/'NOTICE.txt').exists())
        root,base,sdk,repo,c=self.fixture();n.capture(root);n.stage(root,base);(root/'.owner').write_text(str(uuid.uuid4()))
        with self.assertRaises(ValueError):n.cleanup(root,base)

    def test_publish_rechecks_original_inputs_and_source_not_only_copies(self):
        for change in ('input','source'):
            root,base,sdk,repo,c=self.completed();target=sdk/'aidl.exe' if change=='input' else repo/n.CLOSURE[0];target.write_bytes(b'changed')
            with self.assertRaises(ValueError):n.publish(base)
            self.assertFalse((base/'upload/receipt.json').exists())

    def test_final_original_input_recheck_cannot_hide_staged_text_mutation(self):
        root,base,sdk,repo,c=self.completed();original=n.inputs
        def mutate_staged():
            result=original();file=base/'upload/NOTICE.txt';raw=file.read_bytes();file.write_bytes(b'X'+raw[1:]);return result
        with patch.object(n,'inputs',side_effect=mutate_staged):
            with self.assertRaises(ValueError):n.publish(base)
        self.assertFalse((base/'upload/receipt.json').exists())
        self.assertTrue((base/'upload/NOTICE.txt').exists())

    def test_process_unknown_truncation_and_boolean_exit_refuse(self):
        for field,value in [('status','UNRETIRED'),('exitCode',False),('stdoutTruncated',True),('stderrEmpty',False),('cleanupComplete',False)]:
            root,base,sdk,repo,c=self.completed();p=n.json_read(base/'processes.json');p['capture'][field]=value;(base/'processes.json').write_bytes(n.h.canonical(p))
            with self.assertRaises(ValueError):n.publish(base)

    def test_duplicate_extra_context_and_symlink_refuse(self):
        root,base,sdk,repo,c=self.fixture();raw=(root/'context.json').read_bytes();(root/'context.json').write_bytes(raw.replace(b'"version":1',b'"version":1,"version":1'))
        with self.assertRaises(ValueError):n.capture(root)
        root,base,sdk,repo,c=self.fixture();c['extra']=True;(root/'context.json').write_bytes(n.h.canonical(c))
        with self.assertRaises(ValueError):n.capture(root)
        root,base,sdk,repo,c=self.fixture();p=sdk/'NOTICE.txt';original=sdk/'original';p.rename(original)
        try:p.symlink_to(original)
        except OSError:self.skipTest('host cannot create symlink')
        with self.assertRaises(ValueError):n.capture(root)

    def test_cleanup_final_owner_fence_and_uncertain_root_retention(self):
        root,base,sdk,repo,c=self.fixture();n.capture(root);n.stage(root,base)
        original=n.inputs
        def revoke():
            result=original();(root/'.owner').write_text(str(uuid.uuid4()));return result
        with patch.object(n,'inputs',side_effect=revoke):
            with self.assertRaises(ValueError):n.cleanup(root,base)
        self.assertTrue((root/'NOTICE.txt').exists())
        root,base,sdk,repo,c=self.fixture();n.capture(root);n.stage(root,base);n.cleanup(root,base);root.mkdir();(root/'.owner').write_text(c['owner']);self.processes(base)
        with self.assertRaises(ValueError):n.publish(base)
        self.assertTrue(root.exists());self.assertFalse((base/'upload/receipt.json').exists())

    def test_marker_last_identity_fence_preserves_same_token_replacement(self):
        root,base,sdk,repo,c=self.fixture();n.capture(root);n.stage(root,base)
        original=Path.unlink;old=root.with_name(root.name+'-original')
        def replace_after_marker(path,*args,**kwargs):
            result=original(path,*args,**kwargs)
            if path==root/'.owner':
                root.rename(old);root.mkdir();(root/'.owner').write_text(c['owner'])
            return result
        with patch.object(Path,'unlink',replace_after_marker):
            with self.assertRaises(ValueError):n.cleanup(root,base)
        self.assertTrue(root.is_dir());self.assertEqual((root/'.owner').read_text(),c['owner'])
        self.assertTrue(old.is_dir())

    def test_partial_staging_and_unknown_publication_entry_refuse(self):
        root,base,sdk,repo,c=self.fixture();n.capture(root);original=n.h.write_new
        def partial(path,*args,**kwargs):
            if Path(path)==base/'upload/source.properties':raise OSError('PRIVATE')
            return original(path,*args,**kwargs)
        with patch.object(n.h,'write_new',side_effect=partial):
            with self.assertRaises(OSError):n.stage(root,base)
        with self.assertRaises(ValueError):n.cleanup(root,base)
        self.assertTrue((root/'NOTICE.txt').exists())
        root,base,sdk,repo,c=self.completed();(base/'upload/foreign').write_bytes(b'unknown')
        with self.assertRaises(ValueError):n.publish(base)
        self.assertFalse((base/'upload/receipt.json').exists())

    def test_fixed_cli_no_raw_exception_or_arbitrary_action(self):
        class Hostile(Exception):
            def __str__(self):raise AssertionError('PRIVATE')
        output=io.StringIO()
        with patch.object(n,'capture',side_effect=Hostile()),contextlib.redirect_stdout(output):self.assertEqual(n.main(['capture','PRIVATE']),1)
        self.assertEqual(output.getvalue(),'DERIVED_NOTICE_FAILED|INTERNAL_FAILURE\n')
        output=io.StringIO()
        with contextlib.redirect_stdout(output):self.assertEqual(n.main(['arbitrary']),1)
        self.assertNotIn('PRIVATE',output.getvalue())


if __name__=='__main__':unittest.main()
