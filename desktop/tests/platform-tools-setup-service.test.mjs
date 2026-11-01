import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, readdirSync, rmdirSync, lstatSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlatformToolsSetupService } from '../src/main/platform-tools-setup-service.ts';
import { createPlatformToolsSetupNative } from '../src/main/platform-tools-setup-native.ts';
const uuid = (n) => `${String(n).padStart(8, '0')}-1234-4234-8234-123456789abc`;
const request = (revision = 0) => ({
  version: 1,
  requestId: 'p1',
  method: 'platformTools.setup.request',
  expectedRevision: revision,
});
const get = { version: 1, requestId: 'p2', method: 'platformTools.get' };
const tick = () => new Promise((r) => setImmediate(r));
function fixture(extra = {}) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'setup-service-')));
  let n = 1;
  const events = [];
  const service = createPlatformToolsSetupService({
    dataRoot: root,
    storeId: uuid(900),
    assertOwnedSync() {},
    assertIdleSync() {},
    assertDataLocation(p) {
      assert.equal(p, root);
    },
    clock: () => Date.now(),
    newId: () => uuid(n++),
    native: { interact: async () => ({ ok: false, code: 'TERMS_DECLINED' }) },
    audit: async (e) => {
      events.push(e);
      return 'AVAILABLE';
    },
    ...extra,
  });
  return {
    root,
    service,
    events,
    async cleanup() {
      assert.equal(await service.shutdown(), 'RETIRED');
      assert.deepEqual(readdirSync(root), []);
      rmdirSync(root);
    },
  };
}
test('real core status plus native decline creates no core files; PENDING is not installed', async () => {
  const f = fixture();
  await f.service.initialize();
  const ack = JSON.parse(await f.service.execute(request(), () => true));
  assert.equal(ack.outcome, 'PENDING');
  assert.equal(ack.snapshot.state, 'AWAITING_RECIPIENT');
  await tick();
  const s = JSON.parse(await f.service.execute(get, () => true));
  assert.equal(s.snapshot.state, 'DECLINED');
  assert.equal(s.snapshot.installationRevision, 0);
  assert.equal(f.events[0].phase, 'INTENT');
  await f.cleanup();
});
test('request audit failure refuses before dialog or revision reservation', async () => {
  let calls = 0;
  const f = fixture({
    native: {
      interact: async () => {
        calls++;
        return { ok: false, code: 'TERMS_DECLINED' };
      },
    },
    audit: async () => 'DEGRADED',
  });
  await f.service.initialize();
  assert.equal(
    JSON.parse(await f.service.execute(request(), () => true)).code,
    'AUDIT_UNAVAILABLE',
  );
  assert.equal(calls, 0);
  assert.equal(JSON.parse(await f.service.execute(get, () => true)).snapshot.revision, 0);
  await f.cleanup();
});
test('one separate pending native interaction rejects duplicates and shutdown awaits real settlement', async () => {
  let resolve;
  const f = fixture({
    native: {
      interact: () =>
        new Promise((r) => {
          resolve = r;
        }),
    },
  });
  await f.service.initialize();
  await f.service.execute(request(), () => true);
  assert.equal(JSON.parse(await f.service.execute(request(), () => true)).code, 'BUSY');
  let retired = false;
  const stop = f.service.shutdown().then((x) => {
    retired = true;
    return x;
  });
  await tick();
  assert.equal(retired, false);
  resolve({ ok: false, code: 'TERMS_DECLINED' });
  assert.equal(await stop, 'RETIRED');
  await f.cleanup();
});
test('session loss during native await prevents grant/core files', async () => {
  let resolve,
    current = true;
  const f = fixture({
    native: {
      interact: () =>
        new Promise((r) => {
          resolve = r;
        }),
    },
  });
  await f.service.initialize();
  await f.service.execute(request(), () => current);
  current = false;
  resolve({ ok: true, route: 'OFFICIAL_DOWNLOAD', archivePath: null });
  await tick();
  assert.equal(JSON.parse(await f.service.execute(get, () => true)).snapshot.code, 'OWNER_REVOKED');
  await f.cleanup();
});
test('PROVISION audit barrier denies accepted injected answers without core files', async () => {
  const f = fixture({
    native: { interact: async () => ({ ok: true, route: 'OFFICIAL_DOWNLOAD', archivePath: null }) },
    audit: async (e) =>
      e.operation === 'PROVISION' && e.phase === 'INTENT' ? 'DEGRADED' : 'AVAILABLE',
  });
  await f.service.initialize();
  await f.service.execute(request(), () => true);
  await tick();
  assert.equal(
    JSON.parse(await f.service.execute(get, () => true)).snapshot.code,
    'AUDIT_UNAVAILABLE',
  );
  await f.cleanup();
});
test('native sequence requires terms and final confirmation; all dialogs default Cancel', async () => {
  const seen = [];
  const answers = [2, 1, 1];
  const native = createPlatformToolsSetupNative(
    {
      showMessageBox: async (o) => {
        seen.push(o);
        return { response: answers.shift() };
      },
      showOpenDialog: async () => ({ canceled: false, filePaths: ['/synthetic.zip'] }),
    },
    async () => assert.fail(),
  );
  const result = await native.interact(() => {});
  assert.deepEqual(result, { ok: true, route: 'LOCAL_ARCHIVE', archivePath: '/synthetic.zip' });
  assert.equal(seen.length, 3);
  assert.ok(seen.every((x) => x.defaultId === 0 && x.cancelId === 0));
  assert.match(seen[0].detail, /https:\/\/developer.android.com\/studio\/terms/);
});
test('opening terms is separate fixed action and does not proceed; await revocation refuses', async () => {
  const urls = [];
  let calls = 0;
  const native = createPlatformToolsSetupNative(
    { showMessageBox: async () => ({ response: 1 }), showOpenDialog: async () => assert.fail() },
    async (u) => urls.push(u),
  );
  assert.equal((await native.interact(() => {})).code, 'TERMS_REQUIRED');
  assert.deepEqual(urls, ['https://developer.android.com/studio/terms']);
  await assert.rejects(
    native.interact(() => {
      if (++calls === 2) throw Error('revoked');
    }),
  );
});
test('ID allocation failure is INTERNAL_FAILURE without audit/dialog effects', async () => {
  let calls = 0;
  const f = fixture({
    newId: () => 'invalid',
    audit: async () => {
      calls++;
      return 'AVAILABLE';
    },
  });
  await f.service.initialize();
  assert.equal(JSON.parse(await f.service.execute(request(), () => true)).code, 'INTERNAL_FAILURE');
  assert.equal(calls, 0);
  await f.cleanup();
});
test('shutdown during REQUEST audit waits its settlement and never schedules native', async () => {
  let release,
    calls = 0;
  const f = fixture({
    audit: () =>
      new Promise((r) => {
        release = r;
      }),
    native: {
      interact: async () => {
        calls++;
        return { ok: false, code: 'TERMS_DECLINED' };
      },
    },
  });
  await f.service.initialize();
  const rpc = f.service.execute(request(), () => true);
  let done = false;
  const closing = f.service.shutdown().then((x) => {
    done = true;
    return x;
  });
  await tick();
  assert.equal(done, false);
  release('AVAILABLE');
  assert.equal(JSON.parse(await rpc).code, 'OWNER_REVOKED');
  assert.equal(await closing, 'RETIRED');
  assert.equal(calls, 0);
  await f.cleanup();
});

