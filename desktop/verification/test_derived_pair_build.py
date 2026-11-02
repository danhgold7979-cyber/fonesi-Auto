"""Owned-file and synthetic byte fixtures only; no compiler, download or payload execution."""
import copy
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import struct
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import uuid
import zipfile
import zlib
import derived_pair_build as d


def dex_fixture(name='Lcom/genymobile/scrcpy/Server;'):
    raw=bytearray(160+len(name)+2);raw[:8]=b'dex\n035\0'
    def u(off,value):struct.pack_into('<I',raw,off,value)
    u(32,len(raw));u(36,112);u(40,0x12345678);u(56,1);u(60,112);u(64,1);u(68,116);u(96,1);u(100,120)
    u(112,160);u(116,0);u(120,0);raw[160]=len(name);raw[161:161+len(name)]=name.encode();raw[-1]=0
    raw[12:32]=hashlib.sha1(raw[32:]).digest();u(8,zlib.adler32(raw[12:])&0xffffffff)
    return bytes(raw)


def pe_fixture():
    b=bytearray(1024);b[:2]=b'MZ';struct.pack_into('<I',b,60,128);b[128:132]=b'PE\0\0'
    struct.pack_into('<HH',b,132,34404,1);struct.pack_into('<HH',b,148,240,0x2000)
    op=152;struct.pack_into('<H',b,op,523);struct.pack_into('<I',b,op+108,16)
    struct.pack_into('<II',b,op+112+14*8,0x2000,72)
    struct.pack_into('<IIII',b,op+240+8,512,0x2000,512,512)
    struct.pack_into('<IHHIIII',b,512,72,2,5,0x2080,128,1,0)
    md=640;b[md:md+4]=b'BSJB';struct.pack_into('<I',b,md+12,4);b[md+16:md+20]=b'v4\0\0';struct.pack_into('<HH',b,md+20,0,2)
    struct.pack_into('<II',b,md+24,64,16);b[md+32:md+36]=b'#~\0\0'
    struct.pack_into('<II',b,md+36,80,16);b[md+44:md+56]=b'#Strings\0\0\0\0'
    return bytes(b)


def streamed_zip_fixture():
    class NonSeeking(io.BytesIO):
        def seekable(self):return False
        def seek(self,*args):raise OSError('synthetic unseekable stream')
    stream=NonSeeking()
    with zipfile.ZipFile(stream,'w',compression=zipfile.ZIP_DEFLATED) as archive:archive.writestr('classes.dex',dex_fixture())
    return stream.getvalue()


