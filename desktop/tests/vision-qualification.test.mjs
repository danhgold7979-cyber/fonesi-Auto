// Portable real PNG decoding and synthetic Windows wire replies; no native/model execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  fixture,
  ocrHeader,
  ocrRequest,
  ocrResult,
  PIXEL_SHA256,
  PNG_SHA256,
} from '../verification/vision-qualification-fixture.mjs';
const frame = (r, data = Buffer.alloc(0), raw = JSON.stringify(r)) => {
  const text = Buffer.from(raw),
    prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(text.length);
  return Buffer.concat([prefix, text, data]);
};
function preReply() {
  const { header: h, pixels } = fixture();
  const r = { version: 1, kind: 'PREPROCESS_RESULT' };
  for (const k of [
    'requestId',
    'captureId',
    'deviceId',
    'bindingId',
    'generation',
    'orientationEpoch',
    'pipelineId',
  ])
    r[k] = h[k];
  Object.assign(r, {
    status: 'PROCESSED',
    code: 'OK',
    sourcePixelSha256: h.sourcePixelSha256,
    inputSha256: h.inputSha256,
    outputWidth: 356,
    outputHeight: 74,
    outputBytes: pixels.length,
    outputSha256: PIXEL_SHA256,
    mapping: { originalWidth: 356, originalHeight: 74, roi: h.roi, numerator: 1, denominator: 1 },
    minIntensity: 0,
    maxIntensity: 255,
    clippedChannels: 0,
  });
  return { r, pixels };
}
function reply(overrides = {}) {
  const h = ocrHeader();
  return {
    version: 2,
    kind: 'OCR_EVALUATION_RESULT',
    scope: 'EVALUATION_ONLY',
    capability: 'UNQUALIFIED',
    requestId: h.requestId,
    captureId: h.captureId,
    deviceId: h.deviceId,
    bindingId: h.bindingId,
    generation: h.generation,
    orientationEpoch: h.orientationEpoch,
    language: 'EN',
    sourcePixelSha256: PIXEL_SHA256,
    inputSha256: PIXEL_SHA256,
    status: 'TEXT',
    code: 'OK',
    model: 'en_PP-OCRv5_mobile_rec',
    modelSha256: 'e595b4cf2ffad19fbb5a61ba345d63939577a3ab8717b6e5995642590c9101b4',
    text: 'Hello 123',
    rawScore: 0.95,
    modelLatencyMs: 120,
    memoryKind: 'WINDOWS_PEAK_WORKING_SET',
    peakWorkingSetBytes: 123456,
    ...overrides,
  };
}
test('real original PNG decoder emits bounded attributed preprocessing frame', () => {
  const f = fixture(),
    size = f.frame.readUInt32LE(0);
  assert.deepEqual(JSON.parse(f.frame.subarray(4, 4 + size)), f.header);
  assert.equal(f.pixels.length, 105376);
  assert.equal(f.header.inputSha256, PIXEL_SHA256);
  assert.deepEqual(f.frame.subarray(4 + size), Buffer.from(f.pixels));
});
test('synthetic actual-shape preprocessing reply feeds correlated OCR request', () => {
  const { r, pixels } = preReply();
  const wire = ocrRequest(frame(r, pixels));
  const size = wire.readUInt32LE(0);
  assert.deepEqual(JSON.parse(wire.subarray(4, 4 + size)), ocrHeader());
  assert.deepEqual(wire.subarray(4 + size), Buffer.from(pixels));
  for (const key of ['sourcePixelSha256', 'outputSha256', 'captureId'])
    assert.throws(() => ocrRequest(frame({ ...r, [key]: 'a'.repeat(64) }, pixels)));
  assert.throws(() => ocrRequest(frame(r, pixels.subarray(1))));
});
test('Windows v2 keeps raw case mismatch and peak working set distinct from Linux RSS', () => {
  const r = ocrResult(frame(reply()));
  assert.equal(r.row.label, 'HELLO 123');
  assert.equal(r.row.text, 'Hello 123');
  assert.equal(r.row.imageSha256, PNG_SHA256);
  assert.equal(r.row.split, 'SMOKE');
  assert.equal(r.row.endToEndLatencyMs, null);
  assert.equal(r.memoryKind, 'WINDOWS_PEAK_WORKING_SET');
  assert.equal(r.row.peakWorkingSetBytes, 123456);
  assert(!Object.hasOwn(r.row, 'peakRssBytes'));
  assert.equal(r.capability, 'UNQUALIFIED');
});
test('strict Windows consumer refuses malformed UTF8, duplicate decoded keys and trailing bytes', () => {
  const raw = JSON.stringify(reply());
  for (const bad of [
    raw.replace('"version":2', '"version":2,"version":2'),
    raw.replace('"version":2', '"version":2,"vers\\u0069on":2'),
    `${raw}x`,
    `\ufeff${raw}`,
  ])
    assert.throws(() => ocrResult(frame(null, Buffer.alloc(0), bad)));
  const bad = frame(reply());
  bad[bad.indexOf(Buffer.from('Hello'))] = 0xff;
  assert.throws(() => ocrResult(bad));
  assert.throws(() => ocrResult(Buffer.concat([frame(reply()), Buffer.from([0])])));
});
test('Windows consumer accepts legitimate Python float formats without canonical-string equality', () => {
  for (const [score, latency] of [
    ['1.0', '1.0'],
    ['0.0', '1e-07'],
  ]) {
    const raw = JSON.stringify(reply())
      .replace('"rawScore":0.95', `"rawScore":${score}`)
      .replace('"modelLatencyMs":120', `"modelLatencyMs":${latency}`);
    assert.equal(ocrResult(frame(null, Buffer.alloc(0), raw)).rawScore, Number(score));
  }
});
test('Windows consumer rejects mixed platform schema, correlation and invalid measurements', () => {
  for (const change of [
    { version: 1 },
    { memoryKind: 'LINUX_RSS' },
    { peakRssBytes: 1 },
    { peakWorkingSetBytes: -1 },
    { peakWorkingSetBytes: true },
    { requestId: '00000000-0000-4000-8000-000000000002' },
    { model: 'other' },
    { rawScore: 2 },
    { text: '\ud800' },
    { text: 'x'.repeat(1025) },
    { modelLatencyMs: 30001 },
    { scope: 'PRODUCTION' },
    { language: 'VI' },
  ])
    assert.throws(() => ocrResult(frame(reply(change))));
});
test('Windows unavailable retains missing measurement without success or zero placeholders', () => {
  const r = ocrResult(
    frame(
      reply({
        status: 'UNAVAILABLE',
        code: 'WORKER_UNAVAILABLE',
        text: null,
        rawScore: null,
        modelLatencyMs: null,
        peakWorkingSetBytes: null,
      }),
    ),
  );
  const memory = ocrResult(
    frame(
      reply({
        status: 'UNAVAILABLE',
        code: 'MEMORY_UNAVAILABLE',
        text: null,
        rawScore: null,
        modelLatencyMs: null,
        peakWorkingSetBytes: null,
      }),
    ),
  );
  assert.equal(memory.code, 'MEMORY_UNAVAILABLE');
  assert.equal(memory.row.status, 'UNAVAILABLE');
  assert.equal(r.row.status, 'UNAVAILABLE');
  assert.equal(r.row.peakWorkingSetBytes, null);
  assert.equal(r.row.text, null);
  assert.throws(() =>
    ocrResult(frame(reply({ status: 'UNAVAILABLE', code: 'WORKER_UNAVAILABLE' }))),
  );
});

