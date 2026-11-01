// Actual service; native/custody facts injected except the explicitly owned empty-root case.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeVersionService } from '../src/main/runtime-version-service.ts';
import { validRuntimeVersionAuditTuple } from '../src/runtime-version-audit-contract.ts';
import { parseRuntimeVersionResponse } from '../src/runtime-version-contract.ts';
import { createPlatformToolsRuntimeCustody } from '../src/main/platform-tools-runtime-custody.ts';
import { mkdtempSync, realpathSync, readdirSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const flush = () => new Promise((r) => setImmediate(r));
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function fixture(hooks = {}) {
  let counter = 0,
    owned = true,
    current = true,
    revision = 1,
    builds = 0,
    executions = 0,
    closed = false;
  const tokens = new Set(),
    logs = [],
    native = deferred();
  const custody = {
    async acquireRead() {
      if (hooks.acquire) return hooks.acquire();
      const token = Object.freeze({});
      tokens.add(token);
      return {
        ok: true,
        token,
        observation: { installationRevision: revision, release: hooks.releaseVersion ?? '37.0.1' },
      };
    },
    assertRead(token) {
      assert.ok(tokens.has(token));
      hooks.assertRead?.();
    },
    async releaseRead(token) {
      assert.ok(tokens.has(token));
      const r = await hooks.release?.(token);
      if (r) return r;
      tokens.delete(token);
      return { ok: true, status: 'RETIRED' };
    },
  };
  const service = createRuntimeVersionService({
    custody,
    assertOwnedSync() {
      if (!owned) throw Error('private-owner');
      hooks.owned?.();
    },
    inspectContext: () => hooks.context?.() ?? null,
    clock: () => 1000,
    newId: () =>
      hooks.newId?.() ?? `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
    audit: async (r) => {
      assert.equal(validRuntimeVersionAuditTuple(r), true, JSON.stringify(r));
      logs.push(r);
      return (await hooks.audit?.(r)) ?? 'AVAILABLE';
    },
    createFactory(expectedInstallationRevision) {
      builds++;
      hooks.build?.(expectedInstallationRevision);
      return {
        grant(_owner, admit) {
          admit();
          return {};
        },
        execute: async () => {
          executions++;
          return await native.promise;
        },
        close: async () => {
          const r = (await hooks.close?.()) ?? 'RETIRED';
          closed = r === 'RETIRED';
          return r;
        },
        get retired() {
          return closed;
        },
        get evidence() {
          return { directoryCleanup: closed };
        },
      };
    },
  });
  const call = async (
    method = 'runtimeVersion.get',
    expectedRevision = 1,
    expectedInstallationRevision = 1,
  ) => {
    const raw = await service.execute(
      {
        version: 2,
        requestId: 'p1',
        method,
        ...(method === 'runtimeVersion.get'
          ? {}
          : { expectedRevision, expectedInstallationRevision }),
      },
      () => current,
    );
    const result = parseRuntimeVersionResponse(raw);
    assert.ok(result, raw);
    return result;
  };
  return {
    service,
    call,
    native,
    logs,
    tokens,
    get builds() {
      return builds;
    },
    get executions() {
      return executions;
    },
    set current(v) {
      current = v;
    },
    set owned(v) {
      owned = v;
    },
    set revision(v) {
      revision = v;
    },
  };
}
test('explicit READ is byte-only; pending acknowledgment/CAS and audited native completion reconcile VERIFIED', async () => {
  const f = fixture();
  const first = await f.call();
  assert.equal(first.snapshot.state, 'IDLE');
  assert.equal(f.builds, 0);
  assert.equal((await f.call('runtimeVersion.request', 0)).code, 'STALE_REVISION');
  assert.equal((await f.call('runtimeVersion.request')).outcome, 'PENDING');
  await flush();
  assert.equal(f.executions, 1);
  assert.equal((await f.call()).snapshot.state, 'PENDING');
  assert.equal((await f.call('runtimeVersion.request', 2)).code, 'BUSY');
  f.native.resolve({ outcome: 'OBSERVED', code: 'OK' });
  await flush();
  const done = await f.call();
  assert.equal(done.snapshot.state, 'VERIFIED');
  assert.equal(done.snapshot.verifiedAtUtc, 1000);
  assert.equal(f.tokens.size, 0);
  assert.deepEqual(
    f.logs.filter((r) => r.phase === 'INTENT').map((r) => r.operation),
    ['REQUEST', 'VERIFY'],
  );
  assert.equal(await f.service.shutdown(), 'RETIRED');
});
test('REQUEST and VERIFY audit barriers fail before factory while result failure preserves truthful PENDING', async () => {
  for (const phase of ['REQUEST', 'VERIFY', 'RESULT']) {
    const f = fixture({
      audit: (r) =>
        r.operation === (phase === 'RESULT' ? 'REQUEST' : phase) &&
        r.phase === (phase === 'RESULT' ? 'RESULT' : 'INTENT')
          ? 'DEGRADED'
          : 'AVAILABLE',
    });
    await f.call();
    const r = await f.call('runtimeVersion.request');
    if (phase === 'REQUEST') {
      assert.equal(r.code, 'AUDIT_UNAVAILABLE');
      assert.equal(f.builds, 0);
    } else if (phase === 'VERIFY') {
      assert.equal(r.outcome, 'PENDING');
      await flush();
      assert.equal(f.builds, 0);
      assert.equal(f.logs.at(-1).code, 'AUDIT_UNAVAILABLE');
    } else {
      assert.equal(r.outcome, 'PENDING');
      assert.equal(r.loggingHealth, 'DEGRADED');
      await flush();
      f.native.resolve({ outcome: 'OBSERVED', code: 'OK' });
      await flush();
    }
    assert.equal(await f.service.shutdown(), 'RETIRED');
  }
});
test('lane reserves before awaited custody and rejects concurrent calls without mutation', async () => {
  const wait = deferred();
  const f = fixture({ acquire: () => wait.promise });
  const read = f.call();
  assert.equal((await f.call()).code, 'BUSY');
  assert.equal((await f.call('runtimeVersion.request')).code, 'BUSY');
  wait.resolve({ ok: false, code: 'BINARY_UNAVAILABLE' });
  assert.equal((await read).snapshot.code, 'NOT_PROVISIONED');
  assert.equal(f.builds, 0);
  assert.equal(await f.service.shutdown(), 'RETIRED');
});
test('installation replacement during native work cannot publish old verified authority', async () => {
  const f = fixture();
  await f.call();
  await f.call('runtimeVersion.request');
  await flush();
  f.revision = 2;
  f.native.resolve({ outcome: 'OBSERVED', code: 'OK' });
  await flush();
  assert.equal(f.logs.at(-1).outcome, 'FAILED');
  assert.equal(f.logs.at(-1).code, 'STALE_INSTALLATION');
  const r = await f.call();
  assert.equal(r.snapshot.state, 'IDLE');
  assert.equal(r.snapshot.installationRevision, 2);
  assert.equal(await f.service.shutdown(), 'RETIRED');
});
test('uncertain read release denies success and retains custody; uncertain native close retains operation', async () => {
  const f = fixture({ release: () => ({ ok: false, status: 'UNRETIRED' }) });
  assert.equal((await f.call()).ok, false);
  assert.equal(f.tokens.size, 1);
  assert.equal(await f.service.shutdown(), 'UNRETIRED');
  const g = fixture({ close: () => 'UNRETIRED' });
  await g.call();
  await g.call('runtimeVersion.request');
  await flush();
  g.native.resolve({ outcome: 'OBSERVED', code: 'OK' });
  await flush();
  const r = await g.call();
  assert.equal(r.snapshot.state, 'OUTCOME_UNKNOWN');
  assert.ok(r.snapshot.operationId);
  assert.equal(
    (await g.call('runtimeVersion.request', r.snapshot.revision)).code,
    'RECOVERY_REQUIRED',
  );
  assert.equal(await g.service.shutdown(), 'UNRETIRED');
});
test('shutdown closes admissions and waits actual pending factory settlement with one shared promise', async () => {
  const f = fixture();
  await f.call();
  await f.call('runtimeVersion.request');
  await flush();
  const closing = f.service.shutdown();
  assert.equal(f.service.shutdown(), closing);
  assert.equal((await f.call()).code, 'CLOSED');
  f.native.resolve({ outcome: 'OBSERVED', code: 'OK' });
  assert.equal(await closing, 'RETIRED');
  assert.equal(f.service.retired, true);
});
test('actual owned absent-runtime custody composes NOT_PROVISIONED without creating files or helper', async () => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'version-service-')));
  try {
    const custody = createPlatformToolsRuntimeCustody({
      dataRoot: root,
      storeId: '00000000-0000-4000-8000-000000000900',
      assertOwnedSync() {},
      assertDataLocation(p) {
        assert.equal(p, root);
      },
    });
    const service = createRuntimeVersionService({
      custody,
      assertOwnedSync() {},
      inspectContext: () => null,
      createFactory() {
        throw Error('must-not-build');
      },
      clock: () => 1000,
      newId: () => '00000000-0000-4000-8000-000000000001',
      audit: async () => 'AVAILABLE',
    });
    const r = JSON.parse(
      await service.execute(
        { version: 2, requestId: 'p1', method: 'runtimeVersion.get' },
        () => true,
      ),
    );
    assert.equal(r.snapshot.code, 'NOT_PROVISIONED');
    assert.deepEqual(readdirSync(root), []);
    assert.equal(await service.shutdown(), 'RETIRED');
    assert.equal(await custody.close(), 'RETIRED');
  } finally {
    rmdirSync(root);
  }
});
test('READ audit completion cannot publish after owner or session revocation', async () => {
  for (const revoke of ['owner', 'session']) {
    let f;
    f = fixture({
      audit: (r) => {
        if (r.operation === 'READ') {
          if (revoke === 'owner') f.owned = false;
          else f.current = false;
        }
        return 'AVAILABLE';
      },
    });
    const result = await f.call();
    assert.equal(result.ok, false, revoke + ' revoked during read audit must not receive OBSERVED');
    assert.equal(f.builds, 0);
    assert.equal(await f.service.shutdown(), 'RETIRED');
  }
});
test('revocation while VERIFY intent is awaited prevents native construction after pending acknowledgment', async () => {
  const gate = deferred();
  const f = fixture({
    audit: (r) => (r.operation === 'VERIFY' && r.phase === 'INTENT' ? gate.promise : 'AVAILABLE'),
  });
  await f.call();
  await f.call('runtimeVersion.request');
  await flush();
  f.current = false;
  gate.resolve('AVAILABLE');
  await flush();
  assert.equal(f.builds, 0);
  assert.equal(f.logs.at(-1).code, 'SESSION_REVOKED');
  assert.equal(await f.service.shutdown(), 'RETIRED');
});

test('held final read-release cannot expose VERIFIED before actual release settlement', async () => {
  const gate = deferred();
  let releases = 0;
  const f = fixture({ release: () => (++releases === 3 ? gate.promise : undefined) });
  await f.call();
  await f.call('runtimeVersion.request');
  await flush();
  f.native.resolve({ outcome: 'OBSERVED', code: 'OK' });
  await flush();
  assert.equal(releases, 3);
  assert.equal((await f.call()).snapshot.state, 'PENDING');
  gate.resolve(undefined);
  await flush();
  assert.equal((await f.call()).snapshot.state, 'VERIFIED');
  assert.equal(await f.service.shutdown(), 'RETIRED');
});
test('REQUEST result revocation opens cleanup-only work gate and retires without factory construction', async () => {
  const gate = deferred();
  const f = fixture({
    audit: (r) => (r.operation === 'REQUEST' && r.phase === 'RESULT' ? gate.promise : 'AVAILABLE'),
  });
  await f.call();
  const reply = f.call('runtimeVersion.request');
  await flush();
  f.current = false;
  gate.resolve('AVAILABLE');
  const result = await reply;
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'OUTCOME_UNKNOWN');
  await flush();
  assert.equal(f.builds, 0);
  assert.equal(f.logs.at(-1).code, 'SESSION_REVOKED');
  assert.equal(await f.service.shutdown(), 'RETIRED');
});
test('late VERIFY result logging degradation preserves observed version but remains visible on READ', async () => {
  const f = fixture({
    audit: (r) => (r.operation === 'VERIFY' && r.phase === 'RESULT' ? 'DEGRADED' : 'AVAILABLE'),
  });
  await f.call();
  await f.call('runtimeVersion.request');
  await flush();
  f.native.resolve({ outcome: 'OBSERVED', code: 'OK' });
  await flush();
  const read = await f.call();
  assert.equal(read.snapshot.state, 'VERIFIED');
  assert.equal(read.loggingHealth, 'DEGRADED');
  assert.equal(await f.service.shutdown(), 'RETIRED');
});

test('retired failed VERSION remains visible after explicit READ of the same installation', async () => {
  const f = fixture();
  await f.call();
  await f.call('runtimeVersion.request');
  await flush();
  f.native.resolve({ outcome: 'NOT_DISPATCHED', code: 'INVALID_OBSERVATION' });
  await flush();
  const read = await f.call();
  assert.equal(read.snapshot.state, 'FAILED');
  assert.equal(read.snapshot.code, 'INVALID_OBSERVATION');
  assert.equal(read.snapshot.operationId, null);
  assert.equal(await f.service.shutdown(), 'RETIRED');
});

test('last owner callback invalidating held custody cannot publish admitted READ snapshot', async () => {
  let checks = 0,
    armed = false,
    valid = true;
  const f = fixture({
    assertRead() {
      if (!valid) throw Error('private invalidated custody');
      checks++;
      if (checks === 3) armed = true;
    },
    owned() {
      if (armed) {
        armed = false;
        valid = false;
      }
    },
  });
  const result = await f.call();
  assert.equal(
    result.ok,
    false,
    'final held-token invalidation must not become an OBSERVED response',
  );
  assert.equal(f.builds, 0);
  assert.equal(await f.service.shutdown(), 'RETIRED');
});
test('native builder receives admitted installation revision even if setup changes before VERIFY', async () => {
  const gate = deferred(),
    seen = [];
  const f = fixture({
    audit: (r) => (r.operation === 'VERIFY' && r.phase === 'INTENT' ? gate.promise : 'AVAILABLE'),
    build: (expected) => seen.push(expected),
  });
  await f.call();
  await f.call('runtimeVersion.request');
  await flush();
  f.revision = 2;
  gate.resolve('AVAILABLE');
  await flush();
  assert.deepEqual(seen, [1]);
  f.native.resolve({ outcome: 'OBSERVED', code: 'OK' });
  await flush();
  assert.equal(f.logs.at(-1).code, 'STALE_INSTALLATION');
  assert.equal(await f.service.shutdown(), 'RETIRED');
});

test('selected prior release remains distinct from build install target through captured VERSION', async () => {
  const f = fixture({ releaseVersion: '36.0.0' });
  const read = await f.call();
  assert.equal(read.snapshot.installTargetVersion, '37.0.1');
  assert.equal(read.snapshot.activeVersion, '36.0.0');
  const pending = await f.call('runtimeVersion.request', read.snapshot.revision);
  assert.equal(pending.snapshot.activeVersion, '36.0.0');
  await flush();
  f.native.resolve({ outcome: 'OBSERVED', code: 'OK' });
  await flush();
  const done = await f.call();
  assert.equal(done.snapshot.state, 'VERIFIED');
  assert.equal(done.snapshot.activeVersion, '36.0.0');
  assert.equal(done.snapshot.installTargetVersion, '37.0.1');
  assert.equal(await f.service.shutdown(), 'RETIRED');
});
