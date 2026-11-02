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
test('production exact candidate pin refuses synthetic bytes; only explicit test transformation admits fixtures', () =>
  owned((root) => {
    const f = materializeRetainedPair(root);
    assert.throws(() => real.verifyRetainedPair(root), /PACKAGE_REJECTED/);
    assert.throws(() => loadApprovedAdmission(null).verifyRetainedPair(root), /PACKAGE_REJECTED/);
    assert.throws(
      () =>
        loadApprovedAdmission({
          ...f.approval,
          pairManifestSha256: '0'.repeat(64),
        }).verifyRetainedPair(root),
      /PACKAGE_REJECTED/,
    );
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
test('notice v2 accepts only fixed evidence applicability tuples, never old blanket license form', () =>
  owned((root) => {
    const f = materializeRetainedPair(root);
    const file = path.join(root, 'app/video/notice-manifest.json');
    const rejected = (mutate) => {
      const notice = structuredClone(f.notice);
      mutate(notice);
      const raw = Buffer.from(JSON.stringify(notice));
      fs.writeFileSync(file, raw);
      assert.throws(
        () =>
          loadApprovedAdmission({
            ...f.approval,
            noticeManifestSha256: sha(raw),
          }).verifyRetainedPair(root),
        /PACKAGE_REJECTED/,
      );
    };
    rejected((n) => {
      n.version = 1;
    });
    rejected((n) => {
      n.components[0].license = 'Apache-2.0';
      delete n.components[0].licenseEvidence;
    });
    for (let index = 0; index < 5; index++) {
      for (const [key, value] of [
        ['kind', 'OTHER'],
        ['declaredLicense', 'BSD-3-Clause'],
        ['applicability', 'OUTPUT_CLEARED'],
        ['extra', true],
      ]) {
        rejected((n) => {
          n.components[index].licenseEvidence[key] = value;
        });
      }
      rejected((n) => {
        n.components[index].licenseEvidence = n.components[(index + 2) % 5].licenseEvidence;
      });
    }
    fs.writeFileSync(file, JSON.stringify(f.notice));
    assert.ok(loadApprovedAdmission(f.approval).verifyRetainedPair(root));
    assert.throws(() => real.verifyRetainedPair(root), /PACKAGE_REJECTED/);
  }));
