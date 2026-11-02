"""Source-only regression guards for the synthetic decoder qualifier.

This is not a JavaScript/PowerShell security verifier or runtime qualification.
Independent source review and observed owned Windows execution remain required.
"""
import re
import stat
import sys
from pathlib import Path

FILES = (
    'video-decoder-probe.mjs', 'video-decoder-control.mjs',
    'build-video-decoder.mjs', 'Invoke-VideoDecoder.ps1',
    'video-decoder-contract.mjs', 'video-decoder-fixture.mjs',
)
IMPORTS = {
    FILES[0]: {'electron', 'node:fs', 'node:path', 'node:crypto',
               '../src/video-stream-bridge.ts', '../src/view-session.ts',
               '../src/main/window-policy.ts', '../src/settings-contract.ts',
               '../src/fleet-contract.ts', '../src/platform-tools-setup-contract.ts',
               '../src/metadata-contract.ts', './video-decoder-fixture.mjs',
               './video-decoder-contract.mjs'},
    FILES[1]: {'node:fs', 'node:path', 'node:url', 'node:crypto',
               '../scripts/build-manifest.mjs', './video-decoder-contract.mjs'},
    FILES[2]: {'../scripts/verify-dependencies.mjs', '../scripts/build-manifest.mjs',
               'node:path', 'node:crypto', 'node:url', 'node:fs'},
    FILES[4]: set(),
    FILES[5]: {'node:crypto'},
}

# Guard clauses rather than bare identifier presence. Whitespace is normalized
# only to accommodate formatting; source changes require deliberate review.
REQUIRED = {
    FILES[0]: (
        "if(diagnosticBound)", "validateVideoDiagnostic(diagnostic)",
        "join(root,'failure.json')", "rendererState=VIDEO_DIAGNOSTIC_STATES.includes(v?.state)",
        "process.platform!=='win32'", "process.arch!=='x64'",
        "process.versions.electron!=='45.1.0'", "process.versions.node!=='24.22.1'",
        "process.argv.length!==3", "setTimeout(fail,90000)",
        "app.setPath('userData',join(root,'user-data'))",
        "app.setPath('sessionData',join(root,'session-data'))",
        "session.fromPartition('video-decoder-qualification')",
        "installSessionPolicy(privateSession,", "installWindowPolicy(window)",
        "...securePreferences(privateSession)", "preload:join(desktop,'build/preload.cjs')",
        "preferences.sandbox===true", "preferences.contextIsolation===true",
        "preferences.nodeIntegration===false", "preferences.webSecurity===true",
        "window.isSecureContext", "window.webContents.capturePage(rect)",
        "f.fit!=='contain'", "f.w<16", "f.h<16",
        "dark.slice(0,3).every(v=>v<=8)", "light.slice(0,3).every(v=>v>=247)",
        "dark[3]!==255", "light[3]!==255", "cases.singleOwnerStop=stops===1",
        "awaitbridge.close()", "view.close()", "writeFileSync(join(root,'result.json'),text,{flag:'wx'})",
        "if(!validateVideoQualification(result))returnfail()",
        "sha(plain(process.argv[1]))!==control.inputs.probe",
    ),
    FILES[1]: (
        "if(!validateVideoEvidence(value))throwError('EVIDENCE')",
        "join(base,'video-decoder-evidence.json')", "return supervisor.passed".replace(' ', ''),
        "!validateVideoDiagnostic(value)", "value.head!==control.head",
        "s.isSymbolicLink()", "s.nlink!==1", "s.size>limit", "b.length!==s.size",
        "dirname(root)!==join(desktop,'.test-output')", "verifyProbe()",
        "!verifyBuild(desktop)", "runtime.head!==head", "runtime.electron!=='45.1.0'",
        "runtime.exeSha256!==bound.executable", "JSON.stringify(inputs())!==JSON.stringify(control.inputs)",
        "!validateVideoQualification(result)", "result.head!==control.head",
        "depth>16", "entries.length>256", "bytes>67108864", "assertOwner(root)",
    ),
    FILES[2]: (
        "verify(true,process.argv[2])", "!verifyBuild(desktop)",
        "entryPoints:[resolve(desktop,'verification/video-decoder-probe.mjs')]",
        "external:['electron']", "write:false", "metafile:true",
        "result.outputFiles.length!==1", "result.outputFiles[0].contents.length>1048576",
        "result.metafile.inputs", "productionManifest:", "output:digest(result.outputFiles[0].contents)",
    ),
    FILES[3]: (
        "if(Retired$p){Control'diagnostic'}",
        "Set-StrictMode-Version2.0", "Invoke-OwnedChild$exe$arguments$timeout@{}",
        "$p.CleanupComplete", "$null-ne$p.ExitCode", "$p.StdoutTruncated",
        "$p.StderrTruncated", "Assert-OwnedRun$owner", "Remove-VerifiedOwnedRun$owner$retired",
        "'WindowsBoundary.psm1'", "'OwnedFiles.psm1'", "[IO.FileMode]::CreateNew",
        "VIDEO_DECODER_PROBE_PASS", "VIDEO_DECODER_CAMPAIGN_FAIL';exit1",
        "b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89",
        "d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5",
    ),
    FILES[4]: (
        "v.directoryCleanup&&p!==null&&!retiredProcess(p)",
        "(v.diagnostic!==null||v.result!==null)&&!retiredProcess(v.supervisor.process)",
        "!validateVideoSupervisor(v.supervisor)", "v.head!==v.supervisor.head",
        "v.result!==null&&v.diagnostic===null", "v.failure!==null||v.cleanupFailure!==null",
        "ELECTRON_H264_SYNTHETIC_TILE_ONLY", "VIDEO_QUALIFICATION_CASES.every(k=>value.cases[k]===true)",
        "value.electron==='45.1.0'", "value.node==='24.22.1'",
        "validInputs(value.inputs)", "validPixels(value.landscape)", "validPixels(value.portrait)",
    ),
    FILES[5]: ("node:crypto", "VIDEO_FIXTURE_REJECTED"),
}


