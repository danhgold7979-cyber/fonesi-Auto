import test from 'node:test';
import assert from 'node:assert/strict';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  lstatSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { transformSync } from 'esbuild';
import { PLATFORM_TOOLS_CANDIDATE } from '../src/main/platform-tools-candidate.ts';
import { createPlatformToolsProvisioner } from '../src/main/platform-tools-provisioner.ts';
const sha = (b) => createHash('sha256').update(b).digest('hex');
function crc(data) {
  let n = 0xffffffff;
  for (const b of data) {
    n ^= b;
    for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  }
  return (n ^ 0xffffffff) >>> 0;
}
function syntheticArchive(release = '37.0.1', fill = 0) {
  const rows = PLATFORM_TOOLS_CANDIDATE.files.map((row) => {
    const bytes = Buffer.alloc(row.peMachine === null ? 32 : 128, fill);
    if (row.peMachine !== null) {
      bytes.writeUInt16LE(0x5a4d);
      bytes.writeUInt32LE(64, 60);
      bytes.writeUInt32LE(0x4550, 64);
      bytes.writeUInt16LE(332, 68);
      bytes.writeUInt16LE(267, 88);
    }
    return { ...row, bytes: bytes.length, sha256: sha(bytes), data: bytes };
  });
  const locals = [],
    central = [];
  let offset = 0;
  for (const row of [{ path: '', data: Buffer.alloc(0) }, ...rows]) {
    const name = Buffer.from('platform-tools/' + row.path),
      directory = row.path === '',
      data = row.data,
      compressed = directory ? data : deflateRawSync(data),
      checksum = crc(data),
      local = Buffer.alloc(30),
      header = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(directory ? 0 : 8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    header.writeUInt32LE(0x02014b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(directory ? 0 : 8, 10);
    header.writeUInt32LE(checksum, 16);
    header.writeUInt32LE(compressed.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(directory ? 0x41ff0010 : 0x81b60000, 38);
    header.writeUInt32LE(offset, 42);
    locals.push(local, name, compressed);
    central.push(header, name);
    offset += local.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(15, 8);
  end.writeUInt16LE(15, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  const bytes = Buffer.concat([...locals, directory, end]);
  return {
    bytes,
    total: rows.reduce((n, r) => n + r.bytes, 0),
    candidate: {
      schema: 1,
      release,
      archive: {
        ...PLATFORM_TOOLS_CANDIDATE.archive,
        url: `https://dl.google.com/android/repository/platform-tools_r${release}-win.zip`,
        bytes: bytes.length,
        sha256: sha(bytes),
      },
      files: rows.map(({ data, ...row }) => row),
    },
  };
}
const dataUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
async function fixtureModules(f, archive = f.bytes, timerModule = null, known = null) {
  // Exact synthetic build-owned catalog substitutions only. Production pin/source is unchanged.
  const candidate = dataUrl(
    'export const PLATFORM_TOOLS_CANDIDATE=' +
      JSON.stringify({
        ...f.candidate,
        archive: { ...f.candidate.archive, sha256: sha(archive) },
      }) +
      ';',
  );
  const source = (name) =>
    readFileSync(new URL('../src/main/' + name + '.ts', import.meta.url), 'utf8');
  const compile = (name, mocks) => {
    let s = source(name);
    if (name === 'platform-tools-provisioner' && timerModule) {
      assert.equal(s.split('setTimeout(').length - 1, 2);
      assert.equal(s.split('clearTimeout(').length - 1, 2);
      s = s.replaceAll('setTimeout(', 'timerSet(').replaceAll('clearTimeout(', 'timerClear(');
      s =
        'import {setTimeout as timerSet,clearTimeout as timerClear} from ' +
        JSON.stringify(timerModule) +
        ';\n' +
        s;
    }
    if (name === 'platform-tools-catalog' && known) {
      const marker =
        /\[\s*\{\s*candidate: PLATFORM_TOOLS_CANDIDATE,\s*activationAllowed: true,\s*launchAllowed: true,?\s*\},?\s*\]/;
      assert.match(s, marker);
      s = s.replace(
        marker,
        JSON.stringify(
          known.map((x) => ({
            candidate: x.candidate,
            activationAllowed: x.activationAllowed ?? true,
            launchAllowed: x.launchAllowed ?? true,
          })),
        ),
      );
    }
    for (const [from, to] of Object.entries(mocks)) {
      assert.ok(s.includes("'" + from + "'"));
      s = s.replaceAll("'" + from + "'", JSON.stringify(to));
    }
    assert.doesNotMatch(s, /from ['"]\.\//);
    return dataUrl(transformSync(s, { loader: 'ts', format: 'esm', target: 'es2022' }).code);
  };
  const catalogUrl = compile('platform-tools-catalog', {
    './platform-tools-candidate.ts': candidate,
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
  const coreUrl = compile('platform-tools-provisioner', {
    './platform-tools-catalog.ts': catalogUrl,
    './platform-tools-archive.ts': archiveUrl,
    './platform-tools-provision-ledger.ts': new URL(
      '../src/main/platform-tools-provision-ledger.ts',
      import.meta.url,
    ).href,
    './platform-tools-provision-files.ts': filesUrl,
  });
  const custodyUrl = compile('platform-tools-runtime-custody', {
    './platform-tools-catalog.ts': catalogUrl,
    './platform-tools-provision-ledger.ts': new URL(
      '../src/main/platform-tools-provision-ledger.ts',
      import.meta.url,
    ).href,
    './platform-tools-provision-files.ts': filesUrl,
  });
  return {
    custody: await import(custodyUrl),
    catalog: await import(catalogUrl),
    archive: await import(archiveUrl),
    files: await import(filesUrl),
    core: await import(coreUrl),
  };
}
function owned() {
  const base = realpathSync(new URL('../.test-output', import.meta.url)),
    root = mkdtempSync(join(base, 'provision-core-')),
    token = randomUUID();
  writeFileSync(join(root, '.test-owner'), token, { flag: 'wx' });
  return {
    root,
    assert() {
      assert.equal(realpathSync(root), root);
      assert.equal(readFileSync(join(root, '.test-owner'), 'utf8'), token);
    },
    cleanup() {
      let n = 0;
      function walk(dir) {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name),
            s = lstatSync(p);
          assert.equal(s.isSymbolicLink(), false);
          if (s.isDirectory()) walk(p);
          else {
            assert.equal(s.isFile(), true);
            assert.equal(s.nlink, 1);
            assert.ok(++n <= 128);
          }
        }
      }
      walk(root);
      assert.equal(realpathSync(root), root);
      rmSync(root, { recursive: true, force: false });
    },
  };
}
function options(f, bytes, patch = {}) {
  const grant = Object.freeze({}),
    decisionId = randomUUID();
  let admitted = true;
  const o = {
    dataRoot: f.root,
    storeId: randomUUID(),
    assertOwnedSync: () => f.assert(),
    assertIdleSync: () => {},
    assertDataLocation: (p) => assert.equal(p, f.root),
    clock: () => 1000,
    newId: randomUUID,
    recipient: {
      read: (g) =>
        g === grant
          ? { decisionId, accepted: true, route: 'OFFICIAL_DOWNLOAD', archivePath: null }
          : null,
      isCurrent: (g) => g === grant && admitted,
    },
    readOfficialArchive: async () => bytes,
    ...patch,
  };
  return {
    o,
    grant,
    revoke() {
      admitted = false;
    },
  };
}
test('production candidate metadata is immutable and retains the exact official pin', () => {
  assert.ok(Object.isFrozen(PLATFORM_TOOLS_CANDIDATE));
  assert.ok(Object.isFrozen(PLATFORM_TOOLS_CANDIDATE.files[0]));
  assert.equal(
    PLATFORM_TOOLS_CANDIDATE.archive.sha256,
    '45f4d63113e895ebde0c90f194099a4676b6ac653bd28d54314a9e022bbc1a99',
  );
});
test('exact synthetic ZIP parser exercises member CRC/hash/PE and rejects structural alias/local/central corruption', async () => {
  const f = syntheticArchive(),
    m = await fixtureModules(f);
  assert.equal(m.archive.decodePlatformToolsArchive(f.bytes).length, 14);
  const end = f.bytes.length - 22,
    start = f.bytes.readUInt32LE(end + 16);
  for (const mutate of [
    (b) => b.writeUInt16LE(1, end + 4),
    (b) => b.writeUInt16LE(14, end + 8),
    (b) => b.writeUInt16LE(1, start + 8),
    (b) => b.writeUInt32LE(1, start + 42),
    (b) => b.writeUInt16LE(1, 28),
    (b) => b.writeUInt32LE(0xa1ff0000, start + 46 + 15 + 38),
  ]) {
    const bad = Buffer.from(f.bytes);
    mutate(bad);
    const patched = await fixtureModules(f, bad);
    assert.throws(() => patched.archive.decodePlatformToolsArchive(bad), /ARCHIVE_REJECTED/);
  }
});
test('actual owned synthetic-byte install/reopen is settled only after full publication; idempotent read does not grow history', async () => {
  const fixture = syntheticArchive(),
    m = await fixtureModules(fixture),
    f = owned(),
    setup = options(f, fixture.bytes);
  const core = m.core.createPlatformToolsProvisioner(setup.o);
  try {
    assert.equal((await core.status()).status, 'NOT_PROVISIONED');
    const r = await core.run(setup.grant, 0);
    assert.equal(r.ok, true);
    assert.equal(r.revision, 1);
    assert.equal((await core.run(setup.grant, 1)).revision, 1);
    assert.equal(await core.close(), 'RETIRED');
    const reopened = m.core.createPlatformToolsProvisioner(setup.o);
    assert.equal((await reopened.status()).status, 'VERIFIED_LOCAL');
    await reopened.close();
  } finally {
    await core.close();
    f.cleanup();
  }
});
test('recipient decline, spoofing, unretired server and reentrant admission cannot issue file effects', async () => {
  for (const mode of ['decline', 'spoof', 'busy', 'reentrant']) {
    const f = owned();
    let core, nested;
    const setup = options(
      f,
      new Uint8Array(),
      mode === 'busy'
        ? {
            assertIdleSync() {
              throw Error('private server');
            },
          }
        : {},
    );
    if (mode === 'decline')
      setup.o.recipient.read = () => ({
        decisionId: randomUUID(),
        accepted: false,
        route: 'OFFICIAL_DOWNLOAD',
        archivePath: null,
      });
    if (mode === 'reentrant') {
      const original = setup.o.recipient.read;
      setup.o.recipient.read = (g) => {
        nested = core.run(g, 0);
        return original(g);
      };
    }
    core = createPlatformToolsProvisioner(setup.o);
    try {
      const r = await core.run(mode === 'spoof' ? {} : setup.grant, 0);
      assert.equal(r.ok, false);
      if (nested) assert.equal((await nested).code, 'BUSY');
      if (mode !== 'reentrant') assert.deepEqual(readdirSync(f.root), ['.test-owner']);
    } finally {
      await core.close();
      f.cleanup();
    }
  }
});
test('known wrong archive settles NOT_ACTIVATED without publishing a runtime', async () => {
  const fixture = syntheticArchive(),
    m = await fixtureModules(fixture),
    f = owned(),
    setup = options(f, new Uint8Array([1]));
  const core = m.core.createPlatformToolsProvisioner(setup.o);
  try {
    const wrong = await core.run(setup.grant, 0);
    assert.equal(wrong.code, 'ARCHIVE_REJECTED');
    assert.equal(wrong.outcome, 'NOT_ACTIVATED');
    assert.equal((await core.status()).status, 'NOT_PROVISIONED');
  } finally {
    await core.close();
    f.cleanup();
  }
});
test('last clock callback revocation and mutable options cannot retarget admitted root', async () => {
  const fixture = syntheticArchive(),
    m = await fixtureModules(fixture),
    f = owned();
  let n = 0;
  const setup = options(f, fixture.bytes);
  setup.o.clock = () => {
    if (++n === 2) setup.revoke();
    return 1000;
  };
  const core = m.core.createPlatformToolsProvisioner(setup.o);
  setup.o.dataRoot = '/private-wrong-root';
  try {
    const r = await core.run(setup.grant, 0);
    assert.equal(r.code, 'TERMS_REQUIRED');
    assert.deepEqual(readdirSync(f.root), ['.test-owner']);
  } finally {
    await core.close();
    f.cleanup();
  }
});
test('close never calls an unretired pending download completed; late settlement cannot publish', async () => {
  const fixture = syntheticArchive(),
    m = await fixtureModules(fixture),
    f = owned();
  let release, started;
  const begin = new Promise((r) => {
      started = r;
    }),
    waiting = new Promise((r) => {
      release = r;
    });
  const setup = options(f, fixture.bytes, {
      readOfficialArchive: async () => {
        started();
        return waiting;
      },
    }),
    core = m.core.createPlatformToolsProvisioner(setup.o);
  try {
    const task = core.run(setup.grant, 0);
    await begin;
    assert.equal((await core.run(setup.grant, 0)).code, 'BUSY');
    let done = false;
    const closed = core.close().then((r) => {
      done = true;
      return r;
    });
    await Promise.resolve();
    assert.equal(done, false);
    assert.equal(core.retired, false);
    release(fixture.bytes);
    assert.equal((await task).outcome, 'OUTCOME_UNKNOWN');
    assert.equal(await closed, 'RETIRED');
    assert.equal((await core.status()).status, 'RECOVERY_REQUIRED');
  } finally {
    release?.(fixture.bytes);
    await core.close();
    f.cleanup();
  }
});

test('preexisting partial runtime refuses before a new intent and preserves every original byte', async () => {
  const fixture = syntheticArchive(),
    m = await fixtureModules(fixture),
    f = owned(),
    setup = options(f, new Uint8Array([1])),
    core = m.core.createPlatformToolsProvisioner(setup.o);
  try {
    await core.run(setup.grant, 0);
    const root = join(f.root, 'platform-tools-runtime'),
      runtime = join(root, 'runtimes', 'runtime-' + fixture.candidate.archive.sha256);
    mkdirSync(runtime);
    writeFileSync(join(runtime, 'adb.exe'), 'retained', { flag: 'wx' });
    const before = readdirSync(join(root, 'operations'));
    await core.close();
    const next = m.core.createPlatformToolsProvisioner({
      ...setup.o,
      readOfficialArchive: async () => fixture.bytes,
    });
    const r = await next.run(setup.grant, 1);
    assert.equal(r.ok, false);
    assert.equal(readFileSync(join(runtime, 'adb.exe'), 'utf8'), 'retained');
    assert.deepEqual(readdirSync(join(root, 'operations')), before);
    assert.deepEqual(readdirSync(join(root, 'staging')), []);
    await next.close();
  } finally {
    await core.close();
    f.cleanup();
  }
});
test('last grant callback owner loss prevents mkdir and thrown exotic failures remain fixed results', async () => {
  for (const mode of ['owner', 'proxy']) {
    const f = owned(),
      setup = options(f, new Uint8Array());
    let ownership = true;
    setup.o.assertOwnedSync = () => {
      f.assert();
      if (!ownership) throw Error('PRIVATE_OWNER');
    };
    if (mode === 'owner')
      setup.o.recipient.isCurrent = () => {
        ownership = false;
        return true;
      };
    else
      setup.o.readOfficialArchive = async () => {
        throw new Proxy(
          {},
          {
            getOwnPropertyDescriptor() {
              throw Error('PRIVATE_PROXY');
            },
          },
        );
      };
    const core = createPlatformToolsProvisioner(setup.o);
    try {
      const r = await core.run(setup.grant, 0);
      assert.equal(r.ok, false);
      assert.equal(JSON.stringify(r).includes('PRIVATE'), false);
      if (mode === 'owner') {
        assert.equal(r.code, 'OWNER_REVOKED');
        assert.deepEqual(readdirSync(f.root), ['.test-owner']);
      } else assert.equal(r.code, 'DOWNLOAD_FAILED');
    } finally {
      await core.close();
      f.cleanup();
    }
  }
});
test('close tracks the actual status filesystem lane rather than falsely returning retired', async () => {
  const fixture = syntheticArchive(),
    m = await fixtureModules(fixture),
    f = owned(),
    setup = options(f, fixture.bytes),
    core = m.core.createPlatformToolsProvisioner(setup.o),
    original = fsPromises.lstat;
  let release, started;
  const entered = new Promise((r) => {
      started = r;
    }),
    held = new Promise((r) => {
      release = r;
    });
  try {
    fsPromises.lstat = async (file, ...args) => {
      if (file === join(f.root, 'platform-tools-runtime')) {
        started();
        await held;
      }
      return original(file, ...args);
    };
    syncBuiltinESMExports();
    const pending = core.status();
    await entered;
    let done = false;
    const closing = core.close().then((r) => {
      done = true;
      return r;
    });
    await Promise.resolve();
    assert.equal(done, false);
    assert.equal(core.retired, false);
    release();
    await pending;
    assert.equal(await closing, 'RETIRED');
    assert.equal(core.retired, true);
  } finally {
    release?.();
    fsPromises.lstat = original;
    syncBuiltinESMExports();
    await core.close();
    f.cleanup();
  }
});

test('selected archive growth is capped at exact length plus one and cannot trigger unbounded readFile', async () => {
  const fixture = syntheticArchive(),
    m = await fixtureModules(fixture),
    f = owned(),
    file = join(f.root, 'recipient.zip');
  writeFileSync(file, fixture.bytes, { flag: 'wx' });
  const setup = options(f, fixture.bytes);
  setup.o.recipient.read = () => ({
    decisionId: '00000000-0000-4000-8000-000000000001',
    accepted: true,
    route: 'LOCAL_ARCHIVE',
    archivePath: file,
  });
  setup.o.recipient.isCurrent = () => true;
  const original = fsPromises.open,
    core = m.core.createPlatformToolsProvisioner(setup.o);
  let grew = false,
    maxRead = 0;
  try {
    fsPromises.open = async (name, ...args) => {
      const h = await original(name, ...args);
      if (name !== file) return h;
      return new Proxy(h, {
        get(target, key) {
          if (key === 'stat')
            return async () => {
              const before = await target.stat();
              if (!grew) {
                grew = true;
                await fsPromises.appendFile(file, Buffer.alloc(100));
              }
              return before;
            };
          if (key === 'readFile')
            return () => {
              throw Error('UNBOUNDED_READ');
            };
          if (key === 'read')
            return async (...a) => {
              maxRead = Math.max(maxRead, a[2]);
              return target.read(...a);
            };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };
    syncBuiltinESMExports();
    const r = await core.run(setup.grant, 0);
    assert.equal(r.code, 'ARCHIVE_REJECTED');
    assert.equal(r.outcome, 'NOT_ACTIVATED');
    assert.ok(maxRead <= fixture.bytes.length + 1);
    assert.equal(grew, true);
  } finally {
    fsPromises.open = original;
    syncBuiltinESMExports();
    await core.close();
    f.cleanup();
  }
});
test('actual partial runtime copy/open/sync/close failures stay unsettled and never overwrite on retry', async () => {
  const fixture = syntheticArchive(),
    m = await fixtureModules(fixture);
  for (const fault of ['open', 'writeFile', 'sync', 'close']) {
    const f = owned(),
      setup = options(f, fixture.bytes),
      core = m.core.createPlatformToolsProvisioner(setup.o),
      original = fsPromises.open;
    let injected = false;
    try {
      fsPromises.open = async (name, ...args) => {
        const target =
          typeof name === 'string' &&
          name.includes('runtime-' + fixture.candidate.archive.sha256) &&
          name.endsWith('adb.exe') &&
          args[0] === 'wx';
        if (target && fault === 'open') {
          injected = true;
          throw Object.assign(Error('PRIVATE_ENOSPC'), { code: 'ENOSPC' });
        }
        const h = await original(name, ...args);
        if (!target) return h;
        return new Proxy(h, {
          get(object, key) {
            if (key === fault)
              return async (...a) => {
                injected = true;
                if (key === 'writeFile') await object.writeFile(a[0].subarray(0, 2));
                if (key === 'close') await object.close();
                throw Error('PRIVATE_FAULT');
              };
            const value = Reflect.get(object, key);
            return typeof value === 'function' ? value.bind(object) : value;
          },
        });
      };
      syncBuiltinESMExports();
      const r = await core.run(setup.grant, 0);
      assert.equal(injected, true);
      assert.equal(r.outcome, 'OUTCOME_UNKNOWN');
      assert.equal(JSON.stringify(r).includes('PRIVATE'), false);
      assert.equal((await core.run(setup.grant, 0)).code, 'RECOVERY_REQUIRED');
      assert.equal(
        readdirSync(join(f.root, 'platform-tools-runtime', 'operations')).filter((x) =>
          x.endsWith('.settled.json'),
        ).length,
        0,
      );
    } finally {
      fsPromises.open = original;
      syncBuiltinESMExports();
      await core.close();
      f.cleanup();
    }
  }
});
test('bounded close returns UNRETIRED without abandoning active work; late completion does not retroactively certify it', async () => {
  const fixture = syntheticArchive(),
    timerUrl = dataUrl(
      'const timers=new Map();let id=0;export function setTimeout(fn,ms){if(ms!==120000)throw Error("BOUND");const n=++id;timers.set(n,fn);return n;}export function clearTimeout(n){timers.delete(n);}export function fire(){for(const fn of [...timers.values()])fn();}',
    ),
    timers = await import(timerUrl),
    m = await fixtureModules(fixture, fixture.bytes, timerUrl),
    f = owned();
  let release, entered;
  const started = new Promise((r) => {
      entered = r;
    }),
    held = new Promise((r) => {
      release = r;
    }),
    setup = options(f, fixture.bytes, {
      readOfficialArchive: async () => {
        entered();
        return held;
      },
    }),
    core = m.core.createPlatformToolsProvisioner(setup.o);
  try {
    const run = core.run(setup.grant, 0);
    await started;
    const closing = core.close();
    timers.fire();
    assert.equal((await run).outcome, 'OUTCOME_UNKNOWN');
    assert.equal(await closing, 'UNRETIRED');
    assert.equal(core.retired, false);
    release(fixture.bytes);
    await new Promise(setImmediate);
    assert.equal(core.retired, true);
    assert.equal(await core.close(), 'UNRETIRED');
  } finally {
    release?.(fixture.bytes);
    await core.close();
    f.cleanup();
  }
});

// Two synthetic builds exercise the actual owned-file coordinator, not a ledger-only rollback.
async function retainedPair() {
  const a = syntheticArchive('36.0.0', 1),
    b = syntheticArchive('37.0.1', 2);
  const ma = await fixtureModules(a),
    mb = await fixtureModules(b, b.bytes, null, [a, b]);
  const f = owned(),
    storeId = randomUUID();
  function create(module, bytes, kind = 'INSTALL', patch = {}) {
    const setup = options(f, bytes, { storeId, ...patch });
    if (kind === 'ROLLBACK') {
      const original = setup.o.recipient.read;
      setup.o.recipient.read = (g) => {
        const d = original(g);
        return d && { ...d, route: 'RETAINED_RUNTIME' };
      };
    }
    return { ...setup, core: module.core.createPlatformToolsProvisioner(setup.o) };
  }
  const first = create(ma, a.bytes);
  assert.equal((await first.core.run(first.grant, 0)).ok, true);
  await first.core.close();
  const second = create(mb, b.bytes);
  assert.equal((await second.core.run(second.grant, 1)).ok, true);
  await second.core.close();
  return { a, b, ma, mb, f, create };
}
function treeHashes(root) {
  const out = {};
  function walk(dir, prefix = '') {
    for (const name of readdirSync(dir).sort()) {
      const rel = prefix + name,
        p = join(dir, name),
        s = lstatSync(p);
      if (s.isDirectory()) {
        out[rel + '/'] = 'DIR';
        walk(p, rel + '/');
      } else out[rel] = sha(readFileSync(p));
    }
  }
  walk(root);
  return out;
}
test('actual owned two-synthetic-build A→B→A rollback and reopen retain both inventories and immutable history', async () => {
  const p = await retainedPair(),
    runtimeRoot = join(p.f.root, 'platform-tools-runtime', 'runtimes');
  const before = treeHashes(runtimeRoot),
    rollback = p.create(p.mb, null, 'ROLLBACK', {
      readOfficialArchive: () => {
        throw Error('rollback must never download');
      },
    });
  try {
    const status = await rollback.core.status();
    assert.equal(status.activeVersion, '37.0.1');
    assert.equal(status.previousVersion, '36.0.0');
    assert.equal(status.rollbackAvailable, true);
    const result = await rollback.core.run(rollback.grant, 2, 'ROLLBACK');
    assert.equal(result.ok, true);
    assert.equal(result.revision, 3);
    assert.equal(result.archiveSha256, p.a.candidate.archive.sha256);
    assert.deepEqual(treeHashes(runtimeRoot), before);
    await rollback.core.close();
    const reopened = p.create(p.mb, null);
    const observed = await reopened.core.status();
    assert.equal(observed.activeVersion, '36.0.0');
    assert.equal(observed.previousVersion, '37.0.1');
    assert.equal(observed.revision, 3);
    assert.equal(observed.rollbackAvailable, true);
    await reopened.core.close();
    const custody = p.mb.custody.createPlatformToolsRuntimeCustody(reopened.o);
    const read = await custody.acquireRead();
    assert.equal(read.ok, true);
    assert.equal(read.observation.release, '36.0.0');
    assert.equal(read.observation.installationRevision, 3);
    assert.equal(read.observation.archiveSha256, p.a.candidate.archive.sha256);
    assert.equal(read.observation.manifestSha256, sha(JSON.stringify(p.a.candidate)));
    assert.equal(
      read.observation.adbPath,
      join(runtimeRoot, 'runtime-' + p.a.candidate.archive.sha256, 'adb.exe'),
    );
    assert.equal((await custody.releaseRead(read.token)).status, 'RETIRED');
    assert.equal(await custody.close(), 'RETIRED');
    const records = readdirSync(join(p.f.root, 'platform-tools-runtime', 'operations'));
    assert.equal(records.length, 6);
    const rollbackIntent = records
      .filter((x) => x.endsWith('.intent.json'))
      .map((x) =>
        JSON.parse(readFileSync(join(p.f.root, 'platform-tools-runtime', 'operations', x), 'utf8')),
      )
      .find((x) => x.kind === 'ROLLBACK');
    assert.equal(rollbackIntent.archiveSha256, p.a.candidate.archive.sha256);
  } finally {
    await rollback.core.close();
    p.f.cleanup();
  }
});
test('actual prior missing/tampered, stale CAS, BUSY and revoked grant refuse rollback without new records', async () => {
  for (const mode of ['missing', 'tampered', 'stale', 'busy', 'revoked']) {
    const p = await retainedPair(),
      root = join(p.f.root, 'platform-tools-runtime');
    const rollback = p.create(
      p.mb,
      null,
      'ROLLBACK',
      mode === 'busy'
        ? {
            assertIdleSync() {
              throw Error('held read');
            },
          }
        : {},
    );
    try {
      const file = join(root, 'runtimes', 'runtime-' + p.a.candidate.archive.sha256, 'NOTICE.txt');
      if (mode === 'missing') rmSync(file);
      if (mode === 'tampered') writeFileSync(file, Buffer.alloc(32, 9));
      if (mode === 'revoked') rollback.revoke();
      const before = treeHashes(root);
      const result = await rollback.core.run(rollback.grant, mode === 'stale' ? 1 : 2, 'ROLLBACK');
      assert.equal(result.ok, false);
      assert.equal(result.outcome, 'NOT_ACTIVATED');
      assert.deepEqual(treeHashes(root), before);
    } finally {
      await rollback.core.close();
      p.f.cleanup();
    }
  }
});
test('historical known metadata survives policy revocation; active launch and new activation eligibility are independent', async () => {
  const p = await retainedPair();
  try {
    const revokedPrior = await fixtureModules(p.b, p.b.bytes, null, [
      { ...p.a, activationAllowed: false, launchAllowed: false },
      p.b,
    ]);
    const refused = p.create(revokedPrior, null, 'ROLLBACK');
    assert.equal((await refused.core.status()).status, 'VERIFIED_LOCAL');
    assert.equal((await refused.core.status()).rollbackAvailable, false);
    assert.equal((await refused.core.run(refused.grant, 2, 'ROLLBACK')).code, 'RECOVERY_REQUIRED');
    await refused.core.close();
    const launchOnly = await fixtureModules(p.a, p.a.bytes, null, [
      p.a,
      { ...p.b, activationAllowed: false, launchAllowed: true },
    ]);
    const usable = p.create(launchOnly, null);
    assert.equal((await usable.core.status()).status, 'VERIFIED_LOCAL');
    await usable.core.close();
    const denied = await fixtureModules(p.a, p.a.bytes, null, [
      p.a,
      { ...p.b, activationAllowed: false, launchAllowed: false },
    ]);
    const repair = p.create(denied, p.a.bytes);
    assert.equal((await repair.core.status()).status, 'POLICY_DENIED');
    assert.equal((await repair.core.status()).rollbackAvailable, false);
    const repaired = await repair.core.run(repair.grant, 2);
    assert.equal(repaired.ok, true);
    assert.equal(repaired.archiveSha256, p.a.candidate.archive.sha256);
    assert.equal((await repair.core.status()).status, 'VERIFIED_LOCAL');
    await repair.core.close();
  } finally {
    p.f.cleanup();
  }
});

test('actual rollback settlement open/sync uncertainty retains evidence, forbids retry, and reopens only the actual written chain', async () => {
  for (const fault of ['open', 'sync']) {
    const p = await retainedPair(),
      root = join(p.f.root, 'platform-tools-runtime');
    const rollback = p.create(p.mb, null, 'ROLLBACK'),
      original = fsPromises.open;
    const before = treeHashes(join(root, 'runtimes'));
    let injected = false;
    try {
      fsPromises.open = async (file, flags, ...rest) => {
        if (String(file).endsWith('.settled.json') && flags === 'wx' && !injected) {
          injected = true;
          if (fault === 'open') throw Error('private failure');
          const handle = await original(file, flags, ...rest);
          return new Proxy(handle, {
            get(target, key) {
              if (key === 'sync')
                return async () => {
                  throw Error('private sync failure');
                };
              const value = Reflect.get(target, key);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
        }
        return original(file, flags, ...rest);
      };
      syncBuiltinESMExports();
      const result = await rollback.core.run(rollback.grant, 2, 'ROLLBACK');
      assert.equal(injected, true);
      assert.equal(result.outcome, 'OUTCOME_UNKNOWN');
      assert.equal(result.code, 'OUTCOME_UNKNOWN');
      const frozen = treeHashes(root);
      assert.equal(
        (await rollback.core.run(rollback.grant, 2, 'ROLLBACK')).code,
        'RECOVERY_REQUIRED',
      );
      assert.deepEqual(treeHashes(root), frozen);
      assert.deepEqual(treeHashes(join(root, 'runtimes')), before);
      fsPromises.open = original;
      syncBuiltinESMExports();
      await rollback.core.close();
      const reopened = p.create(p.mb, null),
        status = await reopened.core.status();
      assert.equal(status.status, fault === 'open' ? 'RECOVERY_REQUIRED' : 'VERIFIED_LOCAL');
      if (fault === 'sync') assert.equal(status.activeVersion, '36.0.0');
      await reopened.core.close();
    } finally {
      fsPromises.open = original;
      syncBuiltinESMExports();
      await rollback.core.close();
      p.f.cleanup();
    }
  }
});

test('catalog handles cannot be forged and a final operation-id callback revocation creates no rollback intent', async () => {
  const p = await retainedPair();
  try {
    assert.throws(
      () =>
        p.mb.archive.snapshotPlatformToolsArchive(p.b.bytes, {
          ...p.mb.catalog.PLATFORM_TOOLS_INSTALL_TARGET,
        }),
      /ARCHIVE_REJECTED/,
    );
    const rollback = p.create(p.mb, null, 'ROLLBACK', {
      newId() {
        rollback.revoke();
        return randomUUID();
      },
    });
    const before = treeHashes(join(p.f.root, 'platform-tools-runtime'));
    assert.equal((await rollback.core.run(rollback.grant, 2, 'ROLLBACK')).code, 'TERMS_REQUIRED');
    assert.deepEqual(treeHashes(join(p.f.root, 'platform-tools-runtime')), before);
    await rollback.core.close();
  } finally {
    p.f.cleanup();
  }
});

test('known five-stage capacity refuses INSTALL before intent; record-only rollback still succeeds', async () => {
  const p = await retainedPair();
  try {
    const targetA = await fixtureModules(p.a, p.a.bytes, null, [p.a, p.b]);
    for (const [module, bytes, revision] of [
      [targetA, p.a.bytes, 2],
      [p.mb, p.b.bytes, 3],
      [targetA, p.a.bytes, 4],
    ]) {
      const next = p.create(module, bytes);
      assert.equal((await next.core.run(next.grant, revision)).ok, true);
      await next.core.close();
    }
    const root = join(p.f.root, 'platform-tools-runtime'),
      before = treeHashes(root);
    assert.equal(readdirSync(join(root, 'staging')).length, 5);
    const blocked = p.create(p.mb, p.b.bytes, 'INSTALL', {
      readOfficialArchive: () => {
        throw Error('must not fetch');
      },
    });
    const result = await blocked.core.run(blocked.grant, 5);
    assert.equal(result.code, 'LIMIT_EXCEEDED');
    assert.equal(result.outcome, 'NOT_ACTIVATED');
    assert.deepEqual(treeHashes(root), before);
    await blocked.core.close();
    const rollback = p.create(p.mb, null, 'ROLLBACK');
    assert.equal((await rollback.core.run(rollback.grant, 5, 'ROLLBACK')).ok, true);
    assert.equal(readdirSync(join(root, 'staging')).length, 5);
    await rollback.core.close();
  } finally {
    p.f.cleanup();
  }
});

test('known aggregate archive/extraction capacity refuses before intent or download', async () => {
  const a = syntheticArchive('36.0.0', 1),
    b = syntheticArchive('37.0.1', 2),
    f = owned();
  const target = {
    ...b,
    candidate: { ...b.candidate, archive: { ...b.candidate.archive, bytes: 128 * 1024 * 1024 } },
  };
  const module = await fixtureModules(target, target.bytes, null, [a, target]);
  let downloads = 0;
  const setup = options(f, null, {
    readOfficialArchive: () => {
      downloads++;
      throw Error('must not fetch');
    },
  });
  const core = module.core.createPlatformToolsProvisioner(setup.o);
  try {
    const result = await core.run(setup.grant, 0);
    assert.equal(result.code, 'LIMIT_EXCEEDED');
    assert.equal(result.outcome, 'NOT_ACTIVATED');
    assert.equal(downloads, 0);
    const root = join(f.root, 'platform-tools-runtime');
    assert.deepEqual(readdirSync(join(root, 'operations')), []);
    assert.deepEqual(readdirSync(join(root, 'staging')), []);
    assert.deepEqual(readdirSync(join(root, 'runtimes')), []);
  } finally {
    await core.close();
    f.cleanup();
  }
});
