// Pure producer/grammar and source derivation tests. C# managed fixture remains NOT_RUN.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createHostBridge } from '../src/main/adb-host-bridge.ts';
const source = readFileSync(new URL('../native/RetainedAdbProtocol.cs', import.meta.url), 'utf8');
const fixture = readFileSync(
  new URL('./fixtures/RetainedAdbProtocolFixture.cs', import.meta.url),
  'utf8',
);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const literal = /RequestPattern = new Regex\(("(?:\\.|[^"\\])*")/.exec(source);
assert.ok(literal);
const pattern = new RegExp(
  JSON.parse(literal[1]).replace('\\A', '^').replace('\\z', '$(?![\\s\\S])'),
);
function grammar(bytes, session = id(1), previous = 0) {
  if (
    bytes.length < 2 ||
    bytes.length > 65536 ||
    bytes.some((b, i) => b > 127 || b === 13 || (b === 10 && i !== bytes.length - 1))
  )
    return false;
  const m = pattern.exec(Buffer.from(bytes).toString('ascii'));
  return (
    !!m &&
    m[1] === session &&
    uuid.test(m[3]) &&
    Number.isSafeInteger(Number(m[2])) &&
    Number(m[2]) > previous &&
    Number(m[2]) <= Number.MAX_SAFE_INTEGER
  );
}
function before(text, left, right) {
  assert.ok(
    text.indexOf(left) >= 0 && text.indexOf(left) < text.indexOf(right),
    `${left} before ${right}`,
  );
}
test('current native custody source pins and fixed provider adapter add no reader interop; not native execution proof', () => {
  for (const [name, hash] of [
    ['IsolatedAdbServer.cs', '4bf1cddd06ad6ead68f2f22cdb0c9b7c43cda96d41005f7546973c81b92029d7'],
    ['RetainedAdbSession.cs', '959354d2fcabc08d1ad3bfd4326b4049fa33814c1e942d2a06598145161f94c7'],
  ])
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL('../native/' + name, import.meta.url)))
        .digest('hex'),
      hash,
    );
  assert.match(source, /public interface IProvider/);
  assert.match(
    source,
    /provider\.Version\(attempt as IsolatedAdbServer\.RetainedProvider\.Attempt\)/,
  );
  assert.doesNotMatch(
    source,
    /DllImport|static extern|Process\.Start|kill-server|start-server|JavaScriptSerializer|JsonConvert|System\.Text\.Json/,
  );
});
test('actual TS bridge VERSION frame matches extracted native five-key grammar byte for byte', async () => {
  let receive, raw;
  const bridge = createHostBridge({
    sessionId: id(1),
    newAttemptId: () => id(2),
    assertRuntime: () => {},
    transport: {
      subscribe(c) {
        receive = c;
      },
      async write(bytes) {
        raw = new Uint8Array(bytes);
        const request = JSON.parse(Buffer.from(bytes));
        queueMicrotask(() =>
          receive(
            Buffer.from(
              JSON.stringify({
                ...request,
                result: {
                  version: 2,
                  kind: 'INVOCATION',
                  dispatched: true,
                  processRetired: true,
                  exitCode: 0,
                  observation: 'VERSION',
                },
              }) + '\n',
            ),
          ),
        );
      },
      requestCleanup() {},
    },
  });
  const token = bridge.provider.reserveAttempt('VERSION');
  await bridge.provider.version(token, {});
  assert.equal(grammar(raw), true);
  assert.equal(
    Buffer.from(raw).toString(),
    JSON.stringify({
      version: 1,
      sessionId: id(1),
      requestId: 1,
      attemptId: id(2),
      operation: 'VERSION',
    }) + '\n',
  );
  bridge.close();
});
test('extracted native grammar refuses duplicate escaped reordered oversized replay and malformed numeric framing', () => {
  const base =
    JSON.stringify({
      version: 1,
      sessionId: id(1),
      requestId: 1,
      attemptId: id(2),
      operation: 'VERSION',
    }) + '\n';
  for (const raw of [
    base.replace('"version":1', '"version":1,"version":1'),
    base.replace('"sessionId"', '"sess\\u0069onId"'),
    base.replace('"requestId":1', '"requestId":01'),
    base.replace('"requestId":1', '"requestId":9007199254740992'),
    base.replace('"version":1', '"version":1 '),
    base.replace('\n', '\r\n'),
    base + '\n',
    base.slice(0, -1),
    '\ufeff' + base,
    base.replace('VERSION', 'DISCOVER'),
  ])
    assert.equal(grammar(Buffer.from(raw)), false, raw);
  assert.equal(grammar(Buffer.from(base), id(1), 1), false);
  assert.equal(grammar(Buffer.alloc(65537, 65)), false);
  assert.equal(
    grammar(Buffer.from(base.replace('"requestId":1', '"requestId":9007199254740991'))),
    true,
  );
});
test('VERSION_ONLY gate and synchronous exact reservation precede ordinary worker while RETIRE stays concurrent', () => {
  const dispatch = source.slice(
    source.indexOf('void Dispatch(Request request)'),
    source.indexOf('void ReadLoop()'),
  );
  before(
    dispatch,
    'request.Operation != "VERSION" && request.Operation != "RETIRE"',
    'StartVersion(request);',
  );
  before(
    source.slice(source.indexOf('void StartVersion(Request request)')),
    'current = attempt;',
    'attempt.ordinary.Start()',
  );
  assert.match(source, /ParentAlive\(\)/);
  assert.match(dispatch, /seen\.Count >= AttemptLimit/);
  assert.match(dispatch, /seen\.Contains\(request.AttemptId\)/);
  assert.match(dispatch, /attempt.id != request.AttemptId/);
  assert.match(source, /AttemptLimit = 128, OutputLimit = 2/);
  assert.match(
    source,
    /attempt\.terminal && Done\(attempt\.ordinary\) && Done\(attempt\.cleanup\) && Done\(attempt\.videoCleanup\) && attempt\.frames == 0/,
  );
  assert.match(
    source,
    /new Thread\(delegate\(\) \{ Worker\(attempt, request, true, cleanupGeneration\); \}\)/,
  );
});
test('writer flush and all actual worker joins remain required before sole clean return; timeouts never cancel', () => {
  before(
    source.slice(source.indexOf('void WriteLoop()'), source.indexOf('internal RunResult Run()')),
    'output.Write(frame.bytes, 0, frame.bytes.Length); output.Flush();',
    'outstanding--;',
  );
  assert.match(source, /thread\.Join\(0\)/);
  assert.match(
    source,
    /attempt.terminal = facts.terminal && \(!cleanup \|\| cleanupGeneration == attempt.queryRetirementGeneration\);/,
  );
  assert.doesNotMatch(source, /if \(facts.terminal\) attempt.terminal = true/);
  assert.match(source, /attempt.terminal = false; Stop\("PROVIDER_FAILED"\)/);
  assert.match(source, /retired && \(dispatched \? v\["exitCode"\] != null/);
  assert.match(fixture, /"ERROR","NONTERMINAL","NULL_EXIT"/);
  assert.match(fixture, /p.reserves==2&&p.retires==2/);
  assert.match(
    source,
    /Done\(reader\) && \(readPending == null \|\| readPending.IsCompleted\) && Done\(writer\) && workers && native && outstanding == 0 && queue.Count == 0 && mediaFrame==null && !writeFailed/,
  );
  assert.match(source, /new RunResult\(eof && failure == null/);
  assert.match(
    source,
    /now - closeStarted >= CloseMilliseconds\) return new RunResult\(false, "UNRETIRED"\)/,
  );
  assert.match(
    source,
    /OperationMilliseconds = 30000, RetirementMilliseconds = 10000, CloseMilliseconds = 120000/,
  );
  // Media credit cancellation is not worker cancellation or native retirement.
  const withoutMediaCancellation = source.replaceAll('media.Cancel()', 'media.CREDIT_CANCEL()');
  assert.doesNotMatch(
    withoutMediaCancellation,
    /Thread\.Abort|\.Interrupt\(|\.Cancel\(|\.Dispose\(/,
  );
});
test('future managed fixture exercises real reader with only memory streams and exact fake attempt identity', () => {
  assert.match(fixture, /RetainedAdbProtocol\.Run\(i,o,Session,p/);
  assert.match(fixture, /Object\.ReferenceEquals\(token,attempt\)/);
  assert.match(fixture, /i\.Feed\(Frame\(2,"RETIRE"\)\)/);
  assert.match(fixture, /o\.Release\.Reset\(\)/);
  assert.match(fixture, /Check\(t\.IsAlive&&r==null\)/);
  assert.match(fixture, /Interlocked\.Exchange\(ref live,0\)/);
  const historical = fixture.slice(0, fixture.indexOf('sealed class VideoChannel :'));
  assert.ok(historical.includes('public static int RunAll()'));
  assert.doesNotMatch(
    historical,
    /new RetainedAdbProtocol\.NativeProvider|Process\.Start|File\.|Directory\.|Tcp|Socket|Add-Type/,
  );
  // Video fakes may throw SocketException, but never construct a real socket/provider.
  assert.doesNotMatch(
    fixture,
    /new RetainedAdbProtocol\.NativeProvider|Process\.Start|File\.|Directory\.|new (?:System\.Net\.Sockets\.)?(?:Socket|TcpClient|TcpListener)\s*\(|Add-Type/,
  );
  const runAll = historical.slice(historical.indexOf('public static int RunAll()'));
  assert.equal((runAll.match(/passed\+\+/g) ?? []).length, 8);
});

test('one deferred next ordinary request waits for native and output retirement while read task remains tracked', () => {
  assert.match(source, /Request deferred, deferredRetire;/);
  assert.match(source, /!attempt.terminal \|\| !attempt.publicationStarted/);
  assert.match(source, /if \(!Available\(current\)\) return;/);
  assert.match(source, /readPending.Wait\(10\)/);
  assert.match(source, /deferredStarted >= OperationMilliseconds/);
  assert.match(source, /Task<int> pending = input.ReadAsync\(one, 0, 1\)/);
  assert.match(fixture, /o.FlushRelease.Reset\(\)/);
  assert.match(fixture, /Check\(p.reserves==1&&t.IsAlive\)/);
  assert.match(fixture, /r.Clean&&p.reserves==2/);
});

test('diagnostics are opt-in fixed first-occurrence slots and managed fixture covers silent/default plus two requests', () => {
  assert.match(source, /return Run\(input, output, sessionId, provider, parentAlive, false\)/);
  assert.match(
    source,
    /enum ProgressSlot \{ REQUEST_ACCEPTED, PROVIDER_ENTERED, RESPONSE_WRITE, RESPONSE_FLUSH \}/,
  );
  assert.match(source, /if \(!diagnostics\) return/);
  assert.match(source, /Interlocked.CompareExchange\(ref diagnosticSlots, before \| bit, before\)/);
  assert.match(source, /if \(\(before & bit\) != 0\) return/);
  assert.match(source, /Console.Error.WriteLine\("HOST_READER_PROGRESS_" \+ slot.ToString\(\)\)/);
  assert.match(fixture, /foreach\(bool diagnostics in new bool\[\]\{false,true\}\)/);
  assert.match(fixture, /lines.Length==\(diagnostics\?4:0\)/);
  assert.match(fixture, /r.Clean&&p.reserves==2/);
  const bootstrap = readFileSync(
    new URL('../launch/Invoke-RetainedHost.ps1', import.meta.url),
    'utf8',
  );
  assert.match(bootstrap, /\$adapter,\$admission.Liveness\(\),\$true/);
  assert.match(
    bootstrap,
    /@\('ENVIRONMENT','CONTEXT','ASSETS','COMPILE_BEGIN','COMPILE_END','PARENT_BEGIN','PARENT_END','READER','CLOSE'\)/,
  );
  assert.match(bootstrap, /\$progressSlots.ContainsKey\(\$Slot\)/);
  assert.match(bootstrap, /HOST_BOOTSTRAP_PROGRESS_/);
});

test('SERVER_ONLY scope retains live SESSION identity, bounded health and cleanup before output admission', () => {
  assert.match(source, /StartForeground\(object attempt\)/);
  assert.match(
    source,
    /provider\.StartForeground\(attempt as IsolatedAdbServer\.RetainedProvider\.Attempt\)/,
  );
  assert.match(
    source,
    /provider\.Health\(attempt as IsolatedAdbServer\.RetainedProvider\.Attempt\)/,
  );
  assert.match(source, /diagnostics, "VERSION_ONLY"/);
  assert.match(source, /operationSet != "VERSION_ONLY" && operationSet != "SERVER_ONLY"/);
  assert.match(
    source,
    /string\[\] sessionKeys = \{ "version", "kind", "dispatched", "jobState", "exitCode", "endpointState", "observation" \}/,
  );
  const dispatch = source.slice(
    source.indexOf('void DispatchServer('),
    source.indexOf('void ReadLoop()'),
  );
  before(dispatch, 'Cleanup(attempt, request); return;', 'outstanding != 0');
  assert.match(dispatch, /attempt.healthCalls >= 128/);
  assert.match(dispatch, /attempt.healthCalls\+\+/);
  assert.match(dispatch, /attempt.id != request.AttemptId/);
  assert.match(dispatch, /attempt != null \|\| reserving \|\| seen.Count != 0/);
  assert.match(source, /outstanding >= OutputLimit \|\| writeFailed/);
  assert.match(fixture, /public static int RunServer\(\)/);
  assert.match(fixture, /r.Code=="OUTPUT_FAILED"&&o.count==2/);
  assert.match(fixture, /p.healths==0/);
  const bootstrap = readFileSync(
    new URL('../launch/Invoke-RetainedHost.ps1', import.meta.url),
    'utf8',
  );
  assert.match(
    bootstrap,
    /\$b.operationSet -cne 'VERSION_ONLY' -and \$b.operationSet -cne 'SERVER_ONLY'/,
  );
  assert.match(bootstrap, /\$adapter,\$admission.Liveness\(\),\$true,\$b.operationSet/);
});

test('discovery v2 is separately bounded and never grants session terminal state', () => {
  const patternLiteral = /DiscoveryPattern = new Regex\(("(?:\\.|[^"\\])*")/.exec(source);
  assert.ok(patternLiteral);
  const expression = new RegExp(
    JSON.parse(patternLiteral[1]).replace('\\A', '^').replace('\\z', '$(?![\\s\\S])'),
  );
  const frame =
    JSON.stringify({
      version: 2,
      sessionId: id(1),
      requestId: 2,
      attemptId: id(2),
      operation: 'DISCOVER',
      deadlineUtc: 30000,
    }) + '\n';
  assert.ok(expression.test(frame));
  assert.equal(expression.test(frame.replace('"version":2', '"version":2,"version":2')), false);
  assert.equal(expression.test(frame.replace('30000', '030000')), false);
  assert.match(source, /deadline-now>30000/);
  assert.match(source, /attempt.discoveryCalls >= 128/);
  const worker = source.slice(
    source.indexOf('void DiscoveryWorker('),
    source.indexOf('void Cleanup('),
  );
  assert.doesNotMatch(worker, /attempt\.terminal\s*=\s*true/);
  assert.match(worker, /provider.Discover\(attempt.token,effective\)/);
  assert.match(source, /payload.Length>43692/);
  assert.match(source, /bytes.Length>32768\|\|Convert.ToBase64String\(bytes\)!=payload/);
  assert.match(source, /request.Version.ToString/);
  const discovery = fixture.slice(
    fixture.indexOf('public static int RunDiscovery()'),
    fixture.indexOf('static byte[] MetadataFrame('),
  );
  assert.equal((discovery.match(/groups\+\+/g) ?? []).length, 8);
  assert.match(
    fixture,
    /ReadDevicesList\(channel,new IsolatedAdbServer.RetainedProvider.DiscoveryBudget/,
  );
  assert.match(fixture, /DiscoveryWorkRetired\(false,true,true,connect.Task\)/);
  assert.match(fixture, /GetField\("outstanding",Flags\)/);
  assert.match(fixture, /ordinary.Join\(0\)/);
});

test('metadata v3 is exact ordered enum grammar, separate typed facts and bounded worst-case serialized frame', () => {
  const literal = /MetadataPattern = new Regex\(("(?:\\.|[^"\\])*")/.exec(source);
  assert.ok(literal);
  const expression = new RegExp(
    JSON.parse(literal[1]).replace('\\A', '^').replace('\\z', '$(?![\\s\\S])'),
  );
  const request = {
    version: 3,
    sessionId: id(1),
    requestId: 2,
    attemptId: id(2),
    operation: 'METADATA',
    field: 'MODEL',
    transportId: '1',
    deadlineUtc: 30000,
  };
  const frame = JSON.stringify(request) + '\n';
  assert.ok(expression.test(frame));
  for (const invalid of [
    frame.replace('MODEL', 'MODEL x'),
    frame.replace('"1"', '"01"'),
    frame.replace('"version":3', '"version":3,"version":3'),
    frame.replace('30000', '-0'),
    frame + '\n',
  ])
    assert.equal(expression.test(invalid), false);
  assert.match(source, /deadline>8640000000000000L/);
  assert.match(source, /MetadataTransport\(metadata.Groups\[5\].Value\)/);
  const result = {
    version: 1,
    kind: 'METADATA_QUERY',
    status: 'COMPLETE',
    code: 'OK',
    dispatched: true,
    operationRetired: true,
    stdoutBase64: Buffer.alloc(1, 120).toString('base64'),
    stderrBase64: Buffer.alloc(32767, 121).toString('base64'),
    remoteExitCode: 255,
    observedAtUtc: 8640000000000000,
  };
  assert.equal(result.stdoutBase64.length + result.stderrBase64.length, 43696);
  const response =
    JSON.stringify({
      version: 3,
      sessionId: id(1),
      requestId: Number.MAX_SAFE_INTEGER,
      attemptId: id(2),
      operation: 'METADATA',
      result,
    }) + '\n';
  assert.ok(Buffer.byteLength(response) < 65536);
  assert.match(source, /stdout.Length\+stderr.Length>43696/);
  assert.match(source, /a.Length\+b.Length>32768/);
  assert.match(source, /bytes.Length > FrameLimit \|\| outstanding >= OutputLimit/);
  assert.match(source, /request.Operation=="DISCOVER"\|\|request.Operation=="METADATA"/);
});

test('metadata managed groups cover actual codec, shared cap, cleanup races and output saturation without native construction', () => {
  const groups = fixture.slice(
    fixture.indexOf('public static int RunMetadata()'),
    fixture.indexOf('static byte[] InputFrame('),
  );
  assert.equal((groups.match(/groups\+\+/g) ?? []).length, 12);
  for (const token of [
    'DecodeMetadata(',
    'RejectMetadata(',
    'n<128',
    'p.metadataCalls==64&&p.discoveryCalls==64',
    'p.retires==2',
    'OUTPUT_FAILED',
    'lines[1].Length<65536',
  ])
    assert.ok(groups.includes(token), token);
  assert.match(
    fixture,
    /RetainedProvider.ReadMetadata\(channel,new IsolatedAdbServer.RetainedProvider.DiscoveryBudget/,
  );
  assert.doesNotMatch(
    fixture,
    /new Socket\(|new IsolatedAdbServer\.RetainedProvider\(|new RetainedAdbProtocol.NativeProvider\(/,
  );
  assert.match(
    source,
    /attempt.queryRetirementGeneration\+\+;attempt.terminal=false;attempt.cleanupIssued=false/,
  );
  assert.match(source, /cleanupGeneration == attempt.queryRetirementGeneration/);
  assert.equal((source.match(/status=="COMPLETE",status=="UNRETIRED"/g) ?? []).length, 3);
  assert.match(fixture, /new string\[\]\{"METADATA","DISCOVER","THROW","MALFORMED"\}/);
  assert.match(source, /if\(discovery\)Stop\("PROVIDER_FAILED"\)/);
});

test('input v4 is exact ordered fixed action grammar and separate no-output query facts', () => {
  const literal = /InputPattern = new Regex\(("(?:\\.|[^"\\])*")/.exec(source);
  assert.ok(literal);
  const pattern = new RegExp(
    JSON.parse(literal[1]).replace('\\A', '^').replace('\\z', '$(?![\\s\\S])'),
  );
  const base = {
    version: 4,
    sessionId: id(1),
    requestId: 1,
    attemptId: id(2),
    operation: 'INPUT',
    action: 'HOME',
    transportId: '1',
    deadlineUtc: 2000,
  };
  for (const action of [
    'HOME',
    'BACK',
    'ENTER',
    'ESCAPE',
    'DPAD_UP',
    'DPAD_DOWN',
    'DPAD_LEFT',
    'DPAD_RIGHT',
    'DPAD_CENTER',
  ])
    assert.ok(pattern.test(`${JSON.stringify({ ...base, action })}\n`));
  for (const action of ['TAP', 'SWIPE', 'TEXT', 'HOME\n', 'HOME;id', '3'])
    assert.equal(pattern.test(`${JSON.stringify({ ...base, action })}\n`), false);
  for (const raw of [
    JSON.stringify(base),
    `${JSON.stringify(base)}\r\n`,
    `${JSON.stringify(base)}\n\n`,
    `${JSON.stringify({ ...base, command: 'private' })}\n`,
    `${JSON.stringify(base).replace('"version":4', '"version":4,"version":4')}\n`,
  ])
    assert.equal(pattern.test(raw), false);
  assert.match(source, /MetadataTransport\(input.Groups\[5\].Value\)/);
  assert.match(
    source,
    /provider.Input\(attempt.token,request.TransportId,request.Action,effective\)/,
  );
  const snapshot = source.slice(
    source.indexOf('static Facts InputSnapshot('),
    source.indexOf('static Facts InputFailure('),
  );
  for (const key of [
    'version',
    'kind',
    'status',
    'code',
    'dispatched',
    'operationRetired',
    'remoteExitCode',
    'stdoutEmpty',
    'stderrEmpty',
    'observedAtUtc',
  ])
    assert.ok(snapshot.includes(`"${key}"`));
  assert.doesNotMatch(snapshot, /stdoutBase64|stderrBase64|OBSERVED|SUCCESS|processRetired/);
  assert.match(snapshot, /return new Facts\(json,false,status=="COMPLETE",status=="UNRETIRED"\)/);
});

test('input twelve managed groups exercise actual codec and retained query obligations without constructing native effects', () => {
  const groups = fixture.slice(
    fixture.indexOf('public static int RunInput()'),
    fixture.indexOf('public static int RunAll()'),
  );
  assert.equal((groups.match(/groups\+\+/g) ?? []).length, 12);
  for (const token of [
    'DecodeInput(',
    'RejectInput(',
    'p.inputs==43&&p.metadataCalls==43&&p.discoveryCalls==42',
    'p.retires==2',
    'OUTPUT_FAILED',
    'lines[1].Length<65536',
    'facts.Count==10',
    'missingEof=true',
  ])
    assert.ok(groups.includes(token), token);
  assert.match(
    fixture,
    /RetainedProvider.ReadInput\(channel,new IsolatedAdbServer.RetainedProvider.DiscoveryBudget/,
  );
  assert.doesNotMatch(
    fixture,
    /new Socket\(|new IsolatedAdbServer\.RetainedProvider\(|new RetainedAdbProtocol.NativeProvider\(/,
  );
  assert.match(
    source,
    /request.Operation=="DISCOVER"\|\|request.Operation=="METADATA"\|\|request.Operation=="INPUT"/,
  );
});
