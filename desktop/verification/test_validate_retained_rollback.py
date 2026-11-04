import copy
import json
import re
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock
import validate_retained_rollback as v
from validate_retained_host import MANAGED_SCOPE, MANAGED_V2_HASHES


def process():
    return dict(status='SUCCESS', exitCode=0, cleanupComplete=True, stdoutTruncated=False, stderrTruncated=False)


def managed():
    return dict(version=2, scope=MANAGED_SCOPE, compileProcess={**process(), 'status': 'EMPTY_OUTPUT'},
                fixtureProcess=process(), groupsPassed=10, compilerDiagnostics=[], sourceUnchanged=True,
                inputHashes=dict(MANAGED_V2_HASHES), directoryCleanup=True, passed=True)


def sample():
    return dict(version=1, scope=v.SCOPE, excludedVaultContext='P106_UNMET_NOT_RERUN', managedEvidence=managed(),
                package=dict(sourceHead='a'*40, sourceTree='b'*40, zipSha256='c'*64, zipBytes=100, manifestSha256='d'*64),
                bootstrap=dict(version=1, cases=dict.fromkeys(v.BOOTSTRAP, True)),
                stages={name: dict(observation=dict(version=1, scope=v.SCOPE, stage=name,
                       cases=dict.fromkeys(v.CASES, True), readyCount=1, closedCount=1), process=process()) for name in v.STAGES},
                originalArchivesUnchanged=True, originalSourceUnchanged=True, originalPackageUnchanged=True,
                directoryCleanup=True, failure=None)


def fixture(directory):
    parent=Path(directory).resolve();base=parent/'.retained-host-runtime';base.mkdir();root=base/'r';root.mkdir()
    (root/'.owner').write_text('12345678-1234-4234-8234-123456789abc')
    value=sample()
    rows={'bootstrap.json':value['bootstrap'],'managed-evidence.json':managed(),
          'integrity.json':{'version':1,**{k:value[k] for k in v.INTEGRITY},'package':value['package']}}
    candidate=parent/'.package-build'/'Fonesi-Auto-12345678-1234-4234-8234-123456789abc'
    rows['package-binding.json']={'version':1,**value['package'],'candidateDirectory':str(candidate/'package'),
        'candidateZip':str(candidate/'Fonesi-Auto.zip'),'manifestBytes':12,
        'files':[{'path':'app/build/main.cjs','bytes':1,'sha256':'e'*64}], 'directories':['app','app/build']}
    for i,name in enumerate(v.STAGES):
        observed=copy.deepcopy(value['stages'][name]['observation']);observed['cases'].update(dict.fromkeys(v.CONTROL_CASES,False))
        rows[f'rollback-{name}-observed.json']=observed
        rows[f'rollback-{name}-result.json']=value['stages'][name]['observation']
        rows[f'launcher-{name}-capture.json']={'process':process(),'stdout':'PERSISTENCE_DESKTOP_CLOSED\n','stderr':''}
        op=dict(operationId=f'00000000-0000-4000-8000-{i+1:012d}',expectedRevision=0,pendingRevision=1,verifiedRevision=2,reads=3,requestId='p1',action='ROLLBACK' if name=='ROLLBACK' else 'INSTALL')
        runtime=dict(operationId=f'00000000-0000-4000-8000-{i+11:012d}',installationRevision=min(i+1,3),expectedRevision=0,pendingRevision=1,verifiedRevision=2,reads=2,requestId='p2')
        rows[f'rollback-{name}-binding.json']={'version':1,'stage':name,'setup':None if name=='REOPEN' else op,'runtime':runtime}
    for name,row in rows.items():(root/name).write_text(json.dumps(row))
    return base,root