test('source admission separates Windows managed ownership from unadmitted runtime', async () => {
  const { visionSourceAdmission } = await import('../scripts/vision-qualification.mjs');
  const context = {
    platform: 'win32',
    arch: 'x64',
    nodeVersion: '24.22.1',
    overrides: false,
    buildValid: true,
    mode: 'managed',
    candidate: null,
  };
  assert.equal(visionSourceAdmission(context), true);
  for (const change of [
    { platform: 'linux' },
    { arch: 'arm64' },
    { nodeVersion: '24.0.0' },
    { overrides: true },
    { buildValid: false },
    { mode: 'unknown' },
    { extra: true },
  ])
    assert.equal(visionSourceAdmission({ ...context, ...change }), false);
  assert.equal(visionSourceAdmission({ ...context, mode: 'runtime' }), false);
  const candidate = {
    scope: 'WINDOWS_X64_DEVELOPMENT_CANDIDATE',
    approvedInstalledInventorySha256: 'a'.repeat(64),
    prerequisitesVerifiedOnHost: true,
  };
  assert.equal(visionSourceAdmission({ ...context, mode: 'runtime', candidate }), true);
  for (const change of [
    { approvedInstalledInventorySha256: null },
    { approvedInstalledInventorySha256: 'g'.repeat(64) },
    { prerequisitesVerifiedOnHost: false },
    { scope: 'PRODUCTION' },
  ])
    assert.equal(
      visionSourceAdmission({
        ...context,
        mode: 'runtime',
        candidate: { ...candidate, ...change },
      }),
      false,
    );
  let touched = 0;
  const trapped = { ...context };
  Object.defineProperty(trapped, 'buildValid', {
    get() {
      touched++;
      return true;
    },
  });
  assert.equal(visionSourceAdmission(trapped), false);
  assert.equal(touched, 0);
});

