import test from 'node:test';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  realpath,
  mkdir,
  readFile,
  writeFile,
  readdir,
  rm,
  symlink,
} from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createPlatformToolsProvisionLedger } from '../src/main/platform-tools-provision-ledger.ts';
const a = { manifestSha256: 'a'.repeat(64), archiveSha256: 'b'.repeat(64) },
  b = { manifestSha256: 'c'.repeat(64), archiveSha256: 'd'.repeat(64) };
async function fixture(run) {
  const base = await realpath(new URL('../.test-output', import.meta.url)),
    root = await mkdtemp(join(base, 'provision-ledger-'));
  let owned = true;
  const options = {
    dataRoot: root,
    storeId: randomUUID(),
    assertOwnedSync: () => {
      if (!owned) throw Error('private owner detail');
    },
    acceptedCandidates: [a, b],
  };
  const ledger = createPlatformToolsProvisionLedger(options),
    operations = join(root, 'platform-tools-runtime', 'operations');
  const request = (candidate = a, kind = 'INSTALL') => ({
    operationId: randomUUID(),
    kind,
    route: kind === 'INSTALL' ? 'LOCAL_ARCHIVE' : 'RETAINED_RUNTIME',
    ...candidate,
    recipientDecisionId: randomUUID(),
  });
  try {
    await run({
      root,
      options,
      ledger,
      operations,
      request,
      revoke: () => {
        owned = false;
      },
    });
  } finally {
    assert.equal(await realpath(root), root);
    await rm(root, { recursive: true, force: false });
  }
}
test('canonical genesis/hash chain, activation, failed install and retained rollback survive fresh instance', () =>
  fixture(async (f) => {
    await f.ledger.initialize();
    const marker = await readFile(
      join(f.root, 'platform-tools-runtime', '.platform-tools-owner.json'),
    );
    assert.equal(
      (await f.ledger.readState()).lastSettlementSha256,
      createHash('sha256').update(marker).digest('hex'),
    );
    let token = await f.ledger.begin(0, f.request());
    await assert.rejects(f.ledger.readState(), /RECOVERY_REQUIRED/);
    const first = await f.ledger.settle(token, 'ACTIVATED', () => {});
    assert.equal(first.activeSha256, a.archiveSha256);
    token = await f.ledger.begin(1, f.request(b));
    const second = await f.ledger.settle(token, 'ACTIVATED', () => {});
    assert.equal(second.previousActiveSha256, a.archiveSha256);
    token = await f.ledger.begin(2, f.request());
    const failed = await f.ledger.settle(token, 'NOT_ACTIVATED', () => {});
    assert.equal(failed.activeSha256, b.archiveSha256);
    assert.equal(failed.previousActiveSha256, a.archiveSha256);
    token = await f.ledger.begin(3, f.request(a, 'ROLLBACK'));
    const rolled = await f.ledger.settle(token, 'ACTIVATED', () => {});
    assert.equal(rolled.activeSha256, a.archiveSha256);
    assert.equal(rolled.previousActiveSha256, b.archiveSha256);
    assert.equal(rolled.operations.length, 4);
    assert.ok(Object.isFrozen(rolled.operations));
    assert.ok(rolled.operations.every(Object.isFrozen));
    assert.deepEqual(
      rolled.operations.map((x) => x.archiveSha256),
      [a.archiveSha256, b.archiveSha256, a.archiveSha256, a.archiveSha256],
    );
    assert.equal(rolled.operations[3].kind, 'ROLLBACK');
    assert.deepEqual(
      rolled.operations.map((x) => x.operationId),
      rolled.operationIds,
    );
    assert.deepEqual(await createPlatformToolsProvisionLedger(f.options).readState(), rolled);
    assert.equal((await readdir(f.operations)).length, 8);
  }));
test('opaque operation authority cannot be copied or reconstructed after interrupted reopen', () =>
  fixture(async (f) => {
    await f.ledger.initialize();
    const token = await f.ledger.begin(0, f.request());
    await assert.rejects(
      f.ledger.settle({ ...token }, 'ACTIVATED', () => {}),
      /INVALID_REQUEST/,
    );
    const reopened = createPlatformToolsProvisionLedger(f.options);
    await assert.rejects(reopened.readState(), /RECOVERY_REQUIRED/);
    await assert.rejects(
      reopened.settle(token, 'ACTIVATED', () => {}),
      /INVALID_REQUEST/,
    );
    await f.ledger.settle(token, 'NOT_ACTIVATED', () => {});
    await assert.rejects(
      f.ledger.settle(token, 'ACTIVATED', () => {}),
      /INVALID_REQUEST/,
    );
  }));
