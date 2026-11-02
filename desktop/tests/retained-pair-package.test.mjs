import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import {
  materializeRetainedPair,
  loadApprovedAdmission,
  sha,
} from './fixtures/retained-pair-package.mjs';
const require = createRequire(import.meta.url);
const real = require('../launch/package-admission.cjs');
function owned(run) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pair-package-')));
  try {
    return run(root);
  } finally {
    fs.rmSync(root, { recursive: true });
  }
}
test('production approval is null; actual synthetic files need only explicit test source transformation', () =>
  owned((root) => {
    const f = materializeRetainedPair(root);
    assert.throws(() => real.verifyRetainedPair(root), /PACKAGE_REJECTED/);
    const admission = loadApprovedAdmission(f.approval);
    const result = admission.verifyRetainedPair(root);
    assert.equal(JSON.stringify(result), JSON.stringify(f.approval));
    assert.equal(Object.isFrozen(result), true);
    assert.equal(admission.RETAINED_PAIR_FILES.length, 23);
  }));
test('candidate rejects unexpected files and empty directories without relaxing final package closure', () =>
  owned((root) => {
    const f = materializeRetainedPair(root),
      a = loadApprovedAdmission(f.approval);
    fs.writeFileSync(path.join(root, 'extra.txt'), 'unknown');
    assert.throws(() => a.verifyRetainedPair(root), /PACKAGE_REJECTED/);
    fs.unlinkSync(path.join(root, 'extra.txt'));
    fs.mkdirSync(path.join(root, 'extra'));
    assert.throws(() => a.verifyRetainedPair(root), /PACKAGE_REJECTED/);
    fs.rmdirSync(path.join(root, 'extra'));
    assert.ok(a.verifyRetainedPair(root));
  }));
test('every retained payload, evidence and notice file is byte-bound, not a passed flag', () =>
  owned((root) => {
    const f = materializeRetainedPair(root),
      a = loadApprovedAdmission(f.approval);
    for (const name of a.RETAINED_PAIR_FILES) {
      const p = path.join(root, name),
        b = fs.readFileSync(p);
      fs.writeFileSync(p, Buffer.concat([b, Buffer.from('x')]));
      assert.throws(() => a.verifyRetainedPair(root), /PACKAGE_REJECTED/, name);
      fs.writeFileSync(p, b);
    }
    assert.ok(a.verifyRetainedPair(root));
  }));
test('copied native source mismatch refuses even with unchanged approved pair DLL', () =>
  owned((root) => {
    const f = materializeRetainedPair(root),
      a = loadApprovedAdmission(f.approval);
    const file = path.join(root, 'app/native/RetainedVideoSession.cs');
    fs.appendFileSync(file, '\n// newer unmatched source\n');
    assert.throws(() => a.verifyRetainedPair(root), /PACKAGE_REJECTED/);
  }));
test('missing evidence content cannot be replaced by its approved digest', () =>
  owned((root) => {
    const f = materializeRetainedPair(root),
      a = loadApprovedAdmission(f.approval);
    fs.unlinkSync(path.join(root, 'app/video/evidence/commands.json'));
    assert.throws(() => a.verifyRetainedPair(root), /PACKAGE_REJECTED/);
  }));
test('pair payload hardlinks and symlinks are refused', () =>
  owned((root) => {
    const f = materializeRetainedPair(root),
      a = loadApprovedAdmission(f.approval);
    const file = path.join(root, 'app/video/server.jar'),
      original = fs.readFileSync(file),
      other = path.join(root, 'linked');
    fs.linkSync(file, other);
    assert.throws(() => a.verifyRetainedPair(root), /PACKAGE_REJECTED/);
    fs.unlinkSync(other);
    if (process.platform !== 'win32') {
      fs.renameSync(file, other);
      fs.symlinkSync(other, file);
      assert.throws(() => a.verifyRetainedPair(root), /PACKAGE_REJECTED/);
      fs.unlinkSync(file);
      fs.renameSync(other, file);
    }
    assert.deepEqual(fs.readFileSync(file), original);
  }));
test('approved malformed pair and notice schemas still refuse before package acceptance', () =>
  owned((root) => {
    const f = materializeRetainedPair(root);
    for (const [name, key, value] of [
      ['app/video/pair.json', 'pairManifestSha256', { ...f.pair, architecture: 'x86' }],
      ['app/video/notice-manifest.json', 'noticeManifestSha256', { ...f.notice, extra: true }],
    ]) {
      const file = path.join(root, name),
        original = fs.readFileSync(file),
        raw = Buffer.from(JSON.stringify(value));
      fs.writeFileSync(file, raw);
      assert.throws(
        () => loadApprovedAdmission({ ...f.approval, [key]: sha(raw) }).verifyRetainedPair(root),
        /PACKAGE_REJECTED/,
      );
      fs.writeFileSync(file, original);
    }
  }));
test('notice origin cannot invent a source or tool hash absent from retained evidence', () =>
  owned((root) => {
    const f = materializeRetainedPair(root);
    f.notice.components[0].origin.sourceHashes[0].sha256 = 'f'.repeat(64);
    const raw = Buffer.from(JSON.stringify(f.notice));
    fs.writeFileSync(path.join(root, 'app/video/notice-manifest.json'), raw);
    assert.throws(
      () =>
        loadApprovedAdmission({ ...f.approval, noticeManifestSha256: sha(raw) }).verifyRetainedPair(
          root,
        ),
      /PACKAGE_REJECTED/,
    );
  }));