test('Windows workflow compiles by default and keeps actual native ownership explicit, never OCR', async () => {
  const { readFileSync } = await import('node:fs');
  const raw = readFileSync(
    new URL('../../.github/workflows/phase-04-vision.yml', import.meta.url),
    'utf8',
  ).replaceAll('\r\n', '\n');
  function closed(s) {
    assert.match(s, /branches: \[phase-04\]/);
    assert.match(s, /permissions:\n {2}contents: read\njobs:/);
    assert.match(s, /persist-credentials: false/);
    assert.match(s, /runs-on: windows-2022\n {4}timeout-minutes: 15/);
    assert.match(s, /run_native_ownership:[\s\S]*?default: false/);
    assert(!s.includes('default: true'));
    assert.ok(
      s.includes(
        "if: github.ref == 'refs/heads/phase-04' && ((github.event_name == 'workflow_dispatch' && inputs.run_native_ownership == true) || (github.event_name == 'push' && contains(github.event.head_commit.message, '[vision-managed]')))",
      ),
    );
    assert.match(s, /Invoke-VisionQualification.ps1 -Mode Compile/);
    assert.match(s, /run_vision_source_tests.py/);
    assert(!s.includes('-Mode Runtime'));
    assert(!s.includes('pip install'));
    assert.match(s, /steps\.validate_vision_campaign\.outcome == 'success'/);
    assert.match(s, /steps\.vision_materialization\.outputs\.evidence_ready == 'true'/);
    assert.match(s, /actions\/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f/);
    assert(!s.includes('fonesi-p4-windows-candidate-v1/**'));
    assert.match(s, /WINDOWS_OCR_MODEL_NOT_RUN/);
  }
  closed(raw);
  const admitted = (ref, event, input, message) =>
    ref === 'refs/heads/phase-04' &&
    ((event === 'workflow_dispatch' && input === true) ||
      (event === 'push' && message.includes('[vision-managed]')));
  assert.equal(admitted('refs/heads/phase-04', 'push', false, 'reviewed [vision-managed]'), true);
  assert.equal(admitted('refs/heads/phase-04', 'workflow_dispatch', true, ''), true);
  for (const args of [
    ['refs/heads/main', 'push', false, '[vision-managed]'],
    ['refs/heads/phase-04', 'pull_request', true, '[vision-managed]'],
    ['refs/heads/phase-04', 'push', true, 'ordinary compile'],
    ['refs/heads/phase-04', 'workflow_dispatch', false, '[vision-managed]'],
  ])
    assert.equal(admitted(...args), false);

  for (const changed of [
    raw.replaceAll('default: false', 'default: true'),
    raw.replaceAll('contents: read', 'contents: write'),
    raw.replaceAll(
      '&& inputs.run_native_ownership == true',
      '|| inputs.run_native_ownership == true',
    ),
    raw.replaceAll('-Mode Compile', '-Mode Runtime'),
    raw.replaceAll("github.ref == 'refs/heads/phase-04' && (", '('),
    raw.replaceAll("github.event_name == 'push' && contains", 'contains'),
    raw.replaceAll('[vision-managed]', '[unrelated-marker]'),
  ])
    assert.throws(() => closed(changed));
});