class Rollback(unittest.TestCase):
    def test_complete_exact_roundtrip_and_all_boolean_requirements(self):
        value=v.validate(sample());self.assertTrue(value['passed']);self.assertEqual(v.validate(value),value)
        for name in v.STAGES:
            for case in v.CASES:
                value=sample();value['stages'][name]['observation']['cases'][case]=False;value['failure']='VALIDATION_FAILED'
                try:self.assertFalse(v.validate(value)['passed'])
                except ValueError:pass # Later stages after a failed earlier prerequisite are forbidden.
        for key in (*v.INTEGRITY,'directoryCleanup'):
            value=sample();value[key]=False;self.assertFalse(v.validate(value)['passed'])

    def test_historical_managed_or_partial_source_proof_cannot_gate_current_campaign(self):
        for patch in ({'version':1,'groupsPassed':8},{'groupsPassed':8},{'inputHashes':{}},{'passed':False}):
            value=sample();value['managedEvidence'].update(patch)
            with self.assertRaises(ValueError):v.validate(value)

    def test_partial_failure_preserves_prefix_and_cannot_promote_or_continue(self):
        value=sample();value['stages']['ROLLBACK']={'observation':None,'process':{**process(),'status':'NONZERO_EXIT','exitCode':1}}
        value['stages']['REOPEN']=None;value.update(failure='NATIVE_FAILED',directoryCleanup=False)
        self.assertFalse(v.validate(value)['passed'])
        value['passed']=True
        with self.assertRaises(ValueError):v.validate(value)
        value.pop('passed');value['stages']['REOPEN']=sample()['stages']['REOPEN']
        with self.assertRaises(ValueError):v.validate(value)

    def test_private_fields_types_duplicates_and_forged_stage_reject(self):
        for mutate in (lambda x:x.update(path='private'),lambda x:x.update(version=True),
                       lambda x:x['stages']['SEED']['observation'].update(stage='ROLLBACK'),
                       lambda x:x['stages']['SEED']['process'].update(exitCode=True),
                       lambda x:x.update(failure='private raw error')):
            value=sample();mutate(value)
            with self.assertRaises(ValueError):v.validate(value)
        for raw in (b'{"version":1,"versi\\u006fn":1}',b'{"a":NaN}',b'x'*65537):
            with self.assertRaises(ValueError):v.parse(raw)

    def test_real_owned_stage_and_exclusive_publisher(self):
        with tempfile.TemporaryDirectory() as d:
            base,root=fixture(d);before=(root/'integrity.json').read_bytes()
            self.assertTrue(v.stage(root));self.assertEqual((root/'integrity.json').read_bytes(),before)
            public=v.parse((root/'public.json').read_bytes());self.assertFalse(public['passed'])
            with self.assertRaises(FileExistsError):v.stage(root)
            public.pop('passed');public['directoryCleanup']=True # Synthetic supervisor handoff, not native proof.
            (base/'unvalidated.json').write_text(json.dumps(public));self.assertTrue(v.publish(base))
            with self.assertRaises(FileExistsError):v.publish(base)

    def test_private_capture_binding_and_observer_control_split_must_match(self):
        for mode in ('stdout','retirement','binding','history','marker'):
            with tempfile.TemporaryDirectory() as d:
                _,root=fixture(d)
                name='launcher-ROLLBACK-capture.json' if mode in ('stdout','retirement') else 'rollback-ROLLBACK-binding.json' if mode=='binding' else 'rollback-ROLLBACK-observed.json'
                value=json.loads((root/name).read_text())
                if mode=='stdout':value['stdout']='\n\nPERSISTENCE_DESKTOP_CLOSED\n'
                elif mode=='retirement':value['process']['cleanupComplete']=False
                elif mode=='binding':value['setup']['action']='INSTALL'
                elif mode=='history':value['cases']['previousHistoryUnchanged']=True
                else:(root/'.owner').write_text('wrong')
                (root/name).write_text(json.dumps(value))
                with self.assertRaises(ValueError):v.stage(root)
                self.assertFalse((root/'public.json').exists())

    def test_managed_gate_uses_current_actual_owned_file_and_no_clobber(self):
        with tempfile.TemporaryDirectory() as d:
            base,root=fixture(d);(root/'managed-evidence.json').unlink()
            (base.parent/'retained-managed-validated.json').write_text(json.dumps(managed()))
            self.assertTrue(v.managed_gate(root))
            with self.assertRaises(FileExistsError):v.managed_gate(root)

    def test_contract_and_outer_fixed_stage_schema_parity_and_lifetime(self):
        here=Path(__file__).resolve().parent
        code="const c=require(process.argv[1]);console.log(JSON.stringify({scope:c.SCOPE,stages:c.STAGES,cases:c.CASES,phases:c.PHASES,reasons:c.REASONS}))"
        result=subprocess.run(['node','-e',code,str(here/'retained-rollback-contract.cjs')],capture_output=True,text=True,timeout=10,check=True)
        contract=json.loads(result.stdout);self.assertEqual(contract['scope'],v.SCOPE);self.assertEqual(contract['stages'],list(v.STAGES));self.assertEqual(contract['cases'],list(v.CASES))
        ps=(here/'Invoke-RetainedRollbackCheck.ps1').read_text()
        for literal in (*v.STAGES,*contract['phases'],*contract['reasons']):self.assertIn("'"+literal+"'",ps)
        self.assertIn('240000,10000,32768',ps);self.assertIn("'PATH',[Environment]::SystemDirectory",ps)
        # Exercise actual hash-bound core materialization; its lookup behavior is not a mock.
        materialize = "const fs=require('node:fs'),path=require('node:path'),c=require(process.argv[1]);const root=path.resolve(process.argv[2]),raw=fs.readFileSync(path.join(root,'launch/launch-core.ps1'),'utf8');console.log(JSON.stringify([false,true].map(mode=>c.transform(raw,root,mode))))"
        generated=subprocess.run(['node','-e',materialize,str(here/'retained-rollback-control.cjs'),str(here.parent)],capture_output=True,text=True,timeout=10,check=True)
        source_core,package_core=json.loads(generated.stdout)
        for core in (source_core,package_core):
            self.assertIn("if($EntryMode -ceq 'PACKAGE'){$node=Join-Path $packageRoot 'runtime/node/node.exe'}",core)
            self.assertIn('Get-Command node.exe -CommandType Application -ErrorAction Stop',core)
            self.assertLess(core.index('Get-Command node.exe'),core.index("if($Selection -ceq 'Create')"))
        self.assertIn("if($stage -ceq 'SEED'){\n    PlainFile $node 134217728",ps)
        seed_path="[Environment]::SetEnvironmentVariable('PATH',([IO.Path]::GetDirectoryName($node)+';'+[Environment]::SystemDirectory),'Process')"
        self.assertEqual(ps.count(seed_path),1)
        self.assertIn("}else{[Environment]::SetEnvironmentVariable('PATH',[Environment]::SystemDirectory,'Process')}",ps)
        fence=ps[ps.index("if($stage -ceq 'SEED'){\n    PlainFile $node"):ps.index('$native=[Fonesi.Phase00.NativeProbe]::Run')]
        self.assertLess(fence.index('d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5'),fence.index(seed_path))
        allowed=re.search(r"\$allowed=@\(([^\n]+)\)",ps).group(1)
        self.assertNotIn("'PATH'",allowed)

        self.assertLess(ps.index("'managed-gate'"),ps.index("'install-electron.mjs'"))
        self.assertLess(ps.index("Control 'inspect' $stage"),ps.index('$index++'))
        self.assertIn("Control 'cleanup' '';Remove-VerifiedOwnedRun $owner $allClean",ps)
        self.assertNotRegex(ps,r'Invoke-WebRequest|ExecutionPolicy|Stop-Process|Write-Output \$_')


if __name__=='__main__':unittest.main()
