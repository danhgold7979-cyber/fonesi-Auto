import test from 'node:test';
import assert from 'node:assert/strict';
import { createSecretProvider, SecretProviderError } from '../src/main/secret-provider.ts';
const native = () => ({
  isAsyncEncryptionAvailable: async () => true,
  encryptStringAsync: async () => Buffer.from([1, 2]),
  decryptStringAsync: async () => ({ result: 'private', shouldReEncrypt: false }),
});
const rejects = (promise, code) =>
  assert.rejects(
    promise,
    (e) =>
      e instanceof SecretProviderError &&
      Object.isFrozen(e) &&
      e.code === code &&
      e.message === code,
  );
test('exact native API successful copied output and frozen adapter/result', async () => {
  const p = native(),
    raw = Buffer.from([1, 2]);
  p.encryptStringAsync = async () => raw;
  let admissions = 0;
  const adapter = createSecretProvider(p, async () => {
    admissions++;
  });
  const encrypted = await adapter.encrypt('x');
  raw[0] = 9;
  assert.deepEqual([...encrypted], [1, 2]);
  const result = await adapter.decrypt(Buffer.from([3]));
  assert.deepEqual(result, { result: 'private', shouldReEncrypt: false });
  assert.equal(admissions, 6);
  assert.ok(Object.isFrozen(adapter));
  assert.ok(Object.isFrozen(result));
});
test('input snapshots precede await; provider copies clear without altering caller', async () => {
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  const p = native();
  let seen;
  p.decryptStringAsync = async (bytes) => {
    seen = bytes;
    assert.deepEqual([...bytes], [1, 2]);
    return { result: 'ok', shouldReEncrypt: false };
  };
  const input = Buffer.from([1, 2]);
  const pending = createSecretProvider(p, async () => gate).decrypt(input);
  input[0] = 9;
  release();
  await pending;
  assert.deepEqual([...seen], [0, 0]);
  assert.deepEqual([...input], [9, 2]);
});
test('callbacks captured once and malformed inputs never invoke admission', async () => {
  const p = native();
  const adapter = createSecretProvider(p, async () => {});
  p.encryptStringAsync = async () => {
    throw Error('CANARY');
  };
  assert.deepEqual([...(await adapter.encrypt('x'))], [1, 2]);
  let calls = 0;
  const bad = createSecretProvider(native(), async () => {
    calls++;
  });
  for (const x of ['', 1, null, 'x'.repeat(32769), 'é'.repeat(16385)])
    await rejects(bad.encrypt(x), 'INVALID_REQUEST');
  for (const x of [
    null,
    [],
    new Uint8Array(),
    new Uint8Array(32769),
    new Uint8Array(new SharedArrayBuffer(1)),
  ])
    await rejects(bad.decrypt(x), 'INVALID_REQUEST');
  assert.equal(calls, 0);
});
test('availability requires true; no crypto fallback', async () => {
  for (const value of [false, null, 1, 'true']) {
    const p = native();
    p.isAsyncEncryptionAvailable = async () => value;
    p.encryptStringAsync = async () => assert.fail('crypto');
    await rejects(createSecretProvider(p, async () => {}).encrypt('x'), 'KEY_UNAVAILABLE');
  }
  const p = native();
  p.isAsyncEncryptionAvailable = async () => {
    throw Error('CANARY');
  };
  await rejects(
    createSecretProvider(p, async () => {}).decrypt(Buffer.from([1])),
    'KEY_UNAVAILABLE',
  );
});
test('revocation before availability after availability and after crypto prevents return', async () => {
  for (const at of [1, 2, 3])
    for (const operation of ['encrypt', 'decrypt']) {
      let calls = 0;
      const a = createSecretProvider(native(), async () => {
        if (++calls === at) throw Error('CANARY');
      });
      await rejects(
        a[operation](operation === 'encrypt' ? 'x' : Buffer.from([1])),
        'OWNER_REVOKED',
      );
      assert.equal(calls, at);
    }
});
test('provider exceptions expose only fixed codes', async () => {
  const p = native();
  p.encryptStringAsync = async () => {
    throw Error('CANARY password');
  };
  p.decryptStringAsync = async () => {
    throw Error('CANARY password');
  };
  const a = createSecretProvider(p, async () => {});
  await rejects(a.encrypt('secret'), 'KEY_UNAVAILABLE');
  await rejects(a.decrypt(Buffer.from([1])), 'DECRYPTION_FAILED');
});
test('encryption requires native Buffer within bound', async () => {
  for (const value of [null, 'x', new Uint8Array([1]), Buffer.alloc(0), Buffer.alloc(32769)]) {
    const p = native();
    p.encryptStringAsync = async () => value;
    await rejects(createSecretProvider(p, async () => {}).encrypt('x'), 'KEY_UNAVAILABLE');
  }
  const p = native();
  p.encryptStringAsync = async () => Buffer.alloc(32768);
  assert.equal(
    (await createSecretProvider(p, async () => {}).encrypt('x'.repeat(32768))).length,
    32768,
  );
});
test('decrypt exact descriptors bounds and rotation rejection without rewrite', async () => {
  let getter = 0;
  const accessor = { shouldReEncrypt: false };
  Object.defineProperty(accessor, 'result', {
    enumerable: true,
    get() {
      getter++;
      return 'x';
    },
  });
  for (const value of [
    null,
    {},
    accessor,
    { result: 'x', shouldReEncrypt: 0 },
    { result: 'x', shouldReEncrypt: false, extra: true },
    { result: '', shouldReEncrypt: false },
    { result: 'é'.repeat(16385), shouldReEncrypt: false },
  ]) {
    const p = native();
    p.decryptStringAsync = async () => value;
    await rejects(
      createSecretProvider(p, async () => {}).decrypt(Buffer.from([1])),
      'DECRYPTION_FAILED',
    );
  }
  assert.equal(getter, 0);
  const p = native();
  p.decryptStringAsync = async () => ({ result: 'x', shouldReEncrypt: true });
  p.encryptStringAsync = async () => assert.fail('rewrite');
  await rejects(
    createSecretProvider(p, async () => {}).decrypt(Buffer.from([1])),
    'KEY_UNAVAILABLE',
  );
});
test('decrypt result snapshot cannot mutate across final admission', async () => {
  const p = native();
  const raw = { result: 'old', shouldReEncrypt: false };
  p.decryptStringAsync = async () => raw;
  let calls = 0;
  const a = createSecretProvider(p, async () => {
    if (++calls === 3) {
      raw.result = 'new';
      raw.shouldReEncrypt = true;
    }
  });
  assert.deepEqual(await a.decrypt(Buffer.from([1])), { result: 'old', shouldReEncrypt: false });
});