test('Windows compiler array entries retain complete output/reference tokens before launch', () => {
  const source = readFileSync(
    new URL('../verification/Invoke-VisionQualification.ps1', import.meta.url),
    'utf8',
  );
  assert.ok(
    source.includes("Compiler ($common+@('/target:library',('/out:'+$dll),$native,$bootstrap))"),
  );
  assert.ok(
    source.includes(
      "Compiler ($common+@('/target:exe',('/out:'+$exe),('/reference:'+$dll),$fixture))",
    ),
  );
  assert.ok(source.includes("$argument -cin @('/out:','/reference:')"));
  assert.ok(
    source.indexOf("throw 'COMPILER_ARGUMENT_REJECTED'") <
      source.indexOf('[Fonesi.Phase00.NativeProbe]::Run($script:compiler'),
  );
});

// Source-contract checks only: these do not run PowerShell, compile assemblies or admit Runtime.
function closedRuntimeFixtureSource(source) {
  const runtimeAdmission = source.slice(
    source.indexOf("  if($RuntimeRoot -ceq '')"),
    source.indexOf(" $failureStage='COMPILE'"),
  );
  const ordered = [
    "throw 'RUNTIME_NOT_ADMITTED'",
    '$runtimeCustody=NewRuntimeDirectoryCustody',
    '$runtimeCustody.HoldRoot($root)',
    'GuardSource $inventoryPath 16777216',
    "throw 'RUNTIME_INVENTORY_REJECTED'",
    '$inventory=Get-Content',
    "throw 'INVENTORY_SCHEMA'",
    '$runtimeHashes.Add([string]$entry.path,[string]$entry.sha256)',
    '$runtimeCustody.ReserveFixture()',
  ];
  let last = -1;
  for (const token of ordered) {
    const index = runtimeAdmission.indexOf(token);
    assert(index > last, `Missing or out-of-order Runtime admission: ${token}`);
    last = index;
  }
  assert(
    runtimeAdmission.includes("'^(python|preprocess-runtime|ocr-runtime|source|tooling|model)/'"),
  );
  const custody = source.slice(
    source.indexOf('function NewRuntimeDirectoryCustody'),
    source.indexOf('function AssertRuntimeFixture'),
  );
  for (const token of [
    'PRELOADED_RUNTIME_CUSTODY',
    'static readonly List<RuntimeDirectoryCustody> retained',
    'retained.Add(this)',
    String.raw`const string Root = @"D:\a\_temp\fonesi-p4-windows-candidate-v1";`,
    String.raw`new string[] { @"D:\", @"D:\a", @"D:\a\_temp", Root }`,
    'String.Equals(root, Root, StringComparison.Ordinal)',
    'CreateFile(path, 0x80, 3, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero)',
    'handles.Add(handle)',
    '(info.Attributes & 0x410) != 0x10',
    'GetFinalPathNameByHandle(handle, final',
    'length == 0 || length >= final.Capacity',
    'if(!CreateDirectory(path, IntPtr.Zero))',
    'Hold(path);',
    'if(Directory.GetFileSystemEntries(path).Length != 0) throw new IOException("RUNTIME_FIXTURE_NOT_EMPTY")',
    'if(!CloseHandle(handles[i])) return false;',
    'handles.RemoveAt(i)',
    'retained.Remove(this)',
  ])
    assert(custody.includes(token), `Missing Runtime directory custody: ${token}`);
  assert(
    custody.indexOf('handles.Add(handle)') <
      custody.indexOf('GetFileInformationByHandle(handle, out info)'),
  );
  assert(
    custody.indexOf('if(!CloseHandle(handles[i])) return false;') <
      custody.indexOf('handles.RemoveAt(i)'),
  );
  assert(source.includes("if($Mode -ceq 'Runtime'){$runtimeCustody.ReserveCompile()}else{"));
  assert(
    source.includes(
      'if($report.retired){try{if(-not $runtimeCustody.Release()){$report.retired=$false;$report.passed=$false}}',
    ),
  );
  const guard = source.slice(
    source.indexOf('function AssertRuntimeFixture('),
    source.indexOf('function Compiler('),
  );
  for (const token of [
    '-not $item.PSIsContainer',
    '$item.Attributes -band [IO.FileAttributes]::ReparsePoint',
    '$entries=@(Get-ChildItem -LiteralPath $directory -Force)',
    '$entries.Count -ne 2',
    '$entry.PSIsContainer',
    '$entry.Attributes -band [IO.FileAttributes]::ReparsePoint',
    "$entry.Name -cnotin @('VisionProcess.dll','VisionProcessFixture.exe')",
    '-not $script:before.ContainsKey($entry.FullName)',
    '(HashFile $entry.FullName) -cne $script:before[$entry.FullName]',
    'foreach($p in $script:before.Keys)',
    "throw 'FIXTURE_INPUT_CHANGED'",
  ])
    assert(guard.includes(token), `Missing fixture custody check: ${token}`);
  assert(!guard.includes('-Recurse'));
  const compile = source.slice(
    source.indexOf(' $dll=Join-Path'),
    source.indexOf(" if($Mode -cne 'Compile')"),
  );
  let previous = -1;
  for (const token of [
    "Compiler ($common+@('/target:library'",
    'GuardSource $dll 1048576',
    "Compiler ($common+@('/target:exe'",
    'GuardSource $exe 1048576',
    "if($Mode -ceq 'Runtime'){AssertRuntimeFixture (Join-Path $root 'fixture')}",
    '$report.compiled=$true',
  ]) {
    const index = compile.indexOf(token);
    assert(index > previous, `Missing or out-of-order same-run compilation custody: ${token}`);
    previous = index;
  }
  const runtime = source.slice(source.indexOf("  $failureStage='RUNTIME_PIPELINE'"));
  assert(runtime.includes("AssertRuntimeFixture (Join-Path $root 'fixture')"));
  assert(
    runtime.includes(
      'foreach($entry in $runtimeHashes.GetEnumerator()){$hashes.Add($entry.Key,$entry.Value)}',
    ),
  );
  assert(runtime.includes("$hashes.Add('fixture/VisionProcess.dll',$before[$dll])"));
  assert(runtime.includes("$hashes.Add('fixture/VisionProcessFixture.exe',$before[$exe])"));
  assert(!runtime.includes('HashTree'));
  assert(!runtime.includes('$inventory=Get-Content'));
}