# Both executable readers stream a bounded regular file and close the handle on
# every outcome; installer and runtime attestor are included in source identity.
STREAM_GUARDS = (
    'before.size>536870912', 'before.nlink!==1', 'before.isSymbolicLink()',
    "openSync(file,'r')", 'Buffer.alloc(65536)',
    'opened.dev!==before.dev', 'opened.ino!==before.ino', 'opened.size!==before.size',
    'readSync(fd,buffer,0,buffer.length,null)', 'total>before.size',
    'total!==before.size', 'after.size!==before.size', 'after.mtimeMs!==before.mtimeMs',
    'finally{closeSync(fd);}',
)
for _name in FILES[:2]:
    REQUIRED[_name] += STREAM_GUARDS
REQUIRED[FILES[0]] += ('executableHash(process.execPath)!==control.inputs.executable',)
REQUIRED[FILES[1]] += (
    "installer:join(desktop,'verification/install-electron.mjs')",
    "runtimeControl:join(desktop,'verification/persistence-control.cjs')",
)
REQUIRED[FILES[4]] += ("'installer'", "'runtimeControl'")


REQUIRED[FILES[0]] += (
    'Math.max(offsetX,offsetY)<3',
    'boxSample(offsetX/2,offsetY+ch/4)', 'boxSample(offsetX+cw/4,offsetY/2)',
    'Math.max(...letterbox.slice(0,3))<245',
    'Math.min(...letterbox.slice(0,3))<225',
    'Math.max(...letterbox.slice(0,3))-Math.min(...letterbox.slice(0,3))<3',
    'letterbox[3]!==255', '!chrome.every(Number.isFinite)',
    'f.tile[2]<=0', 'f.tile[3]<=0',
    'chrome.some((v,i)=>Math.abs(v-baselineChrome[i])>1)',
    'baselineChrome??=chrome', 'if(stops!==0||stopped)throwError()',
    "staleRefused&&finalFacts.clear&&finalFacts.state==='STOPPED'&&stops===1",
)
REQUIRED[FILES[3]] += (
    "$report.failure=$phase+'_FAILED'",
    'finally{if($null-ne$owner-and-not$report.directoryCleanup){if($retired){',
    "try{Control'cleanup';Remove-VerifiedOwnedRun$owner$retired;$report.directoryCleanup=$true}",
    "catch{$report.cleanupFailure='CLEANUP_FAILED';$report.passed=$false}",
    "else{$report.cleanupFailure='RETIREMENT_UNCONFIRMED';$report.passed=$false}",
)
ORDERED = {
    FILES[0]: (
        'if(stops!==0||stopped)throwError()',
        "awaitjs(`document.querySelector('button[aria-label=\"StopvideoDevice0001\"]').click()`)",
        'cases.singleOwnerStop=stops===1', 'letstaleRefused=false',
        "staleRefused&&finalFacts.clear&&finalFacts.state==='STOPPED'&&stops===1",
    ),
    FILES[3]: (
        "$report.failure=$phase+'_FAILED'",
        'finally{if($null-ne$owner-and-not$report.directoryCleanup){if($retired){',
        "$report.cleanupFailure='CLEANUP_FAILED'",
        "$report.cleanupFailure='RETIREMENT_UNCONFIRMED'",
        '$bytes=[Text.Encoding]::UTF8.GetBytes',
    ),
}


