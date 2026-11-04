import { createPlatformToolsRuntimeCustody } from '../src/main/platform-tools-runtime-custody.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ViewSession } from '../src/view-session.ts';
import {
  installPlatformToolsSetupBridge,
  PLATFORM_TOOLS_SETUP_CHANNEL,
} from '../src/platform-tools-setup-bridge.ts';
import { setupSuccess } from '../src/platform-tools-setup-contract.ts';
const sender = {},
  caller = {
    sender,
    isMainFrame: true,
    origin: 'auto-foundation://app',
    url: 'auto-foundation://app/status.html',
  };
const state = {
  revision: 1,
  installationRevision: 0,
  state: 'AWAITING_RECIPIENT',
  operationId: '00000000-0000-4000-8000-000000000001',
  code: null,
  installTargetVersion: '37.0.1',
  activeVersion: null,
  rollbackAvailable: false,
};
function session() {
  const v = new ViewSession(sender, caller.origin, caller.url);
  v.beginMainLoad(caller.url);
  assert.equal(v.finishInitial(caller), true);
  return v;
}
test('operation observer survives only RPC release, not revoke/close/generation replacement', () => {
  for (const action of ['revoke', 'close', 'beginMainLoad']) {
    const v = session(),
      a = v.admit(caller);
    assert.equal(a.ok, true);
    a.release();
    assert.equal(a.current(), false);
    assert.equal(a.operationCurrent(), true);
    assert.equal(v.outstanding, 0);
    v[action](caller.url);
    assert.equal(a.operationCurrent(), false);
  }
});
test('bridge pending acknowledgment releases RPC slot but operation liveness remains session/disposal bound', async () => {
  const v = session(),
    handlers = new Map();
  let live;
  const service = {
    execute: async (request, current) => {
      live = current;
      return setupSuccess(
        request.requestId,
        'PENDING',
        state,
        '00000000-0000-4000-8000-000000000002',
        'AVAILABLE',
      );
    },
  };
  const b = installPlatformToolsSetupBridge(
    { handle: (k, f) => handlers.set(k, f), removeHandler: (k) => handlers.delete(k) },
    (event) => v.admit(event),
    () => service,
  );
  const result = JSON.parse(
    await handlers.get(PLATFORM_TOOLS_SETUP_CHANNEL)(
      caller,
      JSON.stringify({
        version: 2,
        requestId: 'p1',
        method: 'platformTools.setup.request',
        expectedRevision: 0,
      }),
    ),
  );
  assert.equal(result.outcome, 'PENDING');
  assert.equal(v.outstanding, 0);
  assert.equal(live(), true);
  b.dispose();
  assert.equal(live(), false);
  assert.equal(handlers.size, 0);
});
test('wrong sender/subframe, malformed/extra argument and revoked session never dispatch native service', async () => {
  const v = session(),
    handlers = new Map();
  let calls = 0;
  installPlatformToolsSetupBridge(
    { handle: (k, f) => handlers.set(k, f), removeHandler: (k) => handlers.delete(k) },
    (event) => v.admit(event),
    () => ({
      execute: async () => {
        calls++;
        return '';
      },
    }),
  );
  const run = handlers.get(PLATFORM_TOOLS_SETUP_CHANNEL),
    wire = JSON.stringify({ version: 2, requestId: 'p1', method: 'platformTools.get' });
  for (const event of [
    { ...caller, sender: {} },
    { ...caller, isMainFrame: false },
  ])
    assert.equal(JSON.parse(await run(event, wire)).code, 'UNTRUSTED_SENDER');
  assert.equal(JSON.parse(await run(caller, wire, {})).code, 'INVALID_SHAPE');
  assert.equal(JSON.parse(await run(caller, '{}')).ok, false);
  v.revoke();
  assert.equal(JSON.parse(await run(caller, wire)).code, 'SESSION_REVOKED');
  assert.equal(calls, 0);
  assert.equal(v.outstanding, 0);
});