test('future Runtime reserves a fresh separate fixture layer after exact held inventory admission', () => {
  const source = readFileSync(
    new URL('../verification/Invoke-VisionQualification.ps1', import.meta.url),
    'utf8',
  );
  closedRuntimeFixtureSource(source);
  const manifest = JSON.parse(
    readFileSync(new URL('../vision/windows_qualification_manifest.json', import.meta.url), 'utf8'),
  );
  assert.equal(manifest.approvedInstalledInventorySha256, null);
  assert.equal(manifest.prerequisitesVerifiedOnHost, false);
  const managed = source.slice(
    source.indexOf(" if($Mode -ceq 'Managed'){"),
    source.indexOf("  $failureStage='RUNTIME_PIPELINE'"),
  );
  assert(managed.includes("HashTree (Join-Path $root 'fixture') 'fixture' $hashes"));
  assert(
    managed.includes(
      "[IO.File]::WriteAllBytes((Join-Path $root 'fixture/empty'),(New-Object byte[] 0))",
    ),
  );
  assert(managed.includes("throw 'EMPTY_TAMPER_ACCEPTED'"));
});

test('synthetic source mutations reject preexisting, missing, extra or unheld Runtime fixture code', () => {
  const source = readFileSync(
    new URL('../verification/Invoke-VisionQualification.ps1', import.meta.url),
    'utf8',
  );
  const mutations = [
    ['$runtimeCustody.HoldRoot($root)', ''],
    [
      'CreateFile(path, 0x80, 3, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero)',
      'CreateFile(path, 0x80, 7, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero)',
    ],
    ['(info.Attributes & 0x410) != 0x10', 'false'],
    ['handles.Add(handle)', '// handle not held'],
    ['if(!CloseHandle(handles[i])) return false;', 'CloseHandle(handles[i]);'],
    ['Directory.GetFileSystemEntries(path).Length != 0', 'false'],
    [
      'if($report.retired){try{if(-not $runtimeCustody.Release())',
      'if($true){try{if(-not $runtimeCustody.Release())',
    ],

    [
      '$runtimeCustody.ReserveFixture()',
      "[IO.Directory]::CreateDirectory((Join-Path $root 'fixture'))",
    ],
    ["throw 'RUNTIME_INVENTORY_REJECTED'", "throw 'IGNORED_INVENTORY'"],
    [
      "'^(python|preprocess-runtime|ocr-runtime|source|tooling|model)/'",
      "'^(python|preprocess-runtime|ocr-runtime|source|tooling|model|fixture)/'",
    ],
    ['$entries.Count -ne 2', '$entries.Count -gt 2'],
    [
      "$entry.Name -cnotin @('VisionProcess.dll','VisionProcessFixture.exe')",
      "$entry.Name -notlike '*.dll'",
    ],
    ['$entry.PSIsContainer -or ', ''],
    ['$entry.Attributes -band [IO.FileAttributes]::ReparsePoint', '$false'],
    ['-not $script:before.ContainsKey($entry.FullName)', '$false'],
    ['(HashFile $entry.FullName) -cne $script:before[$entry.FullName]', '$false'],
    ["throw 'FIXTURE_INPUT_CHANGED'", "Write-Output 'IGNORED_INPUT_CHANGE'"],
    [' GuardSource $dll 1048576\n', ''],
    [' GuardSource $exe 1048576\n', ''],
    ["if($Mode -ceq 'Runtime'){AssertRuntimeFixture (Join-Path $root 'fixture')}", ''],
    [
      "$hashes.Add('fixture/VisionProcess.dll',$before[$dll])",
      "HashTree (Join-Path $root 'fixture') 'fixture' $hashes",
    ],
    ["$hashes.Add('fixture/VisionProcessFixture.exe',$before[$exe])", ''],
  ];
  for (const [from, to] of mutations) {
    assert(source.includes(from), `Mutation must target real source: ${from}`);
    assert.throws(() => closedRuntimeFixtureSource(source.replace(from, to)), undefined, from);
  }
  const reservation = '  $runtimeCustody.ReserveFixture()\n';
  const earlyReservation = source
    .replace(reservation, '')
    .replace('  $inventory=Get-Content', `${reservation}  $inventory=Get-Content`);
  assert.throws(() => closedRuntimeFixtureSource(earlyReservation));
});