def compact_source(source):
    compact = re.sub(r'\s+', '', source)
    return re.sub(r'\(([A-Za-z_$][\w$]*)\)=>', r'\1=>', compact)


def reject():
    raise ValueError('VIDEO_DECODER_SOURCE_REJECTED')


def validate_sources(sources):
    """Check fixed source boundaries, never interpret a runtime result as PASS."""
    if type(sources) is not dict or set(sources) != set(FILES):
        reject()
    for name in FILES:
        source = sources[name]
        if type(source) is not str or not source or len(source.encode('utf-8')) > 131072 or '\x00' in source:
            reject()
        compact = compact_source(source)
        if any(anchor not in compact for anchor in REQUIRED[name]):
            reject()
        if name in ORDERED:
            positions = [compact.find(anchor) for anchor in ORDERED[name]]
            if -1 in positions or positions != sorted(positions) or len(set(positions)) != len(positions):
                reject()
        if name in IMPORTS:
            imports = re.findall(r"\bimport\s+(?:[^;]*?\s+from\s+)?['\"]([^'\"]+)['\"]", source)
            if set(imports) != IMPORTS[name] or len(imports) != len(IMPORTS[name]):
                reject()
            admitted = source
            if name == FILES[2]:
                if compact.count("awaitimport('esbuild')") != 1 or compact.index("verify(true,process.argv[2])") > compact.index("awaitimport('esbuild')"):
                    reject()
                admitted = re.sub(r"await\s+import\('esbuild'\)", '', source)
            if re.search(r'\b(?:import|require|eval|Function)\s*\(', admitted):
                reject()
            if re.search(r'\b(?:fetch|WebSocket|XMLHttpRequest)\s*\(', source):
                reject()
        if re.search(r'--(?:no-sandbox|disable-web-security|remote-debugging)|nodeIntegration\s*:\s*true|sandbox\s*:\s*false', source):
            reject()
        if name == FILES[3] and re.search(r'\b(?:Start-Process|Invoke-Expression|Invoke-WebRequest)\b', source, re.I):
            reject()
    return True


def validate_tree(root):
    root = Path(root)
    base = root / 'desktop' / 'verification'
    sources = {}
    for name in FILES:
        file = base / name
        info = file.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or not 0 < info.st_size <= 131072:
            reject()
        if file.resolve() != file.absolute():
            reject()
        raw = file.read_bytes()
        if len(raw) != info.st_size:
            reject()
        sources[name] = raw.decode('utf-8', errors='strict')
    return validate_sources(sources)


if __name__ == '__main__':
    try:
        if len(sys.argv) != 1:
            reject()
        validate_tree(Path(__file__).resolve().parents[2])
        print('VIDEO_DECODER_SOURCE_BOUNDARY_PASS')
    except (ValueError, OSError):
        print('VIDEO_DECODER_SOURCE_BOUNDARY_FAIL')
        sys.exit(1)
