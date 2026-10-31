import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  lstatSync,
  realpathSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  truncateSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';
import { parseBackupHeader, BACKUP_SNAPSHOT_BYTES } from '../src/backup-container-contract.ts';
import { encryptSnapshot, decryptSnapshot } from '../src/main/backup-container.ts';
const root = fileURLToPath(new URL('..', import.meta.url));
function fixture() {
  const base = join(root, '.test-output');
  try {
    mkdirSync(base);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal(lstatSync(base).isSymbolicLink(), false);
  assert.equal(realpathSync(base), resolve(base));
  const dir = mkdtempSync(join(base, 'backup-container-'));
  return {
    dir,
    path: (name) => join(dir, name),
    cleanup() {
      assert.equal(lstatSync(dir).isSymbolicLink(), false);
      assert.equal(realpathSync(dir), resolve(dir));
      rmSync(dir, { recursive: true, force: false });
    },
  };
}
const metadata = () => ({
  storeId: randomUUID(),
  locationId: randomUUID(),
  backupId: randomUUID(),
  keyRef: randomUUID(),
  reason: 'MANUAL',
  snapshotUtc: 1793426400000,
  schemaVersion: 2,
});
// Test-only wrapping adapter. This is NOT Electron safeStorage or key persistence evidence.
function adapter() {
  const map = new Map();
  return {
    async wrap(value) {
      const wrapped = randomBytes(48);
      map.set(wrapped.toString('base64'), value);
      return wrapped;
    },
    async unwrap(wrapped) {
      const result = map.get(Buffer.from(wrapped).toString('base64'));
      if (!result) throw new Error('PRIVATE_KEY_ERROR');
      return { result, shouldReEncrypt: false };
    },
  };
}
async function encrypted(
  f,
  keys = adapter(),
  bytes = Buffer.from('SQLite synthetic fixture\nPASSWORD_OTP_COOKIE_CANARY'),
) {
  writeFileSync(f.path('snapshot'), bytes, { flag: 'wx' });
  const result = await encryptSnapshot(f.path('snapshot'), f.path('backup'), metadata(), keys);
  assert.equal(result.ok, true);
  return { keys, result, bytes };
}
test('canonical header round trip rejects duplicate, unknown and noncanonical representations', async () => {
  const f = fixture();
  try {
    const { result } = await encrypted(f);
    const raw = JSON.stringify(result.header);
    assert.deepEqual(parseBackupHeader(raw), result.header);
    assert.equal(
      parseBackupHeader(raw.replace('"schemaVersion":2', '"schemaVersion":3')).schemaVersion,
      3,
    );
    for (const field of ['storeId', 'locationId', 'backupId', 'keyRef', 'plaintextSha256']) {
      assert.equal(
        parseBackupHeader(
          JSON.stringify({ ...result.header, [field]: `${result.header[field]}\n` }),
        ),
        null,
      );
    }
    for (const bad of [
      raw.replace('"formatVersion":1', '"formatVersion":0,"formatVersion":1'),
      raw.replace('"formatVersion":1', '"\\u0066ormatVersion":0,"formatVersion":1'),
      raw.replace('"formatVersion":1', '"formatVersion":1,"path":"PRIVATE"'),
      ` ${raw}`,
      raw.replace('"formatVersion":1', '"formatVersion":2'),
      raw.replace('"schemaVersion":2', '"schemaVersion":4'),
      raw.replace('"snapshotUtc":1793426400000', '"snapshotUtc":-0'),
      raw.replace('"snapshotUtc":1793426400000', '"snapshotUtc":NaN'),
      ' '.repeat(65537),
    ])
      assert.equal(parseBackupHeader(bad), null);
  } finally {
    f.cleanup();
  }
});
test('streaming authenticated round trip and no plaintext/key material in container', async () => {
  const f = fixture();
  try {
    const keys = adapter(),
      originalWrap = keys.wrap;
    let rawKey;
    keys.wrap = async (value) => {
      rawKey = value;
      return originalWrap(value);
    };
    const { result, bytes } = await encrypted(f, keys, Buffer.alloc(150000, 0x61));
    const recovered = await decryptSnapshot(f.path('backup'), f.path('restored'), keys);
    assert.equal(recovered.ok, true);
    assert.deepEqual(readFileSync(f.path('restored')), bytes);
    assert.equal(recovered.encryptedSha256, result.encryptedSha256);
    assert.deepEqual(recovered.header, result.header);
    const container = readFileSync(f.path('backup'));
    assert.equal(container.includes(Buffer.alloc(64, 0x61)), false);
    assert.equal(container.includes(Buffer.from(rawKey, 'base64')), false);
    assert.equal(container.includes(Buffer.from(rawKey, 'ascii')), false);
  } finally {
    f.cleanup();
  }
});
test('fresh keys and nonces yield distinct ciphertext for identical synthetic content', async () => {
  const f = fixture();
  try {
    const keys = adapter();
    const first = await encrypted(f, keys);
    const second = await encryptSnapshot(f.path('snapshot'), f.path('second'), metadata(), keys);
    assert.equal(second.ok, true);
    assert.notEqual(first.result.header.nonceBase64, second.header.nonceBase64);
    assert.notEqual(first.result.header.wrappedKeyBase64, second.header.wrappedKeyBase64);
    assert.notEqual(first.result.encryptedSha256, second.encryptedSha256);
  } finally {
    f.cleanup();
  }
});
test('ciphertext, tag and authenticated header tamper never return plaintext success', async () => {
  for (const kind of ['ciphertext', 'tag', 'header']) {
    const f = fixture();
    try {
      const { keys } = await encrypted(f);
      const bytes = readFileSync(f.path('backup')),
        offset = 12 + bytes.readUInt32BE(8);
      if (kind === 'ciphertext') bytes[offset] ^= 1;
      else if (kind === 'tag') bytes[bytes.length - 1] ^= 1;
      else {
        const raw = bytes.subarray(12, offset).toString('utf8');
        const changed = raw.replace('"schemaVersion":2', '"schemaVersion":1');
        assert.equal(changed.length, raw.length);
        bytes.write(changed, 12, 'utf8');
      }
      writeFileSync(f.path('backup'), bytes);
      const result = await decryptSnapshot(f.path('backup'), f.path('failed-private'), keys);
      assert.deepEqual(result, { ok: false, code: 'AUTHENTICATION_FAILED' });
    } finally {
      f.cleanup();
    }
  }
});
test('truncation, extra bytes, magic and bad base64 reject before opening destination', async () => {
  for (const kind of [
    'short',
    'tail',
    'extra',
    'magic',
    'high-magic',
    'base64',
    'bom',
    'utf8',
    'header-cap',
  ]) {
    const f = fixture();
    try {
      const { keys } = await encrypted(f);
      let bytes = readFileSync(f.path('backup'));
      if (kind === 'short') bytes = bytes.subarray(0, 10);
      if (kind === 'tail') bytes = bytes.subarray(0, -1);
      if (kind === 'extra') bytes = Buffer.concat([bytes, Buffer.from([0])]);
      if (kind === 'magic') bytes[0] ^= 1;
      if (kind === 'high-magic') bytes[0] |= 128;
      if (kind === 'utf8') bytes[12] = 255;
      if (kind === 'header-cap') bytes.writeUInt32BE(65537, 8);
      if (kind === 'bom') {
        const prefix = Buffer.from(bytes.subarray(0, 12));
        prefix.writeUInt32BE(prefix.readUInt32BE(8) + 3, 8);
        bytes = Buffer.concat([prefix, Buffer.from([239, 187, 191]), bytes.subarray(12)]);
      }
      if (kind === 'base64') {
        const end = 12 + bytes.readUInt32BE(8),
          raw = bytes.subarray(12, end).toString('utf8');
        bytes.write(raw.replace(/"nonceBase64":"./, '"nonceBase64":"!'), 12, 'utf8');
      }
      writeFileSync(f.path('backup'), bytes);
      assert.deepEqual(await decryptSnapshot(f.path('backup'), f.path('absent'), keys), {
        ok: false,
        code: 'CONTAINER_REJECTED',
      });
      assert.equal(existsSync(f.path('absent')), false);
    } finally {
      f.cleanup();
    }
  }
});
test('wrong key, provider failure and rotation hints are fixed failures without fallback', async () => {
  const f = fixture();
  try {
    const { keys } = await encrypted(f);
    const wrong = {
      ...keys,
      unwrap: async () => ({ result: randomBytes(32).toString('base64'), shouldReEncrypt: false }),
    };
    assert.deepEqual(await decryptSnapshot(f.path('backup'), f.path('wrong'), wrong), {
      ok: false,
      code: 'AUTHENTICATION_FAILED',
    });
    for (const [name, unwrap, code] of [
      [
        'provider',
        async () => {
          throw new Error('PRIVATE_PASSWORD');
        },
        'KEY_UNAVAILABLE',
      ],
      [
        'rotate',
        async (wrapped) => ({ ...(await keys.unwrap(wrapped)), shouldReEncrypt: true }),
        'KEY_ROTATION_REQUIRED',
      ],
      ['shape', async () => ({ result: '', shouldReEncrypt: false }), 'KEY_UNAVAILABLE'],
    ]) {
      assert.deepEqual(await decryptSnapshot(f.path('backup'), f.path(name), { ...keys, unwrap }), {
        ok: false,
        code,
      });
      assert.equal(existsSync(f.path(name)), false);
    }
  } finally {
    f.cleanup();
  }
});
test('preexisting destination bytes are never overwritten by either direction', async () => {
  const f = fixture();
  try {
    const { keys } = await encrypted(f);
    writeFileSync(f.path('existing'), 'KEEP', { flag: 'wx' });
    assert.deepEqual(
      await encryptSnapshot(f.path('snapshot'), f.path('existing'), metadata(), keys),
      { ok: false, code: 'DESTINATION_EXISTS' },
    );
    assert.deepEqual(await decryptSnapshot(f.path('backup'), f.path('existing'), keys), {
      ok: false,
      code: 'DESTINATION_EXISTS',
    });
    assert.equal(readFileSync(f.path('existing'), 'utf8'), 'KEEP');
  } finally {
    f.cleanup();
  }
});
test('oversize sparse snapshot, oversize wrapping and changed source reject without success', async () => {
  const f = fixture();
  try {
    writeFileSync(f.path('large'), 'x', { flag: 'wx' });
    truncateSync(f.path('large'), BACKUP_SNAPSHOT_BYTES + 1);
    assert.equal(
      (await encryptSnapshot(f.path('large'), f.path('absent'), metadata(), adapter())).ok,
      false,
    );
    assert.equal(existsSync(f.path('absent')), false);
    writeFileSync(f.path('snapshot'), 'ORIGINAL', { flag: 'wx' });
    assert.deepEqual(
      await encryptSnapshot(f.path('snapshot'), f.path('huge-wrap'), metadata(), {
        ...adapter(),
        wrap: async () => new Uint8Array(49153),
      }),
      { ok: false, code: 'KEY_UNAVAILABLE' },
    );
    const keys = adapter(),
      originalWrap = keys.wrap;
    keys.wrap = async (value) => {
      writeFileSync(f.path('snapshot'), 'MUTATION');
      return originalWrap(value);
    };
    assert.deepEqual(
      await encryptSnapshot(f.path('snapshot'), f.path('changed'), metadata(), keys),
      { ok: false, code: 'SOURCE_CHANGED' },
    );
  } finally {
    f.cleanup();
  }
});