test('unknown/partial records, duplicated keys, altered canonical encodings and symlinks refuse without cleanup', async () => {
  for (const mode of ['unknown', 'partial', 'duplicate', 'newline', 'symlink'])
    await fixture(async (f) => {
      await f.ledger.initialize();
      const token = await f.ledger.begin(0, f.request());
      await f.ledger.settle(token, 'ACTIVATED', () => {});
      const name = (await readdir(f.operations)).find((x) => x.endsWith('.intent.json')),
        file = join(f.operations, name),
        original = await readFile(file, 'utf8');
      if (mode === 'unknown') await writeFile(join(f.operations, 'unknown'), 'private');
      if (mode === 'partial') await writeFile(file, '{');
      if (mode === 'duplicate') await writeFile(file, original.replace('{', '{"version":1,'));
      if (mode === 'newline') await writeFile(file, original + '\n');
      if (mode === 'symlink') {
        await rm(file);
        await symlink(join(f.root, 'absent'), file);
      }
      const before = await readdir(f.operations);
      await assert.rejects(f.ledger.readState());
      assert.deepEqual(await readdir(f.operations), before);
    });
});
test('stale revision, unsupported candidate, rollback target and getter fail before write', () =>
  fixture(async (f) => {
    await f.ledger.initialize();
    await assert.rejects(f.ledger.begin(1, f.request()), /STALE_REVISION/);
    await assert.rejects(f.ledger.begin(0, f.request(b, 'ROLLBACK')), /INVALID_REQUEST/);
    await assert.rejects(
      f.ledger.begin(0, f.request({ ...a, archiveSha256: 'e'.repeat(64) })),
      /INVALID_REQUEST/,
    );
    const value = f.request();
    Object.defineProperty(value, 'operationId', {
      get() {
        throw Error('getter');
      },
      enumerable: true,
    });
    assert.throws(() => f.ledger.begin(0, value), /INVALID_REQUEST/);
    assert.deepEqual(await readdir(f.operations), []);
  }));
test('final admission and owner loss prevent settlement; no overwrite of prior intent', () =>
  fixture(async (f) => {
    await f.ledger.initialize();
    const request = f.request(),
      token = await f.ledger.begin(0, request);
    await assert.rejects(
      f.ledger.settle(token, 'ACTIVATED', () => {
        throw Error('admission denied');
      }),
      /admission denied/,
    );
    assert.equal((await readdir(f.operations)).length, 1);
    await f.ledger.settle(token, 'NOT_ACTIVATED', () => {});
    const original = await readFile(
      join(f.operations, `operation-${request.operationId}.intent.json`),
    );
    await assert.rejects(f.ledger.begin(1, request));
    assert.deepEqual(
      await readFile(join(f.operations, `operation-${request.operationId}.intent.json`)),
      original,
    );
    f.revoke();
    await assert.rejects(f.ledger.readState(), /OWNER_REVOKED/);
  }));
test('128 operation pairs exhaust without pruning or an extra intent', () =>
  fixture(async (f) => {
    await f.ledger.initialize();
    // Synthetic canonical history fixture, not 128 real installations. The actual
    // reader verifies every pair and its raw-byte chain before enforcing the cap.
    const sha = (raw) => createHash('sha256').update(raw).digest('hex');
    let previous = (await f.ledger.readState()).lastSettlementSha256;
    for (let revision = 1; revision <= 128; revision++) {
      const request = f.request();
      const intent = JSON.stringify({
        version: 1,
        storeId: f.options.storeId,
        operationId: request.operationId,
        revision,
        previousSettlementSha256: previous,
        kind: request.kind,
        route: request.route,
        manifestSha256: request.manifestSha256,
        archiveSha256: request.archiveSha256,
        previousActiveSha256: null,
        recipientDecisionId: request.recipientDecisionId,
      });
      const settled = JSON.stringify({
        version: 1,
        storeId: f.options.storeId,
        operationId: request.operationId,
        revision,
        intentSha256: sha(intent),
        outcome: 'NOT_ACTIVATED',
        activeSha256: null,
        previousActiveSha256: null,
      });
      await writeFile(join(f.operations, `operation-${request.operationId}.intent.json`), intent, {
        flag: 'wx',
      });
      await writeFile(
        join(f.operations, `operation-${request.operationId}.settled.json`),
        settled,
        { flag: 'wx' },
      );
      previous = sha(settled);
    }
    assert.equal((await f.ledger.readState()).revision, 128);
    await assert.rejects(f.ledger.begin(128, f.request()), /LIMIT_EXCEEDED/);
    assert.equal((await readdir(f.operations)).length, 256);
  }));
test('unmarked existing root is never adopted', () =>
  fixture(async (f) => {
    await mkdir(join(f.root, 'platform-tools-runtime'));
    await assert.rejects(f.ledger.initialize());
    assert.deepEqual(await readdir(join(f.root, 'platform-tools-runtime')), []);
  }));

test('settled record sync failure preserves uncertain bytes and fences the live instance', () =>
  fixture(async (f) => {
    await f.ledger.initialize();
    const token = await f.ledger.begin(0, f.request());
    const original = fsPromises.open;
    fsPromises.open = async function (path, ...args) {
      const handle = await original.call(this, path, ...args);
      if (String(path).endsWith('.settled.json') && args[0] === 'wx')
        handle.sync = async () => {
          throw Error('private sync failure');
        };
      return handle;
    };
    syncBuiltinESMExports();
    try {
      await assert.rejects(
        f.ledger.settle(token, 'ACTIVATED', () => {}),
        /OUTCOME_UNKNOWN/,
      );
    } finally {
      fsPromises.open = original;
      syncBuiltinESMExports();
    }
    assert.equal((await readdir(f.operations)).length, 2);
    await assert.rejects(f.ledger.readState(), /RECOVERY_REQUIRED/);
  }));
