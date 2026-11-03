import copy
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import validate_platform_tools as v

class PlatformToolsEvidenceTests(unittest.TestCase):
    def process(self):
        return dict(status='SUCCESS',exitCode=0,cleanupComplete=True,stdoutTruncated=False,stderrTruncated=False)
    def capture(self,exe=r'C:\owned\candidate\platform-tools\adb.exe'):
        return dict(process=self.process(),stdout=f'Android Debug Bridge version 1.0.41\r\nVersion 37.0.1-12345678\r\nInstalled as {exe}\r\nRunning on Windows 10.0.20348\r\n',stderr='')
    def report(self):
        r=v.blank();r['cases']={k:True for k in v.CASES};r['process']=self.process();r['versionObserved']=True;r['directoryCleanup']=True
        return r
    def test_exact_version_labels_release_and_private_path(self):
        exe=r'C:\owned\candidate\platform-tools\adb.exe'
        self.assertTrue(v.version_output(self.capture(exe),exe))
        self.assertFalse(v.version_output(self.capture(exe),r'C:\other\adb.exe'))
        for old,new in [('37.0.1','37.0.2'),('Version ','Version secret-'),('Running on Windows','Running on Linux'),('1.0.41','1.0.private')]:
            c=self.capture(exe);c['stdout']=c['stdout'].replace(old,new);self.assertFalse(v.version_output(c,exe))
    def test_extra_empty_unknown_lines_and_stderr_fail(self):
        exe=r'C:\owned\candidate\platform-tools\adb.exe'
        for suffix in ['\r\n','PRIVATE_CANARY','\nunknown\n']:
            c=self.capture(exe);c['stdout']+=suffix;self.assertFalse(v.version_output(c,exe))
        c=self.capture(exe);c['stderr']='private';self.assertFalse(v.version_output(c,exe))
    def test_capture_bounds_types_and_duplicates_reject(self):
        for raw in [b'{"a":1,"a":2}',b'{"a":1,"\\u0061":2}',b'{"a":{"x":1,"x":2}}',b'{"a":NaN}']:
            with self.assertRaises(ValueError):v.parse(raw)
        c=self.capture();c['stdout']='x'*32769
        with self.assertRaises(ValueError):v.version_output(c,'x')
        c=self.capture();c['process']['exitCode']=False
        with self.assertRaises(ValueError):v.version_output(c,'x')
    def test_all_case_bits_required_no_partial_pass(self):
        self.assertTrue(v.normalize(self.report())['passed'])
        for key in v.CASES:
            r=self.report();r['cases'][key]=False;self.assertFalse(v.normalize(r)['passed'])
    def test_process_retirement_truncation_and_failure_cannot_pass(self):
        for key,value in [('cleanupComplete',False),('stdoutTruncated',True),('stderrTruncated',True),('status','TIMEOUT')]:
            r=self.report();r['process'][key]=value;self.assertFalse(v.normalize(r)['passed'])
        for failure in v.FAILURES:
            r=self.report();r['failure']=failure;self.assertFalse(v.normalize(r)['passed'])
        r=self.report();r['process']=None;self.assertFalse(v.normalize(r)['passed'])
    def test_exact_schema_and_forged_pass_reject(self):
        for key in ['stdout','path','binaryPath']:
            r=self.report();r[key]='PRIVATE_CANARY'
            with self.assertRaises(ValueError):v.normalize(r)
        r=self.report();r['cases']['sourceBound']=False;r['passed']=True
        with self.assertRaises(ValueError):v.normalize(r)
        r=self.report();r['candidateSha256']='0'*64
        with self.assertRaises(ValueError):v.normalize(r)
    def test_publisher_exclusive_canonical_no_private_data(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder).resolve();source=root/'in.json';out=root/'validated.json';source.write_text(json.dumps(self.report()))
            result=v.publish(source,out);self.assertTrue(result['passed'])
            raw=out.read_bytes();self.assertTrue(raw.endswith(b'\n'));self.assertNotIn(b'Installed as',raw)
            self.assertEqual(v.normalize(v.parse(raw)),result)
            with self.assertRaises(FileExistsError):v.publish(source,out)
    def test_failed_report_still_published_as_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder).resolve();source=root/'in.json';out=root/'validated.json';source.write_text(json.dumps(v.blank()))
            self.assertFalse(v.publish(source,out)['passed']);self.assertTrue(out.is_file())
    def test_symlink_and_unbounded_inventory_reject(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder).resolve();(root/'a').write_bytes(b'a');(root/'b').write_bytes(b'b')
            with self.assertRaises(ValueError):v.entries(root,1)
            if os.name!='nt':
                (root/'link').symlink_to(root/'a')
                with self.assertRaises(ValueError):v.read(root/'link')
    def test_fixed_source_marker_and_cleanup_fields(self):
        self.assertEqual(len(v.SOURCES),10);self.assertEqual(len(v.CASES),11)
        ps=Path(__file__).with_name('Invoke-PlatformToolsVersion.ps1').read_text()
        self.assertIn("([string[]]@('version'))",ps)
        self.assertNotIn("'--root'",ps)
        for case in v.CASES:self.assertIn(case,ps)
    def test_actual_stage_composition_keeps_process_truth_with_synthetic_candidate_only(self):
        with tempfile.TemporaryDirectory() as folder:
            parent=Path(folder).resolve()/'.platform-tools-runtime';parent.mkdir();root=parent/'run-00000000-0000-4000-8000-000000000001';root.mkdir()
            token='00000000-0000-4000-8000-000000000002';(root/'.owner').write_text(token);(root/'profile').mkdir()
            desktop=Path(v.__file__).resolve().parent.parent
            sources={name:hashlib.sha256(v.read((desktop/name).resolve())).hexdigest() for name in v.SOURCES}
            admission={'version':1,'runToken':token,'sources':sources,'candidateManifestSha256':hashlib.sha256(v.read(desktop/'verification/platform-tools-candidate.json')).hexdigest()}
            (root/'admission.json').write_text(json.dumps(admission));(root/'preflight.json').write_text(json.dumps({k:True for k in v.PREFLIGHT}))
            (root/'capture.json').write_text(json.dumps(self.capture(str(root/'candidate/platform-tools/adb.exe'))))
            # Only actual candidate-byte measurement is injected; real ownership/source/capture/summary path executes.
            with patch.object(v,'candidate_at',return_value=True):result=v.stage(root)
            self.assertTrue(result['versionObserved']);self.assertFalse(result['passed']);self.assertFalse(result['directoryCleanup'])
            self.assertEqual(v.parse((root/'public.json').read_bytes()),result)
    def test_actual_extractor_marker_and_stage_boundary_with_synthetic_archive_pins(self):
        from test_platform_tools_archive import fixture
        import platform_tools_archive as archive
        with fixture() as (outer,source,_files):
            parent=outer/'.platform-tools-runtime';parent.mkdir();root=parent/'run-00000000-0000-4000-8000-000000000001';root.mkdir()
            token='00000000-0000-4000-8000-000000000002';(root/'.owner').write_text(token);(root/'profile').mkdir()
            archive.extract_archive(source,root/'candidate',token)
            self.assertTrue(v.candidate_at(root,token))
            desktop=Path(v.__file__).resolve().parent.parent
            sources={name:hashlib.sha256(v.read((desktop/name).resolve())).hexdigest() for name in v.SOURCES}
            admission={'version':1,'runToken':token,'sources':sources,'candidateManifestSha256':hashlib.sha256(v.read(desktop/'verification/platform-tools-candidate.json')).hexdigest()}
            (root/'admission.json').write_text(json.dumps(admission));(root/'preflight.json').write_text(json.dumps({k:True for k in v.PREFLIGHT}))
            (root/'capture.json').write_text(json.dumps(self.capture(str(root/'candidate/platform-tools/adb.exe'))))
            result=v.stage(root);self.assertTrue(result['versionObserved']);self.assertFalse(result['passed'])
            marker=root/'candidate'/archive.COMPLETE_NAME;marker.write_bytes(marker.read_bytes()+b' ')
            with self.assertRaises(ValueError):v.candidate_at(root,token)
    def test_unknown_protocol_data_not_published(self):
        r=self.report();r['protocolVersion']='PRIVATE_CANARY'
        with self.assertRaises(ValueError):v.normalize(r)

if __name__=='__main__':unittest.main()
