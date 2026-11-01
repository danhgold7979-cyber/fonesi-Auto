import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { transformSync } from 'esbuild';
import { createPlatformToolsRuntimeCustody } from '../src/main/platform-tools-runtime-custody.ts';
import { createPlatformToolsProvisionLedger } from '../src/main/platform-tools-provision-ledger.ts';
import { PLATFORM_TOOLS_CANDIDATE } from '../src/main/platform-tools-candidate.ts';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const url = (s) => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
const source = (n) => readFileSync(new URL('../src/main/' + n + '.ts', import.meta.url), 'utf8');
async function fixture(run, { installed = false } = {}) {
  const base = await fs.realpath(new URL('../.test-output', import.meta.url)),
    root = await fs.mkdtemp(join(base, 'runtime-custody-')),
    storeId = randomUUID();
  let owned = true,
    onOwner = null;
  const options = {
    dataRoot: root,
    storeId,
    assertOwnedSync() {
      if (onOwner) onOwner();
      if (!owned) throw Error('private owner path');
    },
    assertDataLocation(p) {
      assert.equal(p, root);
    },
  };
  let create = createPlatformToolsRuntimeCustody,
    candidate = PLATFORM_TOOLS_CANDIDATE,
    ledger;
  try {
    if (installed) {
      const data = new Map();
      candidate = {
        ...PLATFORM_TOOLS_CANDIDATE,
        files: PLATFORM_TOOLS_CANDIDATE.files.map((row) => {
          const b = Buffer.alloc(row.peMachine === null ? 32 : 128);
          if (row.peMachine !== null) {
            b.writeUInt16LE(0x5a4d);
            b.writeUInt32LE(64, 60);
            b.writeUInt32LE(0x4550, 64);
            b.writeUInt16LE(332, 68);
            b.writeUInt16LE(267, 88);
          }
          data.set(row.path, b);
          return { ...row, bytes: b.length, sha256: sha(b) };
        }),
      };
      // Synthetic metadata substitution only; production code and exact14 physical verifier run.
      const candidateUrl = url(
        'export const PLATFORM_TOOLS_CANDIDATE=' +
          JSON.stringify(candidate) +
          '; export const PLATFORM_TOOLS_PRIOR_36_CANDIDATE = PLATFORM_TOOLS_CANDIDATE;',
      );
      function compile(name, mocks) {
        let s = source(name);
        if (name === 'platform-tools-catalog') {
          const start = s.indexOf('const KNOWN:'),
            end = s.indexOf('const INSTALL_TARGET_SHA256');
          assert.ok(start > 0 && end > start);
          s =
            s.slice(0, start) +
            'const KNOWN=[{candidate:PLATFORM_TOOLS_CANDIDATE,activationAllowed:true,launchAllowed:true}];\n' +
            s.slice(end);
        }
        for (const [from, to] of Object.entries(mocks)) {
          assert.ok(s.includes("'" + from + "'"));
          s = s.replaceAll("'" + from + "'", JSON.stringify(to));
        }
        assert.doesNotMatch(s, /from ['"]\.\//);
        return url(transformSync(s, { loader: 'ts', format: 'esm', target: 'es2022' }).code);
      }
      const catalogUrl = compile('platform-tools-catalog', {
        './platform-tools-candidate.ts': candidateUrl,
      });
      const archiveUrl = compile('platform-tools-archive', {
        './platform-tools-catalog.ts': catalogUrl,
      });
      const filesUrl = compile('platform-tools-provision-files', {
        './platform-tools-provision-ledger.ts': new URL(
          '../src/main/platform-tools-provision-ledger.ts',
          import.meta.url,
        ).href,
        './platform-tools-catalog.ts': catalogUrl,
        './platform-tools-archive.ts': archiveUrl,
        './platform-tools-files.ts': new URL('../src/main/platform-tools-files.ts', import.meta.url)
          .href,
      });
      const custodyUrl = compile('platform-tools-runtime-custody', {
        './platform-tools-catalog.ts': catalogUrl,
        './platform-tools-provision-ledger.ts': new URL(
          '../src/main/platform-tools-provision-ledger.ts',
          import.meta.url,
        ).href,
        './platform-tools-provision-files.ts': filesUrl,
      });
      create = (await import(custodyUrl)).createPlatformToolsRuntimeCustody;
      ledger = createPlatformToolsProvisionLedger({
        dataRoot: root,
        storeId,
        assertOwnedSync: () => {},
        acceptedCandidates: [
          {
            manifestSha256: sha(JSON.stringify(candidate)),
            archiveSha256: candidate.archive.sha256,
          },
        ],
      });
      await ledger.initialize();
      const runtime = join(
        root,
        'platform-tools-runtime',
        'runtimes',
        'runtime-' + candidate.archive.sha256,
      );
      await fs.mkdir(runtime);
      for (const [name, b] of data) await fs.writeFile(join(runtime, name), b, { flag: 'wx' });
      const token = await ledger.begin(0, {
        operationId: randomUUID(),
        kind: 'INSTALL',
        route: 'LOCAL_ARCHIVE',
        manifestSha256: sha(JSON.stringify(candidate)),
        archiveSha256: candidate.archive.sha256,
        recipientDecisionId: randomUUID(),
      });
      await ledger.settle(token, 'ACTIVATED', () => {});
    }
    const custody = create(options);
    await run({
      root,
      storeId,
      custody,
      ledger,
      candidate,
      options,
      create,
      revoke() {
        owned = false;
      },
      owner(fn) {
        onOwner = fn;
      },
    });
  } finally {
    assert.equal(await fs.realpath(root), root);
    await fs.rm(root, { recursive: true, force: false });
  }
}
const tick = () => new Promise((r) => setImmediate(r));
test('missing provisioning creates no files and setup reserves before reentrant callbacks', () =>
  fixture(async (f) => {
    assert.deepEqual(await f.custody.acquireRead(), { ok: false, code: 'BINARY_UNAVAILABLE' });
    assert.deepEqual(await fs.readdir(f.root), []);
    let nested;
    f.owner(() => {
      f.owner(null);
      nested = f.custody.reserveSetup();
    });
    const r = f.custody.reserveSetup();
    assert.equal(r.ok, true);
    assert.deepEqual(nested, { ok: false, code: 'BUSY' });
    assert.ok(Object.isFrozen(r.token));
    assert.deepEqual(Object.keys(r.token), []);
    assert.deepEqual(await f.custody.acquireRead(), { ok: false, code: 'BUSY' });
    assert.deepEqual(f.custody.releaseSetup({}, true), { ok: false, code: 'INVALID_TOKEN' });
    f.revoke();
    assert.throws(() => f.custody.assertSetup(r.token), /OWNER_REVOKED/);
    assert.equal(f.custody.releaseSetup(r.token, true).status, 'RETIRED');
    assert.equal(await f.custody.close(), 'RETIRED');
    assert.equal(f.custody.reserveSetup().code, 'CLOSED');
  }));
test('actual ledger and physical14 candidate observation pins state and keeps setup excluded', () =>
  fixture(
    async (f) => {
      const before = await f.ledger.readState(),
        r = await f.custody.acquireRead();
      assert.equal(r.ok, true, JSON.stringify(r));
      assert.equal(r.status, 'READ_VERIFIED_ONLY');
      assert.doesNotThrow(() => f.custody.assertRead(r.token));
      assert.throws(() => f.custody.assertRead({}), /INVALID_TOKEN/);
      assert.equal(r.observation.installationRevision, 1);
      assert.equal(
        r.observation.adbPath,
        join(
          f.root,
          'platform-tools-runtime',
          'runtimes',
          'runtime-' + f.candidate.archive.sha256,
          'adb.exe',
        ),
      );
      assert.equal(f.custody.reserveSetup().code, 'BUSY');
      assert.equal((await f.custody.revalidateRead(r.token)).ok, true);
      assert.doesNotThrow(() => f.custody.assertRead(r.token));
      assert.deepEqual(await f.ledger.readState(), before);
      const changed = await f.ledger.begin(1, {
        operationId: randomUUID(),
        kind: 'INSTALL',
        route: 'LOCAL_ARCHIVE',
        manifestSha256: sha(JSON.stringify(f.candidate)),
        archiveSha256: f.candidate.archive.sha256,
        recipientDecisionId: randomUUID(),
      });
      await f.ledger.settle(changed, 'NOT_ACTIVATED', () => {});
      assert.equal((await f.custody.revalidateRead(r.token)).code, 'RECOVERY_REQUIRED');
      assert.equal((await f.custody.revalidateRead(r.token)).code, 'INVALID_TOKEN');
      assert.equal((await f.custody.releaseRead(r.token)).status, 'RETIRED');
      assert.equal((await f.custody.releaseRead(r.token)).code, 'INVALID_TOKEN');
      assert.equal(await f.custody.close(), 'RETIRED');
    },
    { installed: true },
  ));
test('missing tampered extra and symlink candidates refuse preserving source bytes', async () => {
  for (const mode of ['missing', 'tampered', 'extra', 'symlink'])
    await fixture(
      async (f) => {
        const runtime = join(
            f.root,
            'platform-tools-runtime',
            'runtimes',
            'runtime-' + f.candidate.archive.sha256,
          ),
          file = join(runtime, 'adb.exe');
        if (mode === 'missing') await fs.unlink(file);
        if (mode === 'tampered') await fs.writeFile(file, Buffer.alloc(128, 1));
        if (mode === 'extra') await fs.writeFile(join(runtime, 'unknown'), 'private');
        if (mode === 'symlink') {
          await fs.unlink(file);
          await fs.symlink(join(runtime, 'fastboot.exe'), file);
        }
        const names = await fs.readdir(runtime);
        assert.equal((await f.custody.acquireRead()).code, 'RECOVERY_REQUIRED');
        assert.deepEqual(await fs.readdir(runtime), names);
        assert.equal(f.custody.retired, true);
        await f.custody.close();
      },
      { installed: true },
    );
});
test('pending ledger and final owner loss do not create read authority', async () => {
  await fixture(
    async (f) => {
      await f.ledger.begin(1, {
        operationId: randomUUID(),
        kind: 'INSTALL',
        route: 'LOCAL_ARCHIVE',
        manifestSha256: sha(JSON.stringify(f.candidate)),
        archiveSha256: f.candidate.archive.sha256,
        recipientDecisionId: randomUUID(),
      });
      assert.equal((await f.custody.acquireRead()).code, 'RECOVERY_REQUIRED');
      await f.custody.close();
    },
    { installed: true },
  );
  await fixture(
    async (f) => {
      let calls = 0;
      f.owner(() => {
        if (++calls === 5) f.revoke();
      });
      assert.equal((await f.custody.acquireRead()).code, 'OWNER_REVOKED');
      assert.equal(f.custody.retired, true);
      await f.custody.close();
    },
    { installed: true },
  );
});
test('close during delayed actual filesystem read waits settlement, not cancellation', () =>
  fixture(async (f) => {
    const original = fs.lstat;
    let release, entered;
    const ready = new Promise((r) => (entered = r));
    fs.lstat = async function (file, ...args) {
      if (file === join(f.root, 'platform-tools-runtime')) {
        entered();
        await new Promise((r) => (release = r));
      }
      return original.call(this, file, ...args);
    };
    syncBuiltinESMExports();
    try {
      const reading = f.custody.acquireRead();
      await ready;
      let finished = false;
      const close = f.custody.close().then((v) => {
        finished = true;
        return v;
      });
      await tick();
      assert.equal(finished, false);
      release();
      assert.equal((await reading).code, 'CLOSED');
      assert.equal(await close, 'RETIRED');
    } finally {
      fs.lstat = original;
      syncBuiltinESMExports();
    }
  }));
test('false setup retirement and close deadline never unlock; exact late retirement remains possible', () =>
  fixture(async (f) => {
    const r = f.custody.reserveSetup();
    assert.equal(f.custody.releaseSetup(r.token, false).status, 'UNRETIRED');
    assert.equal(f.custody.reserveSetup().code, 'CLOSED');
    assert.equal(f.custody.retired, false);
    const original = globalThis.setTimeout,
      clear = globalThis.clearTimeout;
    let deadline;
    globalThis.setTimeout = (fn, ms) => {
      assert.equal(ms, 120000);
      deadline = fn;
      return 99;
    };
    globalThis.clearTimeout = () => {};
    try {
      const closing = f.custody.close();
      deadline();
      assert.equal(await closing, 'UNRETIRED');
      assert.equal(f.custody.retired, false);
      f.revoke();
      assert.equal(f.custody.releaseSetup(r.token, true).status, 'RETIRED');
      assert.equal(f.custody.retired, true);
      assert.equal(f.custody.reserveSetup().code, 'CLOSED');
    } finally {
      globalThis.setTimeout = original;
      globalThis.clearTimeout = clear;
    }
  }));
test('read release waits its delayed revalidation even after owner loss', () =>
  fixture(
    async (f) => {
      const r = await f.custody.acquireRead();
      assert.equal(r.ok, true);
      const original = fs.lstat;
      let release, entered;
      const ready = new Promise((resolve) => (entered = resolve));
      fs.lstat = async function (file, ...args) {
        if (file === join(f.root, 'platform-tools-runtime')) {
          entered();
          await new Promise((resolve) => (release = resolve));
        }
        return original.call(this, file, ...args);
      };
      syncBuiltinESMExports();
      try {
        const checking = f.custody.revalidateRead(r.token);
        await ready;
        let done = false;
        const releasing = f.custody.releaseRead(r.token).then((value) => {
          done = true;
          return value;
        });
        f.revoke();
        await tick();
        assert.equal(done, false);
        assert.equal(f.custody.reserveSetup().code, 'BUSY');
        release();
        assert.equal((await checking).ok, false);
        assert.equal((await releasing).status, 'RETIRED');
        assert.equal(await f.custody.close(), 'RETIRED');
      } finally {
        fs.lstat = original;
        syncBuiltinESMExports();
      }
    },
    { installed: true },
  ));
test('reentrant close during admission cannot publish a setup or read token', () =>
  fixture(async (f) => {
    let close;
    f.owner(() => {
      f.owner(null);
      close = f.custody.close();
    });
    assert.equal(f.custody.reserveSetup().code, 'CLOSED');
    assert.equal(await close, 'RETIRED');
    assert.equal((await f.custody.acquireRead()).code, 'CLOSED');
  }));
test('close in the settled-inspection microtask handoff cannot publish a verified token', () =>
  fixture(
    async (f) => {
      let calls = 0;
      f.owner(() => calls++);
      const baseline = await f.custody.acquireRead();
      assert.equal(baseline.ok, true);
      const total = calls;
      await f.custody.releaseRead(baseline.token);
      await f.custody.close();
      const next = f.create(f.options);
      let closing;
      calls = 0;
      f.owner(() => {
        if (++calls === total - 1)
          queueMicrotask(() => {
            closing = next.close();
          });
      });
      const result = await next.acquireRead();
      assert.equal(result.ok, false);
      assert.equal(result.code, 'CLOSED');
      assert.equal(await closing, 'RETIRED');
    },
    { installed: true },
  ));

test('settled inactive ledger still inspects unknown and partial payload directories', async () => {
  for (const mode of ['unknown', 'partial'])
    await fixture(async (f) => {
      const ledger = createPlatformToolsProvisionLedger({
        dataRoot: f.root,
        storeId: f.storeId,
        assertOwnedSync: () => {},
        acceptedCandidates: [
          {
            manifestSha256: sha(JSON.stringify(PLATFORM_TOOLS_CANDIDATE)),
            archiveSha256: PLATFORM_TOOLS_CANDIDATE.archive.sha256,
          },
        ],
      });
      await ledger.initialize();
      assert.equal((await f.custody.acquireRead()).code, 'BINARY_UNAVAILABLE');
      const root = join(f.root, 'platform-tools-runtime');
      if (mode === 'unknown') await fs.writeFile(join(root, 'staging', 'unknown'), 'private');
      else
        await fs.mkdir(
          join(root, 'runtimes', 'runtime-' + PLATFORM_TOOLS_CANDIDATE.archive.sha256),
        );
      const before = await fs.readdir(join(root, mode === 'unknown' ? 'staging' : 'runtimes'));
      assert.equal((await f.custody.acquireRead()).code, 'RECOVERY_REQUIRED');
      assert.deepEqual(
        await fs.readdir(join(root, mode === 'unknown' ? 'staging' : 'runtimes')),
        before,
      );
      await f.custody.close();
    });
});
