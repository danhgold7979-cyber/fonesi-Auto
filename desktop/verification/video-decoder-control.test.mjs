import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  linkSync,
  rmSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import {
  plainDirectory,
  readBounded,
  assertOwner,
  cleanup,
  hash,
  publish,
} from './video-decoder-control.mjs';
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function owned(run) {
  const parent = join(desktop, '.test-output');
  mkdirSync(parent, { recursive: true });
  const root = join(parent, `video-decoder-${randomUUID()}`);
  mkdirSync(root);
  const token = randomUUID();
  writeFileSync(join(root, '.owner'), token);
  try {
    run(root, token);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test('bounded read rejects oversized, empty, directories and hard linked files', () => {
  const root = mkdtempSync(join(tmpdir(), 'decoder-read-'));
  try {
    const file = join(root, 'a');
    writeFileSync(file, 'abc');
    assert.equal(readBounded(file, 3).toString(), 'abc');
    assert.throws(() => readBounded(file, 2));
    assert.throws(() => readBounded(root));
    linkSync(file, join(root, 'b'));
    assert.throws(() => readBounded(file));
    writeFileSync(join(root, 'empty'), '');
    assert.throws(() => readBounded(join(root, 'empty')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('owner marker and direct descendant identity are required', () => {
  owned((root, token) => {
    assert.equal(assertOwner(root), token);
    writeFileSync(join(root, '.owner'), 'invalid');
    assert.throws(() => assertOwner(root));
  });
  const root = mkdtempSync(join(tmpdir(), 'video-decoder-'));
  try {
    writeFileSync(join(root, '.owner'), randomUUID());
    assert.throws(() => assertOwner(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('cleanup retires only owned descendants and preserves marker', () => {
  owned((root, token) => {
    mkdirSync(join(root, 'user-data'));
    writeFileSync(join(root, 'user-data', 'fixture'), 'safe');
    writeFileSync(join(root, 'result.json'), '{}');
    cleanup(root);
    assert.equal(existsSync(join(root, 'user-data')), false);
    assert.equal(readFileSync(join(root, '.owner'), 'utf8'), token);
  });
});
test('cleanup preflight rejects links without deleting earlier files', () => {
  owned((root) => {
    writeFileSync(join(root, 'a'), 'keep');
    linkSync(join(root, 'a'), join(root, 'b'));
    assert.throws(() => cleanup(root));
    assert.equal(readFileSync(join(root, 'a'), 'utf8'), 'keep');
  });
});
test('plain directory refuses a file and linked path', () => {
  const root = mkdtempSync(join(tmpdir(), 'decoder-dir-'));
  try {
    writeFileSync(join(root, 'file'), 'x');
    assert.throws(() => plainDirectory(join(root, 'file')));
    symlinkSync(root, join(root, 'link'), 'junction');
    assert.throws(() => plainDirectory(join(root, 'link')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('streaming digest binds bytes beyond one buffer and refuses linked identity', () => {
  const root = mkdtempSync(join(tmpdir(), 'decoder-hash-'));
  try {
    const file = join(root, 'bytes'),
      bytes = Buffer.alloc(131073, 123);
    writeFileSync(file, bytes);
    assert.equal(hash(file), createHash('sha256').update(bytes).digest('hex'));
    linkSync(file, join(root, 'alias'));
    assert.throws(() => hash(file));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('failure evidence publication is exclusive, closed-schema and does not mint PASS', () => {
  const base = join(desktop, '.test-output');
  mkdirSync(base, { recursive: true });
  const files = ['video-decoder-supervisor.json', 'video-decoder-evidence.json'];
  for (const f of files) assert.equal(existsSync(join(base, f)), false);
  const head = 'a'.repeat(40),
    value = {
      version: 1,
      scope: 'ELECTRON_H264_SYNTHETIC_TILE_ONLY',
      head,
      process: null,
      directoryCleanup: false,
      cleanupFailure: null,
      passed: false,
      failure: 'PREPARE_FAILED',
    };
  writeFileSync(join(base, files[0]), JSON.stringify(value), { flag: 'wx' });
  try {
    assert.throws(() => publish('b'.repeat(40)));
    assert.equal(existsSync(join(base, files[1])), false);
    assert.equal(publish(head), false);
    const out = JSON.parse(readFileSync(join(base, files[1]), 'utf8'));
    assert.equal(out.supervisor.passed, false);
    assert.equal(out.result, null);
    assert.throws(() => publish(head));
  } finally {
    for (const f of files) rmSync(join(base, f), { force: true });
  }
});