test('real failed download settles core revision and explicit second request uses reconciled CAS', async () => {
  let downloads = 0;
  const f = fixture({
    native: { interact: async () => ({ ok: true, route: 'OFFICIAL_DOWNLOAD', archivePath: null }) },
    readOfficialArchive: async () => {
      downloads++;
      throw Error('DOWNLOAD_FAILED');
    },
  });
  await f.service.initialize();
  async function settle() {
    for (let i = 0; i < 1000; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2));
      const response = JSON.parse(await f.service.execute(get, () => true));
      if (response.snapshot.state === 'FAILED') return response.snapshot;
    }
    assert.fail('did not settle');
  }
  await f.service.execute(request(), () => true);
  const first = await settle();
  assert.equal(first.code, 'DOWNLOAD_FAILED');
  assert.equal(first.installationRevision, 1);
  assert.equal(
    JSON.parse(await f.service.execute(request(first.revision), () => true)).outcome,
    'PENDING',
  );
  const second = await settle();
  assert.equal(second.code, 'DOWNLOAD_FAILED');
  assert.equal(second.installationRevision, 2);
  assert.equal(downloads, 2);
  assert.equal(await f.service.shutdown(), 'RETIRED');
  const root = join(f.root, 'platform-tools-runtime');
  assert.deepEqual(readdirSync(root).sort(), [
    '.platform-tools-owner.json',
    'operations',
    'runtimes',
    'staging',
  ]);
  for (const name of ['runtimes', 'staging']) {
    assert.deepEqual(readdirSync(join(root, name)), []);
    rmdirSync(join(root, name));
  }
  const operations = join(root, 'operations'),
    names = readdirSync(operations);
  assert.equal(names.length, 4);
  for (const name of names) {
    assert.match(name, /^operation-[0-9a-f-]{36}\.(intent|settled)\.json$/);
    const file = join(operations, name),
      stat = lstatSync(file);
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1);
    unlinkSync(file);
  }
  rmdirSync(operations);
  unlinkSync(join(root, '.platform-tools-owner.json'));
  rmdirSync(root);
  await f.cleanup();
});