class DerivedPairBuildTests(unittest.TestCase):
    def root(self):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup);base=Path(temp.name).resolve();root=base/'run';root.mkdir();(root/'.owner').write_text(str(uuid.uuid4()))
        return base,root

    def tools(self,base):
        c={'version':1,'autoCommit':'1'*40,'autoTree':'2'*40,'runnerImage':'win22/20261101.1'}
        for ns,key in d.TOOL_KEYS.items():
            folder=base/ns;folder.mkdir();c[key]=str(folder)
            for name in d.TOOL_FILES[ns]:
                p=folder/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'SYNTHETIC_TOOL_NEVER_EXECUTED')
        c.update(jdkVersion='17.0.17',jdkVendor='TEMURIN',platformRevision='2',buildToolsVersion='36.0.0',consumerCompilerVersion='4.8.1.0')
        (Path(c['jdkRoot'])/'release').write_text('JAVA_VERSION="17.0.17"\n')
        (Path(c['platformRoot'])/'source.properties').write_text('AndroidVersion.ApiLevel=36\nPkg.Revision=2\n')
        (Path(c['buildToolsRoot'])/'source.properties').write_text('Pkg.Revision=36.0.0\n')
        file=base/'context.json';file.write_bytes(d.canonical(c));return c,file

    def prepared(self):
        base,root=self.root();c,context=self.tools(base);_,selected=d.packet()
        files={r['path']:b'SYNTHETIC_SOURCE\n' for r in selected['files']}
        # Explicit synthetic acquisition/patch seam only; actual owned materialization and tool scans run.
        with patch.object(d,'inspect_archive',return_value=(files,b'synthetic README')),patch.object(d,'apply_patch',return_value=(files,'a'*64)):
            state=d.prepare(root,base/'not-opened.tar.gz',context)
        return base,root,c,state

    def test_exact_reviewed_manifests_and_no_implicit_binary_admission(self):
        full,selected=d.packet();self.assertEqual((len(full['files']),len(selected['files'])),(387,95))
        self.assertEqual(sum(r['bytes'] for r in selected['files']),454057)
        self.assertEqual(d.NATIVE[-1],'native/RetainedVideoSession.cs')
        self.assertNotIn('subprocess',Path(d.__file__).read_text())

    def test_owned_prepare_no_clobber_actual_source_tool_fences(self):
        base,root,c,state=self.prepared();self.assertEqual(len(state['source']['effective']),100)
        self.assertEqual(d.parse(d.read(root/'private/context.json',8192)),c)
        self.assertEqual(d.revalidate(root)['owner'],(root/'.owner').read_text())
        with self.assertRaises(ValueError):d.prepare(root,base/'x',base/'context.json')
        source=root/'source'/state['source']['effective'][-1]['path'];source.write_bytes(b'changed')
        with self.assertRaises(ValueError):d.revalidate(root)

    def test_tool_version_hash_symlink_and_unknown_source_refusal(self):
        base,root,c,state=self.prepared();tool=Path(c['jdkRoot'])/'bin/java.exe';tool.write_bytes(b'changed')
        with self.assertRaises(ValueError):d.revalidate(root)
        tool.write_bytes(b'SYNTHETIC_TOOL_NEVER_EXECUTED');(root/'source/extra.java').write_text('foreign')
        with self.assertRaises(ValueError):d.revalidate(root)
        (root/'source/extra.java').unlink();tool.unlink();tool.symlink_to(Path(c['jdkRoot'])/'bin/javac.exe')
        with self.assertRaises(ValueError):d.revalidate(root)

    def test_fixed_absolute_stage_plans_no_implicit_cwd_or_shell_or_default_csc_refs(self):
        base,root,c,s=self.prepared()
        p,pub=d.make_plan(root,'aidlClipboard',s);self.assertTrue(Path(p['arguments'][-1]).is_absolute());self.assertEqual(pub['workingDirectory'],'EXECUTABLE_DIRECTORY')
        p,pub=d.make_plan(root,'javac',s);self.assertEqual(p['arguments'][:2],['-J-Xmx512m','-J-XX:-UsePerfData']);self.assertEqual(p['arguments'].count('-J-XX:-UsePerfData'),1);self.assertIn('-proc:none',p['arguments']);self.assertIn('-J-Duser.home='+str(root/'private/java-home'),p['arguments']);self.assertEqual(p['deadlineMs'],120000)
        p,pub=d.make_plan(root,'consumerCsc',s);self.assertEqual(p['arguments'][:2],['/noconfig','/nostdlib+']);self.assertEqual(len([a for a in p['arguments'] if a.startswith('/reference:')]),3)
        self.assertEqual(len([a for a in p['arguments'] if a.endswith('.cs')]),5)
        with self.assertRaises(ValueError):d.make_plan(root,'arbitrary',s)

    def test_plan_exclusive_and_prior_real_receipt_required(self):
        base,root,c,s=self.prepared();d.plan(root,'aidlClipboard')
        with self.assertRaises(FileExistsError):d.plan(root,'aidlClipboard')
        with self.assertRaises(OSError):d.plan(root,'aidlDisplay')
        p={'status':'NONZERO_EXIT','exitCode':1,'cleanupComplete':True,'stdoutTruncated':False,'stderrTruncated':False}
        d.write_json(root/'private/process-aidlClipboard.json',p)
        with self.assertRaises(ValueError):d.plan(root,'aidlDisplay')
        self.assertFalse((root/'private/plan-aidlDisplay.json').exists())

    def test_actual_dex_checksum_descriptor_closure_and_mutations(self):
        good=dex_fixture();classes,ns=d.inspect_dex(good);self.assertEqual(classes,['Lcom/genymobile/scrcpy/Server;']);self.assertEqual(ns,[{'prefix':'com.genymobile.scrcpy','count':1}])
        for bad in (good[:-1],good[:12]+b'X'+good[13:],dex_fixture('Lkotlin/Unit;'),dex_fixture('Lcom/genymobile/scrcpy/Bad-Name;')):
            with self.assertRaises(ValueError):d.inspect_dex(bad)

    def test_actual_pe_requires_amd64_dll_clr_and_bounded_metadata_not_magic_only(self):
        good=pe_fixture();self.assertEqual(d.inspect_pe(good),{'machine':34404,'optionalMagic':523})
        for off,value in ((132,0),(151,0),(640,0),(152+112+14*8+1,0)):
            bad=bytearray(good);bad[off]=value
            with self.assertRaises(ValueError):d.inspect_pe(bytes(bad))
        with self.assertRaises(ValueError):d.inspect_pe(b'MZ'+b'\0'*100)

    def test_actual_zip_output_inventory_and_no_library_side_payload(self):
        base,root=self.root();(root/'output').mkdir()
        def archive(extra=False):
            with zipfile.ZipFile(root/'output/classes.zip','w',compression=zipfile.ZIP_DEFLATED) as z:
                z.writestr('classes.dex',dex_fixture())
                if extra:z.writestr('kotlin/secret',b'not admitted')
        archive();(root/'output/RetainedVideoConsumer.dll').write_bytes(pe_fixture())
        result,_,_=d.inspect_outputs(root);self.assertEqual(result['dexClasses'],['Lcom/genymobile/scrcpy/Server;'])
        archive(True)
        with self.assertRaises(ValueError):d.inspect_outputs(root)

    def test_strict_patch_actual_algorithm_rejects_offset_context_and_output_hash(self):
        base,root=self.root();packet=base/'packet';packet.mkdir();name='server/Test.java';old=b'old\n';new=b'new\n'
        patchbytes=b'--- a/server/Test.java\n+++ b/server/Test.java\n@@ -1 +1 @@\n-old\n+new\n'
        meta={'upstreamCommit':d.COMMIT,'patchSha256':d.sha(patchbytes),'files':[{'path':name,'upstreamBytes':len(old),'upstreamSha256':d.sha(old),'derivedBytes':len(new),'derivedSha256':d.sha(new),'modified':True}]}
        (packet/'auto-video-nonce-v1.patch').write_bytes(patchbytes);(packet/'source-provenance.json').write_bytes(d.canonical(meta))
        with patch.object(d,'PACKET',packet):
            self.assertEqual(d.apply_patch({name:old})[0][name],new)
            with self.assertRaises(ValueError):d.apply_patch({name:b'wrong\n'})
            meta['files'][0]['derivedSha256']='0'*64;(packet/'source-provenance.json').write_bytes(d.canonical(meta))
            with self.assertRaises(ValueError):d.apply_patch({name:old})

    def test_bounded_read_growth_duplicate_json_and_inert_cli_failure(self):
        base,root=self.root();p=root/'small';p.write_bytes(b'123')
        with self.assertRaises(ValueError):d.read(p,2)
        with self.assertRaises(ValueError):d.parse(b'{"x":1,"x":2}')
        with self.assertRaises(ValueError):d.relative('../private')
        with self.assertRaises(ValueError):d.relative('C:/private')
        self.assertEqual(d.quote_windows('a\\"b\\'),'"a\\\\\\"b\\\\"')

    def test_d8_uses_all_nested_classes_and_rejects_unknown_packages(self):
        base,root,c,state=self.prepared();folder=root/'classes/com/genymobile/scrcpy';folder.mkdir(parents=True)
        (folder/'Server.class').write_bytes(b'fake');(folder/'Server$Nested.class').write_bytes(b'fake')
        private,public=d.make_plan(root,'d8',state);self.assertEqual(public['arguments'][:2],['-Xmx512m','-XX:-UsePerfData']);self.assertEqual(public['arguments'].count('-XX:-UsePerfData'),1);self.assertEqual(private['deadlineMs'],120000);self.assertEqual(public['arguments'][-2:],['${CLASSES}/com/genymobile/scrcpy/Server$Nested.class','${CLASSES}/com/genymobile/scrcpy/Server.class'])
        bad=root/'classes/foreign';bad.mkdir();(bad/'Wrong.class').write_bytes(b'fake')
        with self.assertRaises(ValueError):d.make_plan(root,'d8',state)

    def test_receipt_no_fake_retirement_or_unknown_exit_promotion(self):
        p={'status':'TIMEOUT','exitCode':None,'cleanupComplete':False,'stdoutTruncated':False,'stderrTruncated':False}
        self.assertFalse(d.retired(d.process_value(d.canonical(p))));self.assertFalse(d.successful(p))
        for key,value in (('exitCode',True),('cleanupComplete',1),('status','OBSERVED')):
            bad={**p,key:value}
            with self.assertRaises(ValueError):d.process_value(d.canonical(bad))

    def test_owned_producer_finish_strict_validator_composition_and_unknown_layout(self):
        import validate_derived_pair_build as v
        base,root,c,state=self.prepared()
        for name in ('android/content/IOnPrimaryClipChangedListener.java','android/view/IDisplayWindowListener.java'):
            file=root/'generated'/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(b'SYNTHETIC_GENERATED')
        folder=root/'classes/com/genymobile/scrcpy';folder.mkdir(parents=True);(folder/'Server.class').write_bytes(b'SYNTHETIC_CLASS')
        receipt={'status':'EMPTY_OUTPUT','exitCode':0,'cleanupComplete':True,'stdoutTruncated':False,'stderrTruncated':False}
        for stage in d.STAGES:
            d.plan(root,stage);d.write_json(root/('private/process-'+stage+'.json'),receipt)
        with zipfile.ZipFile(root/'output/classes.zip','w',compression=zipfile.ZIP_DEFLATED) as z:z.writestr('classes.dex',dex_fixture())
        (root/'output/RetainedVideoConsumer.dll').write_bytes(pe_fixture())
        full,selected=d.packet();full=copy.deepcopy(full)
        readme=next(r for r in full['files'] if r['path']=='README.md');readme.update(bytes=len(b'synthetic README'),sha256=d.sha(b'synthetic README'))
        authority=(state['source']['upstream'],state['source']['effective'],state['source']['patchSha256'],readme)
        # All compiler and source outputs here are explicitly synthetic; actual owned producer and strict schema compose.
        with patch.object(d,'packet',return_value=(full,selected)),patch.object(v,'authority',return_value=authority):
            report=d.finish(root)
            self.assertIsNone(report['failure'])
            manifests={n:d.read(root/'evidence'/n,cap) for n,cap in d.EVIDENCE_CAPS.items()}
            v.validate_report(report,manifests)
            v.check_output_bytes(root,report,manifests)
            (root/'foreign.txt').write_bytes(b'foreign')
            with self.assertRaises(ValueError):d.closed_layout(root,state)
            self.assertTrue((root/'foreign.txt').exists())
            (root/'foreign.txt').unlink();(root/'private/java-home/unknown').write_bytes(b'foreign')
            with self.assertRaises(ValueError):d.closed_layout(root,state)
            (root/'private/java-home/unknown').unlink()
            staging=base/'staging';staging.mkdir();(staging/'upload').mkdir()
            for name,raw in manifests.items():(staging/'upload'/name).write_bytes(raw)
            binding={'scratchRoot':str(root),'owner':state['owner']}
            real_owner=d.owner;calls=0
            def revoke_before_delete(path):
                nonlocal calls
                calls+=1
                if calls==2:(root/'.owner').write_text(str(uuid.uuid4()))
                return real_owner(path)
            with patch.object(v,'base_path',return_value=staging),patch.object(v,'staging',return_value=(binding,c,report)),patch.object(d,'owner',side_effect=revoke_before_delete):
                with self.assertRaises(ValueError):d.cleanup(root)
            self.assertTrue((root/'source').exists())
            (root/'.owner').write_text(state['owner'])
            with patch.object(v,'base_path',return_value=staging),patch.object(v,'staging',return_value=(binding,c,report)):
                self.assertTrue(d.cleanup(root))
            self.assertEqual({p.name for p in root.iterdir()},{'.owner'})

    def test_runner_closure_change_and_foreign_before_seal_refused(self):
        base,root,c,state=self.prepared()
        with patch.object(d,'runner_closure',return_value=[]):
            with self.assertRaises(ValueError):d.revalidate(root)
        (root/'foreign.txt').write_bytes(b'not ours')
        with self.assertRaises(ValueError):d.closed_layout(root,state)
        self.assertTrue((root/'foreign.txt').exists())

    def test_combined_directory_count_and_streamed_zip_descriptor(self):
        base,root=self.root();left=base/'left';right=base/'right';left.mkdir();right.mkdir()
        (left/'one').mkdir();(right/'two').mkdir();count=[0]
        d.inventory(left,'A',max_files=1,combined_entries=count)
        with self.assertRaises(ValueError):d.inventory(right,'B',max_files=1,combined_entries=count)
        (root/'output').mkdir();raw=streamed_zip_fixture();(root/'output/classes.zip').write_bytes(raw);(root/'output/RetainedVideoConsumer.dll').write_bytes(pe_fixture())
        with zipfile.ZipFile(io.BytesIO(raw)) as z:self.assertTrue(z.infolist()[0].flag_bits&8)
        d.inspect_outputs(root)
        bad=bytearray(raw)
        for signature,offset in ((b'PK\x03\x04',6),(b'PK\x01\x02',8)):
            index=bad.index(signature);flags=struct.unpack_from('<H',bad,index+offset)[0];struct.pack_into('<H',bad,index+offset,flags|0x20)
        (root/'output/classes.zip').write_bytes(bad)
        with self.assertRaises(ValueError):d.inspect_outputs(root)

    def test_windows_stat_semantics_binary_bytes_and_same_api_mutation_fences(self):
        from types import SimpleNamespace
        base,root=self.root();file=root/'bytes';raw=b'A\r\nB\x1aC\x00\xff';file.write_bytes(raw)
        real_plain=d.plain;real_fstat=os.fstat
        def decorated(s,ctime):
            values={name:getattr(s,name) for name in ('st_dev','st_ino','st_size','st_mtime_ns','st_ctime_ns','st_nlink','st_mode')}
            values.update(st_birthtime_ns=17,st_ctime_ns=ctime)
            return SimpleNamespace(**values)
        def path_stat(path,directory=False):return decorated(real_plain(path,directory),17)
        def fd_stat(fd):return decorated(real_fstat(fd),29)
        with patch.object(d,'plain',side_effect=path_stat),patch.object(d.os,'fstat',side_effect=fd_stat):
            self.assertEqual(d.read(file,100),raw)
            self.assertEqual(d.digest_file(file,100),{'bytes':len(raw),'sha256':d.sha(raw)})
            count=0
            def changed(fd):
                nonlocal count
                count+=1;return decorated(real_fstat(fd),29 if count==1 else 30)
            with patch.object(d.os,'fstat',side_effect=changed):
                with self.assertRaises(ValueError):d.digest_file(file,100)
            count=0
            with patch.object(d.os,'fstat',side_effect=changed):
                with self.assertRaises(ValueError):d.read(file,100)
            def replaced(fd):
                value=fd_stat(fd);value.st_ino+=1;return value
            with patch.object(d.os,'fstat',side_effect=replaced):
                with self.assertRaises(ValueError):d.read(file,100)
        path_calls=0
        def changed_path(path,directory=False):
            nonlocal path_calls
            path_calls+=1;return decorated(real_plain(path,directory),17 if path_calls==1 else 18)
        with patch.object(d,'plain',side_effect=changed_path),patch.object(d.os,'fstat',side_effect=fd_stat):
            with self.assertRaises(ValueError):d.read(file,100)
        missing=decorated(real_plain(file),17);del missing.st_birthtime_ns
        with patch.object(d.sys,'platform','win32'):
            with self.assertRaises(ValueError):d.cross_identity(missing)
        output=root/'written';d.write_new(output,raw,100)
        self.assertEqual(output.read_bytes(),raw)
        self.assertEqual(d.read(output,100),raw)

    def test_closed_diagnostic_predicates_and_no_private_value_leakage(self):
        from types import SimpleNamespace
        base,root=self.root();file=root/'PRIVATE_CANARY';file.write_bytes(b'123')
        cases=[(lambda:d.plain(Path('PRIVATE_CANARY')), 'CANONICAL_PATH'),
               (lambda:d.read(file,2),'BYTE_LIMIT'),
               (lambda:d.parse(b'{"PRIVATE_CANARY":1,"PRIVATE_CANARY":2}'),'SCHEMA'),
               (lambda:d.inventory(root,'ROOT',max_files=0),'ENTRY_LIMIT'),
               (lambda:d.inventory(root,'ROOT',max_bytes=1),'TOTAL_BYTES')]
        for invoke,reason in cases:
            d.checkpoint('TOOLS_JDK17')
            with self.assertRaises(d.ControlFailure) as caught:invoke()
            self.assertEqual(d.diagnostic_frame('PREPARE',caught.exception),'DERIVED_PAIR_CONTROL_DIAG|PREPARE|TOOLS_JDK17|'+reason)
        original=Path.lstat
        def reparse(path):
            value=original(path)
            return SimpleNamespace(st_mode=value.st_mode,st_file_attributes=0x400)
        with patch.object(Path,'lstat',reparse):
            with self.assertRaises(d.ControlFailure) as caught:d.plain(file)
        self.assertEqual(caught.exception.reason,'REPARSE')
        original_stat=os.fstat
        def replacement(fd):
            value=original_stat(fd)
            return SimpleNamespace(st_dev=value.st_dev,st_ino=value.st_ino+1,st_size=value.st_size,st_mtime_ns=value.st_mtime_ns,st_ctime_ns=value.st_ctime_ns,st_birthtime_ns=getattr(value,'st_birthtime_ns',value.st_ctime_ns),st_nlink=value.st_nlink)
        with patch.object(os,'fstat',replacement):
            with self.assertRaises(d.ControlFailure) as caught:d.read(file,10)
        self.assertEqual(caught.exception.reason,'IDENTITY')

    def test_diagnostic_all_actions_bounded_and_hostile_exception_inert(self):
        from contextlib import redirect_stdout
        class Hostile(ValueError):
            def __str__(self):raise AssertionError('PRIVATE_CANARY')
            def __repr__(self):raise AssertionError('PRIVATE_CANARY')
        class HostileValue:
            def __eq__(self,other):raise AssertionError('PRIVATE_CANARY')
            def __str__(self):raise AssertionError('PRIVATE_CANARY')
        error=d.ControlFailure('SOURCE_REJECTED','HASH');error.reason=HostileValue()
        d.checkpoint('ENTRY')
        self.assertEqual(d.diagnostic_frame(HostileValue(),error),'DERIVED_PAIR_CONTROL_DIAG|CLI|ENTRY|INTERNAL')
        with patch.object(d,'_diagnostic_step',HostileValue()):
            self.assertEqual(d.diagnostic_frame('PREPARE',error),'DERIVED_PAIR_CONTROL_DIAG|PREPARE|ENTRY|INTERNAL')
        for action,args in [('acquire',['x']),('prepare',['x','y','z']),('plan',['x','javac']),('verify',['x','javac']),('finish',['x','NONE']),('cleanup',['x'])]:
            output=io.StringIO()
            with patch.object(d,'_finish' if action=='finish' else action,side_effect=Hostile()),redirect_stdout(output):self.assertEqual(d.main([action,*args]),1)
            self.assertEqual(output.getvalue(),'DERIVED_PAIR_CONTROL_DIAG|'+action.upper()+'|ENTRY|INTERNAL\nDERIVED_PAIR_CONTROL_FAILED\n')
        for action in d.DIAGNOSTIC_ACTIONS:
            for step in d.DIAGNOSTIC_STEPS:
                d.checkpoint(step)
                for reason in d.DIAGNOSTIC_REASONS:
                    frame=d.diagnostic_frame(action,d.ControlFailure('SOURCE_REJECTED',reason))
                    self.assertLessEqual(len(frame.encode('ascii')),256)
        output=io.StringIO()
        with patch.object(d,'verify',return_value=True),redirect_stdout(output):self.assertEqual(d.main(['verify','x','javac']),0)
        self.assertEqual(output.getvalue(),'DERIVED_PAIR_CONTROL_PASS\n')

    def test_finish_handled_diagnostic_after_seal_and_no_stale_frame_on_write_failure(self):
        from contextlib import redirect_stdout
        def refuse(_):
            d.checkpoint('DEX_NAMESPACE');d.fail('OUTPUT_REJECTED','NAME')
        for late in (None,'report.json','cleanup-inventory.json'):
            with self.subTest(late=late):
                base,root,context,state=self.prepared();original=d.write_json
                def writing(path,*args,**kwargs):
                    if Path(path).name==late:raise PermissionError('PRIVATE_CANARY')
                    return original(path,*args,**kwargs)
                output=io.StringIO()
                with patch.object(d,'revalidate',side_effect=refuse),patch.object(d,'write_json',side_effect=writing),redirect_stdout(output):result=d.main(['finish',str(root),'NONE'])
                if late is None:
                    self.assertEqual(result,0)
                    self.assertEqual(output.getvalue(),'DERIVED_PAIR_CONTROL_DIAG|FINISH|DEX_NAMESPACE|NAME\nDERIVED_PAIR_CONTROL_PASS\n')
                    self.assertEqual(d.parse(d.read(root/'private/report.json',65536))['failure'],'OUTPUT_REJECTED')
                    self.assertTrue((root/'private/cleanup-inventory.json').is_file())
                else:
                    self.assertEqual(result,1);step='REPORT_WRITE' if late=='report.json' else 'CLOSED_LAYOUT'
                    self.assertEqual(output.getvalue(),'DERIVED_PAIR_CONTROL_DIAG|FINISH|'+step+'|IO_ACCESS\nDERIVED_PAIR_CONTROL_FAILED\n')
        base,root,context,state=self.prepared();output=io.StringIO()
        with patch.object(d,'revalidate',side_effect=refuse),redirect_stdout(output):report=d.finish(root)
        self.assertEqual(report['failure'],'OUTPUT_REJECTED');self.assertEqual(output.getvalue(),'')

    def test_output_diagnostic_sites_preserve_closed_inspector_refusals(self):
        cases=[('DEX_HEADER',lambda:d.inspect_dex(b'PRIVATE_CANARY')),('DEX_NAME',lambda:d.inspect_dex(dex_fixture('Lcom/genymobile/scrcpy/Bad-Name;'))),('DEX_NAMESPACE',lambda:d.inspect_dex(dex_fixture('Lforeign/Example;'))),('PE_HEADER',lambda:d.inspect_pe(b'PRIVATE_CANARY'))]
        raw=bytearray(dex_fixture());struct.pack_into('<I',raw,96,0)
        raw[12:32]=hashlib.sha1(raw[32:]).digest();struct.pack_into('<I',raw,8,zlib.adler32(raw[12:])&0xffffffff)
        cases.append(('DEX_TABLES',lambda:d.inspect_dex(bytes(raw))))
        cli=bytearray(pe_fixture());struct.pack_into('<I',cli,152+112+14*8+4,0)
        cases.append(('PE_CLI',lambda:d.inspect_pe(bytes(cli))))
        metadata=bytearray(pe_fixture());metadata[640:644]=b'NOPE'
        cases.append(('PE_METADATA',lambda:d.inspect_pe(bytes(metadata))))
        base,root=self.root();(root/'output').mkdir();(root/'output/classes.zip').write_bytes(b'PRIVATE_CANARY')
        cases.append(('OUTPUT_ZIP',lambda:d.inspect_outputs(root)))
        for site,call in cases:
            with self.subTest(site=site):
                try:call()
                except (ValueError,zipfile.BadZipFile) as error:frame=d.diagnostic_frame('FINISH',error)
                else:self.fail('expected fixed inspector refusal')
                self.assertTrue(frame.startswith('DERIVED_PAIR_CONTROL_DIAG|FINISH|'+site+'|'))
                self.assertNotIn('PRIVATE_CANARY',frame)

    def test_isolated_cli_failure_exact_closed_frame(self):
        import subprocess
        result=subprocess.run([__import__('sys').executable,'-I','-B',d.__file__,'PRIVATE_CANARY'],capture_output=True,timeout=10)
        self.assertEqual(result.returncode,1);self.assertEqual(result.stderr,b'')
        self.assertEqual(result.stdout.replace(b'\r\n',b'\n'),b'DERIVED_PAIR_CONTROL_DIAG|CLI|ENTRY|PREDICATE\nDERIVED_PAIR_CONTROL_FAILED\n')

    def test_platform_exact_three_inputs_unrelated_tree_not_traversed(self):
        base,root,c,state=self.prepared();platform=Path(c['platformRoot'])
        unrelated=platform/'data';unrelated.mkdir();(unrelated/'not-a-tool').write_bytes(b'UNUSED')
        original_walk=os.walk
        def bounded_walk(top,*args,**kwargs):
            self.assertNotEqual(Path(top),platform)
            self.assertFalse(Path(top).is_relative_to(unrelated))
            return original_walk(top,*args,**kwargs)
        with patch.object(d.os,'walk',side_effect=bounded_walk):
            tools=d.tools_snapshot(c)
            self.assertEqual({r['path'] for r in tools['files'] if r['namespace']=='ANDROID36'},set(d.TOOL_FILES['ANDROID36']))
            self.assertEqual(d.revalidate(root)['tools'],tools)
        selected=platform/'android.jar';original=selected.read_bytes();selected.write_bytes(b'CHANGED')
        with self.assertRaises(ValueError):d.revalidate(root)
        selected.write_bytes(original)
        target=platform/'framework.aidl';target.unlink();target.symlink_to(selected)
        with self.assertRaises(ValueError):d.tools_snapshot(c)
        target.unlink();target.write_bytes(b'SYNTHETIC_TOOL_NEVER_EXECUTED')
        from types import SimpleNamespace
        original_stat=os.fstat
        def changed(fd):
            value=original_stat(fd)
            return SimpleNamespace(st_dev=value.st_dev,st_ino=value.st_ino+1,st_size=value.st_size,st_mtime_ns=value.st_mtime_ns,st_ctime_ns=value.st_ctime_ns,st_birthtime_ns=getattr(value,'st_birthtime_ns',value.st_ctime_ns),st_nlink=value.st_nlink)
        with patch.object(d.os,'fstat',side_effect=changed):
            with self.assertRaises(ValueError):d.digest_file(selected,256*1024**2)

    def test_retired_first_compiler_failure_stages_and_cleans_fixed_empty_dirs(self):
        import validate_derived_pair_build as v
        base,old,c,state=self.prepared();root=base/('derived-pair-'+str(uuid.uuid4()));old.rename(root)
        d.plan(root,'aidlClipboard')
        receipt={'status':'NONZERO_EXIT','exitCode':1,'cleanupComplete':True,'stdoutTruncated':False,'stderrTruncated':False}
        d.write_json(root/'private/process-aidlClipboard.json',receipt)
        full,selected=d.packet();full=copy.deepcopy(full)
        readme=next(r for r in full['files'] if r['path']=='README.md');readme.update(bytes=len(b'synthetic README'),sha256=d.sha(b'synthetic README'))
        authority=(state['source']['upstream'],state['source']['effective'],state['source']['patchSha256'],readme)
        staging=base/'staging';staging.mkdir();(staging/'.owner').write_text(str(uuid.uuid4()));(staging/'context.json').write_bytes(d.canonical(c))
        # Synthetic sources/tools and process receipt only; production producer,
        # publisher staging, byte binding and cleanup execute on actual owned files.
        with patch.object(d,'packet',return_value=(full,selected)),patch.object(v,'authority',return_value=authority),patch.object(v,'base_path',return_value=staging),patch.object(tempfile,'gettempdir',return_value=str(base)):
            report=d.finish(root,'COMPILE_FAILED')
            self.assertEqual(report['failure'],'COMPILE_FAILED');self.assertIsNone(report['aidlDisplay'])
            self.assertEqual(list((root/'classes').iterdir()),[]);self.assertEqual(list((root/'output').iterdir()),[])
            v.stage(root)
            unknown=root/'classes/unknown-empty';unknown.mkdir()
            with self.assertRaises(ValueError):d.cleanup(root)
            self.assertTrue(unknown.exists());unknown.rmdir()
            self.assertTrue(d.cleanup(root))
            self.assertEqual({p.name for p in root.iterdir()},{'.owner'})

    def test_windows_token_suffix_paths_match_aidl_imports_without_switch_rewrite(self):
        import ntpath
        tokens={'SOURCE':r'C:\owned\source','GENERATED':r'C:\owned\generated','CLASSES':r'C:\owned\classes','BUILD_TOOLS36':r'C:\SDK\build-tools\36.0.0','OUTPUT':r'C:\owned\output','FRAMEWORK64':r'C:\Windows\Framework64'}
        source='${SOURCE}/server/src/main/aidl/android/content/IOnPrimaryClipChangedListener.aidl'
        imported='${SOURCE}/server/src/main/aidl'
        old_source=source.replace('${SOURCE}/',tokens['SOURCE']+'\\')
        old_import=imported.replace('${SOURCE}/',tokens['SOURCE']+'\\')+'\\'
        self.assertNotEqual(old_source[:-len('android/content/IOnPrimaryClipChangedListener.aidl')],old_import)
        with patch.object(d.os,'sep','\\'):
            actual=d.expand_argument(source,tokens);base=d.expand_argument(imported,tokens)+'\\'
            self.assertEqual(actual[:-len('android\\content\\IOnPrimaryClipChangedListener.aidl')],base)
            self.assertEqual(actual,ntpath.join(base,'android','content','IOnPrimaryClipChangedListener.aidl'))
            self.assertEqual(d.expand_argument('/target:library',tokens),'/target:library')
            self.assertEqual(d.expand_argument('/out:${OUTPUT}/RetainedVideoConsumer.dll',tokens),'/out:C:\\owned\\output\\RetainedVideoConsumer.dll')
            self.assertEqual(d.expand_argument('${BUILD_TOOLS36}/core-lambda-stubs.jar;${GENERATED}/',tokens),tokens['BUILD_TOOLS36']+'\\core-lambda-stubs.jar;'+tokens['GENERATED']+'\\')
            self.assertEqual(d.expand_argument('${CLASSES}/com/genymobile/scrcpy/Server$Nested.class',tokens),tokens['CLASSES']+'\\com\\genymobile\\scrcpy\\Server$Nested.class')
            for invalid in ('${UNKNOWN}/file','${SOURCE}','${SOURCE}/','${SOURCE}/../escape'):
                with self.assertRaises(ValueError):d.expand_argument(invalid,tokens)


if __name__=='__main__':unittest.main()
