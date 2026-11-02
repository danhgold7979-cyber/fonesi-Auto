// Actual main source composition with synthetic builders only; no Electron/native process execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
function section(start, end) {
  assert.equal(source.split(start).length, 2);
  const offset = source.indexOf(start);
  const until = source.indexOf(end, offset);
  assert.ok(until > offset);
  return source.slice(offset, until);
}
function composition() {
  const calls = [],
    captured = {},
    custody = {},
    registry = {},
    provider = {};
  const context = {
    registry,
    runtimeCustody: custody,
    closing: false,
    resourcesDisposed: false,
    ownedEntry: {},
    desktopRoot: '/synthetic/desktop',
    process: { pid: 123 },
    ownedPersistence: {
      durableAdapter: () => ({ readDurable: () => ({ meta: { revision: 17 } }) }),
    },
    cleanupOwned() {
      calls.push('owner');
    },
    randomUUID: () => '11111111-1111-4111-8111-111111111111',
    context: () => ({ ok: true, launchRoot: '/synthetic/launch' }),
    logger: {
      discoveryAudit: async () => 'AVAILABLE',
      metadataAudit: async () => 'DEGRADED',
      associationAudit: async () => 'AVAILABLE',
    },
    createDiscoverySessionService(options) {
      captured.facade = options;
      return {};
    },
    createAdbServerService(options) {
      calls.push('server');
      captured.server = options;
      return {};
    },
    createHostFactory(options) {
      calls.push('factory');
      captured.factory = options;
      return {};
    },
    createAdbDiscoveryService(options) {
      calls.push('ingestion');
      captured.ingestion = options;
      return {};
    },
    discoverySessionService: undefined,
  };
  const code = section(
    "        if (!registry) throw Error('DISCOVERY_REGISTRY_UNAVAILABLE');",
    '        const versionService = runtimeVersionService;',
  );
  runInNewContext(transformSync(code, { loader: 'ts', format: 'cjs' }).code, context);
  return { calls, captured, context, custody, registry, provider };
}
test('actual main builders preserve shared custody, selected revision, private audit and registry identity', async () => {
  const f = composition();
  assert.deepEqual(f.calls, [], 'constructing the facade does not construct a native controller');
  assert.equal(await f.captured.facade.associationAudit({}), 'AVAILABLE');
  assert.equal(f.captured.facade.readDurableRevision(), 17);
  const admission = () => f.calls.push('current');
  const audit = async () => 'DEGRADED';
  f.captured.facade.createServer(3, admission, audit);
  assert.equal(f.captured.server.expectedInstallationRevision, 3);
  assert.equal(
    f.captured.server.audit,
    audit,
    'actual private barriers are not fabricated AVAILABLE',
  );
  f.captured.server.createFactory(3, 'SERVER_ONLY');
  assert.equal(f.captured.factory.runtimeCustody, f.custody);
  assert.equal(f.captured.factory.expectedInstallationRevision, 3);
  assert.equal(f.captured.factory.operationSet, 'SERVER_ONLY');
  assert.equal(f.captured.factory.assertOwnedSync, f.context.cleanupOwned);
  f.captured.facade.createIngestion(f.provider, admission);
  assert.equal(f.captured.ingestion.provider, f.provider);
  assert.equal(f.captured.ingestion.registry, f.registry);
  assert.equal(f.captured.ingestion.readDurableRevision(), 17);
  f.context.closing = true;
  assert.doesNotThrow(
    () => f.captured.factory.assertOwnedSync(),
    'cleanup ownership survives ordinary close',
  );
  assert.throws(() => f.captured.server.createFactory(3, 'SERVER_ONLY'));
  assert.equal(f.calls.filter((x) => x === 'factory').length, 1);
});
test('actual main context and current-session refusal cannot reach a factory builder', () => {
  const f = composition();
  f.context.context = () => ({ ok: false, code: 'RETAINED_HOST_DISABLED' });
  assert.equal(f.captured.facade.policy(), 'RETAINED_HOST_DISABLED');
  assert.throws(() =>
    f.captured.facade.createServer(
      1,
      () => {
        throw Error('revoked');
      },
      async () => 'AVAILABLE',
    ),
  );
  assert.equal(f.calls.includes('server'), false);
  f.context.context = () => ({ ok: true, launchRoot: '/synthetic/launch' });
  f.captured.facade.createServer(
    1,
    () => {},
    async () => 'AVAILABLE',
  );
  f.context.context = () => ({ ok: false, code: 'RECOVERY_REQUIRED' });
  assert.throws(() => f.captured.server.createFactory(1, 'SERVER_ONLY'));
  assert.equal(f.calls.includes('factory'), false);
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
test('actual main shutdown starts all three drains and never closes shared custody before known retirement', async () => {
  const body = section('              const retirement = (async () => {', '              try {');
  for (const terminal of ['RETIRED', 'UNRETIRED']) {
    const calls = [],
      gates = [deferred(), deferred(), deferred()];
    const context = {
      setup: {
        shutdown() {
          calls.push('setup');
          return gates[0].promise;
        },
      },
      versionService: {
        shutdown() {
          calls.push('version');
          return gates[1].promise;
        },
      },
      discovery: {
        close() {
          calls.push('discovery');
          return gates[2].promise;
        },
      },
      runtimeCustody: {
        async close() {
          calls.push('custody');
          return 'RETIRED';
        },
      },
    };
    runInNewContext(
      transformSync(body + '\nglobalThis.retirement = retirement;', { loader: 'ts', format: 'cjs' })
        .code,
      context,
    );
    assert.deepEqual(calls, ['setup', 'version', 'discovery']);
    gates[0].resolve('RETIRED');
    gates[1].resolve('RETIRED');
    await Promise.resolve();
    assert.equal(calls.includes('custody'), false);
    gates[2].resolve(terminal);
    if (terminal === 'RETIRED') {
      await context.retirement;
      assert.equal(calls.at(-1), 'custody');
    } else {
      await assert.rejects(context.retirement);
      assert.equal(calls.includes('custody'), false);
    }
  }
});
test('actual renderer-loss failure uses coordinated quit before cleanup owner invalidation', () => {
  const code = section('function fail(): void {', '\ntry {\n  if (');
  const calls = [],
    context = {
      closing: false,
      mainReady: true,
      discoverySessionService: {},
      cleanupComplete: true,
      app: {
        quit() {
          calls.push('quit');
        },
        exit() {
          calls.push('exit');
        },
      },
      console: { error() {} },
      cleanup() {
        calls.push('cleanup');
      },
      logger: { emit() {} },
    };
  runInNewContext(transformSync(code + '\nfail();', { loader: 'ts', format: 'cjs' }).code, context);
  assert.deepEqual(calls, ['quit']);
  assert.equal(context.cleanupComplete, false);
  assert.match(source, /bridge\.attach\(window, \(\) => discoverySessionService\?\.revoke\(\)\)/);
});

test('main metadata audit forwards actual logger result and absent logger degrades without native builders', async () => {
  const f = composition();
  assert.equal(await f.captured.facade.metadataAudit({}), 'DEGRADED');
  assert.deepEqual(f.calls, []);
  f.context.logger = undefined;
  assert.equal(await f.captured.facade.metadataAudit({}), 'DEGRADED');
  assert.deepEqual(f.calls, []);
});
