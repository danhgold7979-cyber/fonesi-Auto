import test from 'node:test';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports, createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, lstat, rm, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { randomUUID, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { SecretStore } from '../src/main/secret-store.ts';
import { createSecretProvider } from '../src/main/secret-provider.ts';
import { ApplicationLogger } from '../src/main/logging.ts';
import { LogStore } from '../src/main/log-store.ts';
const base = fileURLToPath(new URL('../.test-output', import.meta.url));
async function fixture(fn) {
  try {
    await mkdir(base);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal(await realpath(base), base);
  assert.equal((await lstat(base)).isSymbolicLink(), false);
  const root = await mkdtemp(join(base, 'secret-store-')),
    storeId = randomUUID(),
    key = randomBytes(32),
    events = [];
  const options = {
    root,
    storeId,
    assertOwned: async () => {},
    audit: async (event) => {
      events.push(event);
      return 'AVAILABLE';
    },
    provider: {
      async encrypt(text) {
        const nonce = randomBytes(12),
          cipher = createCipheriv('aes-256-gcm', key, nonce);
        const bytes = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
        return Buffer.concat([nonce, cipher.getAuthTag(), bytes]);
      },
      async decrypt(bytes) {
        const b = Buffer.from(bytes),
          cipher = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
        cipher.setAuthTag(b.subarray(12, 28));
        return {
          result: Buffer.concat([cipher.update(b.subarray(28)), cipher.final()]).toString('utf8'),
          shouldReEncrypt: false,
        };
      },
    },
  };
  try {
    await fn(options, events);
  } finally {
    key.fill(0);
    assert.equal(await realpath(root), root);
    assert.equal((await lstat(root)).isSymbolicLink(), false);
    await rm(root, { recursive: true, force: false });
  }
}
const methods = ['CREATE', 'READ', 'REPLACE', 'DELETE'];
const value = new Uint8Array([1, 2, 3, 4]);
test('synthetic encrypted vault CRUD survives reopen with exact revisions and deletion tombstone', async () =>
  fixture(async (options) => {
    let store = new SecretStore(options);
    await store.initialize('FRESH');
    let caller = store.grant(methods);
    const created = await store.create(caller, 'PROXY_CREDENTIAL', value);
    assert.equal(created.ok, true);
    let reference = created.data.reference;
    await store.close();
    store = new SecretStore(options);
    caller = store.grant(methods);
    const read = await store.read(caller, reference);
    assert.equal(read.ok, true);
    assert.deepEqual(read.data.bytes, value);
    const replaced = await store.replace(caller, reference, new Uint8Array([9]));
    assert.equal(replaced.ok, true);
    assert.equal(replaced.data.reference.revision, 2);
    assert.equal((await store.read(caller, reference)).code, 'STALE_REFERENCE');
    reference = replaced.data.reference;
    const removed = await store.delete(caller, reference);
    assert.equal(removed.outcome, 'COMMITTED');
    assert.equal((await store.delete(caller, reference)).outcome, 'UNCHANGED');
    assert.equal((await store.read(caller, reference)).code, 'DELETED');
    await store.close();
    store = new SecretStore(options);
    assert.equal((await store.status(reference)).data.status, 'DELETED');
    await store.close();
  }));
test('caller spoofing and revocation during provider await never release plaintext or publish index', async () =>
  fixture(async (options) => {
    let release, entered;
    const ready = new Promise((r) => {
      entered = r;
    });
    const original = options.provider.encrypt;
    options.provider.encrypt = async (text) => {
      entered();
      await new Promise((r) => {
        release = r;
      });
      return original(text);
    };
    const store = new SecretStore(options);
    await store.initialize('FRESH');
    const caller = store.grant(methods);
    assert.equal((await store.create({}, 'PROXY_CREDENTIAL', value)).code, 'UNAUTHORIZED');
    const pending = store.create(caller, 'PROXY_CREDENTIAL', value);
    await ready;
    store.revoke(caller);
    release();
    assert.equal((await pending).code, 'UNAUTHORIZED');
    const index = JSON.parse(await readFile(join(options.root, 'vault/index.json'), 'utf8'));
    assert.equal(index.entries.length, 0);
    await store.close();
  }));
test('audit intent failure prevents mutation and post-commit audit failure preserves committed outcome', async () =>
  fixture(async (options) => {
    let mode = 'intent';
    options.audit = async (event) =>
      event.phase === (mode === 'intent' ? 'INTENT' : 'RESULT') ? 'DEGRADED' : 'AVAILABLE';
    const store = new SecretStore(options);
    await store.initialize('FRESH');
    const caller = store.grant(methods);
    const denied = await store.create(caller, 'PROXY_CREDENTIAL', value);
    assert.equal(denied.code, 'AUDIT_UNAVAILABLE');
    assert.equal(
      JSON.parse(await readFile(join(options.root, 'vault/index.json'), 'utf8')).entries.length,
      0,
    );
    mode = 'result';
    const created = await store.create(caller, 'PROXY_CREDENTIAL', value);
    assert.equal(created.ok, true);
    assert.equal(created.outcome, 'COMMITTED');
    assert.equal(created.auditHealth, 'DEGRADED');
    const deniedRead = await store.read(caller, created.data.reference);
    assert.equal(deniedRead.ok, false);
    assert.equal(deniedRead.code, 'AUDIT_UNAVAILABLE');
    assert.equal('data' in deniedRead, false);
    await store.close();
  }));
test('missing index is never reset and provider rotation hints fail without replacing ciphertext', async () =>
  fixture(async (options) => {
    const store = new SecretStore(options);
    await store.initialize('FRESH');
    const caller = store.grant(methods);
    const created = await store.create(caller, 'PROXY_CREDENTIAL', value);
    assert.equal(created.ok, true);
    await store.close();
    const indexPath = join(options.root, 'vault/index.json'),
      index = await readFile(indexPath);
    await rm(indexPath);
    const reopened = new SecretStore(options);
    assert.equal((await reopened.status(created.data.reference)).ok, false);
    await assert.rejects(
      () => reopened.initialize('FRESH'),
      (e) => e.code === 'EEXIST',
    );
    await reopened.close();
    await writeFile(indexPath, index, { flag: 'wx' });
    const old = options.provider.decrypt;
    options.provider.decrypt = async (bytes) => ({ ...(await old(bytes)), shouldReEncrypt: true });
    const rotated = new SecretStore(options);
    assert.equal(
      (await rotated.read(rotated.grant(['READ']), created.data.reference)).code,
      'KEY_UNAVAILABLE',
    );
    await rotated.close();
  }));
test('final synchronous return guard rejects revocation in the admission continuation gap', async () =>
  fixture(async (options) => {
    let finalRead = false,
      store,
      caller;
    options.audit = async (event) => {
      if (event.operation === 'READ' && event.phase === 'RESULT') finalRead = true;
      return 'AVAILABLE';
    };
    options.assertOwned = async () => {
      if (finalRead) queueMicrotask(() => queueMicrotask(() => store.revoke(caller)));
    };
    store = new SecretStore(options);
    await store.initialize('FRESH');
    caller = store.grant(methods);
    const created = await store.create(caller, 'PROXY_CREDENTIAL', value);
    assert.equal(created.ok, true);
    const result = await store.read(caller, created.data.reference);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'UNAUTHORIZED');
    assert.equal('data' in result, false);
    await store.close();
  }));
test('unaudited invalid, unauthorized and overlapping calls never claim audit availability', async () =>
  fixture(async (options) => {
    const store = new SecretStore(options);
    await store.initialize('FRESH');
    const caller = store.grant(methods);
    assert.equal((await store.read(caller, { private: 'canary' })).auditHealth, 'DEGRADED');
    assert.equal((await store.create({}, 'PROXY_CREDENTIAL', value)).auditHealth, 'DEGRADED');
    let release, entered;
    const ready = new Promise((r) => {
      entered = r;
    });
    store.assertOwned = async () => {
      entered();
      await new Promise((r) => {
        release = r;
      });
    };
    const pending = store.create(caller, 'PROXY_CREDENTIAL', value);
    await ready;
    const busy = await store.create(caller, 'PROXY_CREDENTIAL', value);
    assert.equal(busy.code, 'BUSY');
    assert.equal(busy.auditHealth, 'DEGRADED');
    store.revoke(caller);
    release();
    assert.equal((await pending).ok, false);
    await store.close();
  }));

test('real provider adapter preserves rotation and custody denial through the store', async () =>
  fixture(async (options) => {
    const synthetic = options.provider;
    let rotate = false,
      revoked = false;
    options.provider = createSecretProvider(
      {
        isAsyncEncryptionAvailable: async () => true,
        encryptStringAsync: async (text) => Buffer.from(await synthetic.encrypt(text)),
        decryptStringAsync: async (bytes) => ({
          ...(await synthetic.decrypt(bytes)),
          shouldReEncrypt: rotate,
        }),
      },
      async () => {
        if (revoked) throw Error('private custody detail');
      },
    );
    const store = new SecretStore(options);
    await store.initialize('FRESH');
    const caller = store.grant(methods);
    const created = await store.create(caller, 'PROXY_CREDENTIAL', value);
    assert.equal(created.ok, true);
    rotate = true;
    assert.equal((await store.read(caller, created.data.reference)).code, 'KEY_UNAVAILABLE');
    rotate = false;
    revoked = true;
    assert.equal((await store.read(caller, created.data.reference)).code, 'OWNER_REVOKED');
    await store.close();
  }));

test('partial inactive writes survive restart without becoming authority or blocking prior committed reads', async () =>
  fixture(async (options) => {
    let store = new SecretStore(options);
    await store.initialize('FRESH');
    let caller = store.grant(methods);
    const created = await store.create(caller, 'PROXY_CREDENTIAL', value);
    assert.equal(created.ok, true);
    const ref = created.data.reference;
    await store.close();
    const vault = join(options.root, 'vault'),
      orphan = join(vault, `secret-${ref.id}-r2.bin`),
      candidate = join(vault, `.replace-${randomUUID()}.json`);
    await writeFile(orphan, new Uint8Array([1]), { flag: 'wx' });
    await writeFile(candidate, '{"partial":', { flag: 'wx' });
    store = new SecretStore(options);
    caller = store.grant(methods);
    const result = await store.read(caller, ref);
    assert.equal(result.ok, true);
    assert.deepEqual(result.data.bytes, value);
    assert.equal((await store.replace(caller, ref, new Uint8Array([8]))).code, 'WRITE_FAILED');
    assert.deepEqual(await readFile(orphan), Buffer.from([1]));
    assert.equal(await readFile(candidate, 'utf8'), '{"partial":');
    const active = join(vault, `secret-${ref.id}-r1.bin`);
    await writeFile(active, new Uint8Array([1]));
    assert.equal((await store.read(caller, ref)).code, 'DECRYPTION_FAILED');
    await store.close();
  }));

test('composed real logger append/sync faults block vault mutation without exposing canary', async () => {
  for (const point of ['append', 'sync'])
    await fixture(async (options) => {
      const token = randomUUID();
      await writeFile(join(options.root, '.owner'), token, { flag: 'wx' });
      const log = await LogStore.open(
        { root: join(options.root, 'logs-main'), parentToken: token },
        '2026-10-31T11:00:00.000Z',
        (actual) => {
          if (actual === point) throw Error('PRIVATE_CANARY');
        },
      );
      const logger = new ApplicationLogger(log, () => '2026-10-31T11:00:00.000Z');
      options.audit = (fields) => logger.vaultAudit(fields);
      const store = new SecretStore(options);
      try {
        await store.initialize('FRESH');
        const result = await store.create(
          store.grant(methods),
          'PROXY_CREDENTIAL',
          new TextEncoder().encode('PRIVATE_CANARY'),
        );
        assert.equal(result.code, 'AUDIT_UNAVAILABLE');
        assert.equal(result.auditHealth, 'DEGRADED');
        assert.equal(JSON.stringify(result).includes('PRIVATE_CANARY'), false);
        assert.equal(
          JSON.parse(await readFile(join(options.root, 'vault/index.json'), 'utf8')).entries.length,
          0,
        );
      } finally {
        await store.close();
        await logger.close();
      }
    });
});

test('index publication failures before and after actual rename retain one complete version and poison uncertain writer', async () => {
  for (const after of [false, true])
    await fixture(async (options) => {
      let store = new SecretStore(options);
      await store.initialize('FRESH');
      let caller = store.grant(methods);
      const created = await store.create(caller, 'PROXY_CREDENTIAL', value);
      assert.equal(created.ok, true);
      const ref = created.data.reference;
      const original = fsPromises.rename,
        target = join(options.root, 'vault/index.json');
      let observed = 0;
      fsPromises.rename = async (from, to) => {
        if (to === target) {
          observed++;
          if (after) await original(from, to);
          throw Error('PRIVATE_RENAME_FAILURE');
        }
        return original(from, to);
      };
      syncBuiltinESMExports();
      try {
        const result = await store.replace(caller, ref, new Uint8Array([8]));
        assert.equal(result.code, 'OWNER_REVOKED');
        assert.equal(observed, 1);
        assert.equal((await store.read(caller, ref)).code, 'OWNER_REVOKED');
      } finally {
        fsPromises.rename = original;
        syncBuiltinESMExports();
        await store.close();
      }
      const index = JSON.parse(await readFile(target, 'utf8'));
      assert.equal(index.entries[0].revision, after ? 2 : 1);
      store = new SecretStore(options);
      caller = store.grant(methods);
      const actual = { ...ref, revision: after ? 2 : 1 };
      const read = await store.read(caller, actual);
      assert.equal(read.ok, true);
      assert.deepEqual(read.data.bytes, after ? new Uint8Array([8]) : value);
      await store.close();
    });
});

test('emitted native-store facade retains provider error identity within one bundle', async () =>
  fixture(async (options) => {
    const require = createRequire(import.meta.url),
      { createNativeSecretStore } = require('../build/secret-store.cjs');
    const synthetic = options.provider;
    let rotate = false,
      revokeOnAvailability = false,
      revoked = false;
    const store = createNativeSecretStore({
      ...options,
      assertOwned: async () => {
        if (revoked) throw Error('PRIVATE_OWNER');
      },
      provider: {
        isAsyncEncryptionAvailable: async () => {
          if (revokeOnAvailability) revoked = true;
          return true;
        },
        encryptStringAsync: async (text) => Buffer.from(await synthetic.encrypt(text)),
        decryptStringAsync: async (bytes) => ({
          ...(await synthetic.decrypt(bytes)),
          shouldReEncrypt: rotate,
        }),
      },
    });
    await store.initialize('FRESH');
    const caller = store.grant(methods);
    const created = await store.create(caller, 'PROXY_CREDENTIAL', value);
    assert.equal(created.ok, true);
    rotate = true;
    assert.equal((await store.read(caller, created.data.reference)).code, 'KEY_UNAVAILABLE');
    rotate = false;
    revokeOnAvailability = true;
    assert.equal((await store.read(caller, created.data.reference)).code, 'OWNER_REVOKED');
    await store.close();
  }));