test('lost session or rejected reply after setup dispatch never claims NOT_STARTED', async () => {
  for (const throws of [false, true]) {
    const v = session(),
      handlers = new Map();
    installPlatformToolsSetupBridge(
      { handle: (k, f) => handlers.set(k, f), removeHandler: (k) => handlers.delete(k) },
      (event) => v.admit(event),
      () => ({
        execute: async () => {
          if (throws) throw Error('private');
          v.revoke();
          return '';
        },
      }),
    );
    const result = JSON.parse(
      await handlers.get(PLATFORM_TOOLS_SETUP_CHANNEL)(
        caller,
        JSON.stringify({
          version: 2,
          requestId: 'p1',
          method: 'platformTools.setup.request',
          expectedRevision: 0,
        }),
      ),
    );
    assert.equal(result.outcome, 'OUTCOME_UNKNOWN');
    assert.equal(v.outstanding, 0);
    assert.ok(!JSON.stringify(result).includes('private'));
  }
});

test('actual reserved REQUEST with delayed audit result remains unknown after session revoke', async () => {
  const { mkdtempSync, realpathSync, readdirSync, rmdirSync, readFileSync } = await import(
    'node:fs'
  );
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createPlatformToolsSetupService } = await import(
    '../src/main/platform-tools-setup-service.ts'
  );
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'setup-bridge-')));
  const v = session(),
    handlers = new Map();
  let finishAudit,
    finishNative,
    n = 1;
  const service = createPlatformToolsSetupService({
    dataRoot: root,
    storeId: '00000000-0000-4000-8000-000000000900',
    assertOwnedSync() {},
    custody: createPlatformToolsRuntimeCustody({
      dataRoot: root,
      storeId: '00000000-0000-4000-8000-000000000900',
      assertOwnedSync() {},
      assertDataLocation(p) {
        assert.equal(p, root);
      },
    }),
    assertDataLocation(p) {
      assert.equal(p, root);
    },
    clock: Date.now,
    newId: () => `00000000-0000-4000-8000-${String(n++).padStart(12, '0')}`,
    native: {
      interact: () =>
        new Promise((r) => {
          finishNative = r;
        }),
    },
    audit: (e) =>
      e.operation === 'REQUEST' && e.phase === 'RESULT'
        ? new Promise((r) => {
            finishAudit = r;
          })
        : Promise.resolve('AVAILABLE'),
  });
  await service.initialize();
  installPlatformToolsSetupBridge(
    { handle: (k, f) => handlers.set(k, f), removeHandler: (k) => handlers.delete(k) },
    (e) => v.admit(e),
    () => service,
  );
  const reply = handlers.get(PLATFORM_TOOLS_SETUP_CHANNEL)(
    caller,
    JSON.stringify({
      version: 2,
      requestId: 'p1',
      method: 'platformTools.setup.request',
      expectedRevision: 0,
    }),
  );
  const until = Date.now() + 2000;
  while (typeof finishNative !== 'function') {
    assert.ok(Date.now() < until);
    await new Promise((r) => setImmediate(r));
  }
  assert.equal(typeof finishNative, 'function');
  assert.equal(typeof finishAudit, 'function');
  assert.equal(v.outstanding, 1);
  v.revoke();
  finishAudit('AVAILABLE');
  const result = JSON.parse(await reply);
  assert.equal(result.outcome, 'OUTCOME_UNKNOWN');
  assert.equal(result.code, 'SESSION_REVOKED');
  assert.equal(v.outstanding, 0);
  finishNative({ ok: false, code: 'TERMS_DECLINED', action: null });
  assert.equal(await service.shutdown(), 'RETIRED');
  assert.deepEqual(readdirSync(root), []);
  rmdirSync(root);
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /createPlatformToolsSetupService\(\{\s*dataRoot: ownedPersistence\.root,/);
  assert.doesNotMatch(main, /dataRoot: join\(ownedPersistence\.root, 'platform-tools'\)/);
});