test('last session callback cannot revoke owner and still admit a native interaction', async () => {
  let owned = true,
    calls = 0,
    checks = 0;
  const f = fixture({
    assertOwnedSync() {
      if (!owned) throw Error('OWNER_REVOKED');
    },
    native: {
      interact: async () => {
        calls++;
        return { ok: false, code: 'TERMS_DECLINED' };
      },
    },
  });
  await f.service.initialize();
  const answer = JSON.parse(
    await f.service.execute(request(), () => {
      if (++checks === 4) owned = false;
      return true;
    }),
  );
  assert.equal(answer.code, 'OWNER_REVOKED');
  assert.equal(calls, 0);
  owned = true;
  assert.equal(JSON.parse(await f.service.execute(get, () => true)).snapshot.revision, 0);
  await f.cleanup();
});
test('route, picker and final confirmation cancellations never mint an accepted decision', async () => {
  for (const scenario of ['route', 'picker', 'final']) {
    const responses = scenario === 'route' ? [2, 0] : [2, 1, 0];
    const native = createPlatformToolsSetupNative(
      {
        showMessageBox: async () => ({ response: responses.shift() }),
        showOpenDialog: async () => ({
          canceled: scenario === 'picker',
          filePaths: scenario === 'picker' ? [] : ['/synthetic.zip'],
        }),
      },
      async () => assert.fail(),
    );
    assert.deepEqual(await native.interact(() => {}), { ok: false, code: 'SETUP_CANCELLED' });
  }
});
test('stale request never opens native dialog and late REQUEST RESULT audit failure keeps PENDING', async () => {
  let release,
    calls = 0;
  const f = fixture({
    native: {
      interact: () => {
        calls++;
        return new Promise((r) => {
          release = r;
        });
      },
    },
    audit: async (e) =>
      e.operation === 'REQUEST' && e.phase === 'RESULT' ? 'DEGRADED' : 'AVAILABLE',
  });
  await f.service.initialize();
  assert.equal(JSON.parse(await f.service.execute(request(3), () => true)).code, 'STALE_REVISION');
  assert.equal(calls, 0);
  const ack = JSON.parse(await f.service.execute(request(), () => true));
  assert.equal(ack.outcome, 'PENDING');
  assert.equal(ack.loggingHealth, 'DEGRADED');
  assert.equal(calls, 1);
  release({ ok: false, code: 'TERMS_DECLINED' });
  await tick();
  await f.cleanup();
});
