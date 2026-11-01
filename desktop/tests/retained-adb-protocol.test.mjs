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
test('reviewed native custody helpers and fixed provider adapter have no new interop and dispatch only existing native methods', () => {
  for (const [name, hash] of [
    ['IsolatedAdbServer.cs', '4bf1cddd06ad6ead68f2f22cdb0c9b7c43cda96d41005f7546973c81b92029d7'],
    ['RetainedAdbSession.cs', 'c22e40441fb6bc9bd7d1b1b1aaced656572c3ded8c2666d006449dd8b2f45470'],
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
    /attempt\.terminal && Done\(attempt\.ordinary\) && Done\(attempt\.cleanup\) && attempt\.frames == 0/,
  );
  assert.match(source, /new Thread\(delegate\(\) \{ Worker\(attempt, request, true\); \}\)/);
});
test('writer flush and all actual worker joins remain required before sole clean return; timeouts never cancel', () => {
  before(
    source,
    'output.Write(frame.bytes, 0, frame.bytes.Length); output.Flush();',
    'outstanding--;',
  );
  assert.match(source, /thread\.Join\(0\)/);
  assert.match(source, /attempt.terminal = facts.terminal;/);
  assert.doesNotMatch(source, /if \(facts.terminal\) attempt.terminal = true/);
  assert.match(source, /attempt.terminal = false; Stop\("PROVIDER_FAILED"\)/);
  assert.match(source, /retired && \(dispatched \? v\["exitCode"\] != null/);
  assert.match(fixture, /"ERROR","NONTERMINAL","NULL_EXIT"/);
  assert.match(fixture, /p.reserves==2&&p.retires==2/);
  assert.match(
    source,
    /Done\(reader\) && \(readPending == null \|\| readPending.IsCompleted\) && Done\(writer\) && workers && native && outstanding == 0 && queue.Count == 0 && !writeFailed/,
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
  assert.doesNotMatch(source, /Thread\.Abort|\.Interrupt\(|\.Cancel\(|\.Dispose\(/);
});
test('future managed fixture exercises real reader with only memory streams and exact fake attempt identity', () => {
  assert.match(fixture, /RetainedAdbProtocol\.Run\(i,o,Session,p/);
  assert.match(fixture, /Object\.ReferenceEquals\(token,attempt\)/);
  assert.match(fixture, /i\.Feed\(Frame\(2,"RETIRE"\)\)/);
  assert.match(fixture, /o\.Release\.Reset\(\)/);
  assert.match(fixture, /Check\(t\.IsAlive&&r==null\)/);
  assert.match(fixture, /Interlocked\.Exchange\(ref live,0\)/);
  assert.doesNotMatch(
    fixture,
    /new RetainedAdbProtocol\.NativeProvider|Process\.Start|File\.|Directory\.|Tcp|Socket|Add-Type/,
  );
  assert.equal((fixture.match(/passed\+\+/g) ?? []).length, 8);
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
