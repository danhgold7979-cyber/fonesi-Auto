import copy
import hashlib
import json
import re
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import validate_platform_tools_server as v

class PlatformToolsServerEvidenceTests(unittest.TestCase):
    def report(self):
        value = v.blank()
        value['cases'] = {key: True for key in v.CASES}
        for name in v.SCENARIOS:
            value['scenarios'][name] = {'process': None if name == 'occupied' else {
                'status': 'NONZERO_EXIT', 'exitCode': 1, 'cleanupComplete': True,
                'stdoutTruncated': False, 'stderrTruncated': False}, **v.expected_facts(name)}
        value['directoryCleanup'] = True
        return value

    def test_expected_scenarios_are_forced_stop_not_orderly_success(self):
        self.assertTrue(v.normalize(self.report())['passed'])
        for name in ('healthy', 'death', 'timeout'):
            report = self.report(); report['scenarios'][name]['process']['exitCode'] = -1073741510
            self.assertTrue(v.normalize(report)['passed'])
            report['scenarios'][name]['process'].update(status='SUCCESS', exitCode=0)
            self.assertFalse(v.normalize(report)['passed'])
        report = self.report(); report['scenarios']['occupied']['process'] = self.report()['scenarios']['healthy']['process']
        self.assertFalse(v.normalize(report)['passed'])

    def test_every_case_and_scenario_predicate_is_mandatory(self):
        for key in v.CASES:
            report = self.report(); report['cases'][key] = False
            self.assertFalse(v.normalize(report)['passed'], key)
        for name in v.SCENARIOS:
            for key in v.FACTS:
                report = self.report(); report['scenarios'][name][key] = not report['scenarios'][name][key]
                self.assertFalse(v.normalize(report)['passed'], (name,key))
        report = self.report(); report['directoryCleanup'] = False
        self.assertFalse(v.normalize(report)['passed'])

    def test_actual_retirement_truncation_missing_process_and_failures_cannot_pass(self):
        for name in ('healthy', 'death', 'timeout'):
            for key, value in [('cleanupComplete',False),('stdoutTruncated',True),('stderrTruncated',True),('status','TIMEOUT')]:
                report = self.report(); report['scenarios'][name]['process'][key] = value
                self.assertFalse(v.normalize(report)['passed'])
            report = self.report(); report['scenarios'][name]['process'] = None
            self.assertFalse(v.normalize(report)['passed'])
        for failure in v.FAILURES:
            report = self.report(); report['failure'] = failure
            self.assertFalse(v.normalize(report)['passed'])

    def test_exact_types_identity_schema_and_no_private_fields(self):
        for key in ('endpoint','ownerId','keySha256','profilePath','stdout','stderr'):
            report = self.report(); report[key] = 'PRIVATE_CANARY'
            with self.assertRaises(ValueError): v.normalize(report)
            report = self.report(); report['scenarios']['healthy'][key] = 'PRIVATE_CANARY'
            with self.assertRaises(ValueError): v.normalize(report)
        for key, value in [('version',True),('scope','OTHER'),('candidateSha256','a'*64),('revision','37.0.0'),('binaryArchitecture','X64'),('hostArchitecture','ARM64')]:
            report = self.report(); report[key] = value
            with self.assertRaises(ValueError): v.normalize(report)
        report = self.report(); report['scenarios']['healthy']['process']['exitCode'] = True
        with self.assertRaises(ValueError): v.normalize(report)
        report = self.report(); report['cases'][v.CASES[0]] = 1
        with self.assertRaises(ValueError): v.normalize(report)
        report = self.report(); del report['scenarios']['timeout']
        with self.assertRaises(ValueError): v.normalize(report)

    def test_duplicate_escaped_duplicate_nonfinite_and_forged_pass_reject(self):
        for raw in [b'{"a":1,"a":2}',b'{"a":1,"\\u0061":2}',b'{"x":{"p":1,"p":2}}',b'{"x":NaN}',b'\xff',b'x'*65537]:
            with self.assertRaises(ValueError): v.parse(raw)
        report = self.report(); report['cases'][v.CASES[0]] = False; report['passed'] = True
        with self.assertRaises(ValueError): v.normalize(report)
        report = self.report(); report['passed'] = False
        with self.assertRaises(ValueError): v.normalize(report)

    def test_publisher_exclusive_fixed_schema_and_truthful_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve(); source=root/'summary.json'; output=root/'validated.json'
            source.write_text(json.dumps(self.report()))
            result=v.publish(source,output)
            self.assertTrue(result['passed'])
            self.assertEqual(v.parse(output.read_bytes()),result)
            with self.assertRaises(FileExistsError): v.publish(source,output)
            source.write_text(json.dumps(v.blank()))
            self.assertFalse(v.publish(source,root/'failed.json')['passed'])
            private_tokens=('PRIVATE_CANARY','"endpoint"','keySha256','profilePath','stdout"','stderr"')
            for token in private_tokens:self.assertNotIn(token,output.read_text())

    def test_outer_runner_capture_exact_success_framing_and_stream_caps(self):
        capture={'process':{'status':'SUCCESS','exitCode':0,'cleanupComplete':True,'stdoutTruncated':False,'stderrTruncated':False},'stdout':'P202_SERVER_OBSERVED\r\n','stderr':''}
        self.assertTrue(v.runner_capture(capture))
        for stdout in ['P202_SERVER_OBSERVED', '\nP202_SERVER_OBSERVED\n', 'P202_SERVER_OBSERVED\n\n', 'P202_SERVER_FAILED\n', 'PRIVATE_CANARY']:
            value=copy.deepcopy(capture);value['stdout']=stdout
            self.assertFalse(v.runner_capture(value))
        value=copy.deepcopy(capture);value['stderr']='PRIVATE_CANARY'
        self.assertFalse(v.runner_capture(value))
        value=copy.deepcopy(capture);value['process']['cleanupComplete']=False
        self.assertFalse(v.runner_capture(value))
        for text in ['x'*32769, '\ud800']:
            value=copy.deepcopy(capture);value['stdout']=text
            with self.assertRaises(ValueError):v.runner_capture(value)

    def test_controller_schema_and_source_closure_match_exactly(self):
        source=Path(__file__).with_name('platform-tools-server-control.cjs').read_text()
        for name,expected in [('SOURCES',v.SOURCES),('CASES',v.CASES),('FACTS',v.FACTS)]:
            match=re.search(r'const '+name+r' = Object\.freeze\(\[([\s\S]*?)\]\);',source)
            self.assertIsNotNone(match,name)
            actual=tuple(re.findall(r"'([^']+)'",match.group(1)))
            self.assertEqual(actual,expected,name)

    def test_stage_owned_chain_sources_preflight_and_candidate_composition(self):
        # Synthetic source/candidate admission only; no server/profile/socket effect.
        with tempfile.TemporaryDirectory() as folder:
            parent=Path(folder).resolve()/'.platform-tools-server-runtime';parent.mkdir()
            root=parent/'run-00000000-0000-4000-8000-000000000001';root.mkdir()
            token='00000000-0000-4000-8000-000000000002';(root/'.owner').write_text(token)
            desktop=Path(v.__file__).resolve().parent.parent
            sources=('verification/validate_platform_tools_server.py',)
            admission={'version':1,'runToken':token,'sources':{name:hashlib.sha256(v.read(desktop/name)).hexdigest() for name in sources},'candidateManifestSha256':hashlib.sha256(v.read(desktop/'verification/platform-tools-candidate.json')).hexdigest(),'operation':'ISOLATED_SERVER_DEVELOPMENT'}
            (root/'admission.json').write_text(json.dumps(admission));(root/'preflight.json').write_text(json.dumps({key:True for key in v.PREFLIGHT}))
            report=self.report();report['directoryCleanup']=False;(root/'server.json').write_text(json.dumps(report))
            (root/'runner-capture.json').write_text(json.dumps({'process':{'status':'SUCCESS','exitCode':0,'cleanupComplete':True,'stdoutTruncated':False,'stderrTruncated':False},'stdout':'P202_SERVER_OBSERVED\n','stderr':''}))
            with patch.object(v,'SOURCES',sources),patch.object(v,'candidate_at',return_value=True):
                result=v.stage(root)
            self.assertFalse(result['passed']);self.assertTrue(all(result['cases'].values()))
            self.assertEqual(v.parse((root/'server-public.json').read_bytes()),result)
            (root/'server-public.json').unlink();admission['sources'][sources[0]]='a'*64;(root/'admission.json').write_text(json.dumps(admission))
            with patch.object(v,'SOURCES',sources),patch.object(v,'candidate_at',return_value=True):
                with self.assertRaises(ValueError):v.stage(root)
            self.assertFalse((root/'server-public.json').exists())

if __name__=='__main__':unittest.main()
