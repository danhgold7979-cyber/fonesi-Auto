// Test-only owned synthetic bytes; real service/core/ledger/files, no executable/network activity.
import assert from 'node:assert/strict';
import {
  readFileSync,
  mkdtempSync,
  writeFileSync,
  realpathSync,
  lstatSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { transformSync } from 'esbuild';
import { PLATFORM_TOOLS_CANDIDATE } from '../src/main/platform-tools-candidate.ts';
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
      '; export const PLATFORM_TOOLS_PRIOR_36_CANDIDATE = PLATFORM_TOOLS_CANDIDATE;',
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
    if (name === 'platform-tools-catalog') {
      const start = s.indexOf('const KNOWN:'),
        end = s.indexOf('const INSTALL_TARGET_SHA256');
      assert.ok(start > 0 && end > start);
      const rows = known
        ? JSON.stringify(
            known.map((x) => ({
              candidate: x.candidate,
              activationAllowed: x.activationAllowed ?? true,
              launchAllowed: x.launchAllowed ?? true,
            })),
          )
        : '[{candidate:PLATFORM_TOOLS_CANDIDATE,activationAllowed:true,launchAllowed:true}]';
      s = s.slice(0, start) + 'const KNOWN = ' + rows + ';\n' + s.slice(end);
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
  const serviceUrl = compile('platform-tools-setup-service', {
    './platform-tools-provisioner.ts': coreUrl,
    './platform-tools-runtime-custody.ts': custodyUrl,
    './platform-tools-catalog.ts': catalogUrl,
    './platform-tools-download.ts': new URL(
      '../src/main/platform-tools-download.ts',
      import.meta.url,
    ).href,
    './platform-tools-setup-native.ts': new URL(
      '../src/main/platform-tools-setup-native.ts',
      import.meta.url,
    ).href,
    '../platform-tools-setup-contract.ts': new URL(
      '../src/platform-tools-setup-contract.ts',
      import.meta.url,
    ).href,
    '../platform-tools-setup-audit-contract.ts': new URL(
      '../src/platform-tools-setup-audit-contract.ts',
      import.meta.url,
    ).href,
  });
  return {
    service: await import(serviceUrl),
    custody: await import(custodyUrl),
    catalog: await import(catalogUrl),
    archive: await import(archiveUrl),
    files: await import(filesUrl),
    core: await import(coreUrl),
  };
}

export async function setupObservation() {
  const root = mkdtempSync(
      join(realpathSync(new URL('../.test-output', import.meta.url)), 'rollback-service-'),
    ),
    token = randomUUID();
  writeFileSync(join(root, '.test-owner'), token, { flag: 'wx' });
  const owned = () => {
    assert.equal(realpathSync(root), root);
    assert.equal(readFileSync(join(root, '.test-owner'), 'utf8'), token);
  };
  const f = syntheticArchive('36.0.0'),
    modules = await fixtureModules(f),
    events = [];
  const custody = modules.custody.createPlatformToolsRuntimeCustody({
    dataRoot: root,
    storeId: token,
    assertOwnedSync: owned,
    assertDataLocation: (p) => assert.equal(p, root),
  });
  const service = modules.service.createPlatformToolsSetupService({
    dataRoot: root,
    storeId: token,
    assertOwnedSync: owned,
    assertDataLocation: (p) => assert.equal(p, root),
    custody,
    clock: () => Date.now(),
    newId: () => randomUUID(),
    audit: async (e) => {
      events.push(e);
      return 'AVAILABLE';
    },
    readOfficialArchive: async () => f.bytes,
    native: {
      async interact(current, selection, selected) {
        current();
        assert.equal(selection.installTargetVersion, '36.0.0');
        selected('INSTALL');
        return { ok: true, kind: 'INSTALL', route: 'OFFICIAL_DOWNLOAD', archivePath: null };
      },
    },
  });
  await service.initialize();
  let id = 0;
  const call = async (method, expectedRevision) =>
    JSON.parse(
      await service.execute(
        {
          version: 2,
          requestId: 'p' + ++id,
          method,
          ...(method === 'platformTools.get' ? {} : { expectedRevision }),
        },
        () => true,
      ),
    );
  const hydrated = await call('platformTools.get'),
    initial = await call('platformTools.get'),
    pending = await call('platformTools.setup.request', initial.snapshot.revision);
  const stop = Date.now() + 5000;
  while (!service.retired) {
    assert.ok(Date.now() < stop, 'service retirement deadline');
    await new Promise((r) => setImmediate(r));
  }
  const terminal = await call('platformTools.get');
  assert.equal(terminal.snapshot.state, 'VERIFIED_LOCAL');
  return {
    hydrated,
    initial,
    pending,
    terminal,
    events,
    async reopen() {
      assert.equal(await service.shutdown(), 'RETIRED');
      assert.equal(await custody.close(), 'RETIRED');
      const nextCustody = modules.custody.createPlatformToolsRuntimeCustody({
        dataRoot: root,
        storeId: token,
        assertOwnedSync: owned,
        assertDataLocation: (p) => assert.equal(p, root),
      });
      const next = modules.service.createPlatformToolsSetupService({
        dataRoot: root,
        storeId: token,
        assertOwnedSync: owned,
        assertDataLocation: (p) => assert.equal(p, root),
        custody: nextCustody,
        clock: () => Date.now(),
        newId: () => randomUUID(),
        audit: async () => 'AVAILABLE',
        readOfficialArchive: async () => {
          throw Error('NO_REOPEN_DOWNLOAD');
        },
        native: {
          async interact() {
            throw Error('NO_REOPEN_DIALOG');
          },
        },
      });
      try {
        await next.initialize();
        return JSON.parse(
          await next.execute(
            { version: 2, requestId: 'p1', method: 'platformTools.get' },
            () => true,
          ),
        );
      } finally {
        assert.equal(await next.shutdown(), 'RETIRED');
        assert.equal(await nextCustody.close(), 'RETIRED');
      }
    },
    async cleanup() {
      assert.equal(await service.shutdown(), 'RETIRED');
      assert.equal(await custody.close(), 'RETIRED');
      owned();
      let n = 0;
      function check(dir) {
        for (const name of readdirSync(dir)) {
          const file = join(dir, name),
            s = lstatSync(file);
          assert.ok(++n <= 256);
          assert.equal(s.isSymbolicLink(), false);
          if (s.isDirectory()) check(file);
          else {
            assert.equal(s.nlink, 1);
            assert.ok(s.size <= 65536);
          }
        }
      }
      check(root);
      rmSync(root, { recursive: true, force: false });
    },
  };
}
// Actual runtime service with synthetic native/custody facts; no host factory or process runs.
export async function runtimeObservation() {
  const { createRuntimeVersionService } = await import('../src/main/runtime-version-service.ts');
  const events = [],
    tokens = new Set();
  let closed = false;
  const service = createRuntimeVersionService({
    custody: {
      async acquireRead() {
        const token = Object.freeze({});
        tokens.add(token);
        return { ok: true, token, observation: { installationRevision: 1, release: '36.0.0' } };
      },
      assertRead(token) {
        assert.ok(tokens.has(token));
      },
      async releaseRead(token) {
        assert.ok(tokens.has(token));
        tokens.delete(token);
        return { ok: true, status: 'RETIRED' };
      },
    },
    assertOwnedSync() {},
    inspectContext: () => null,
    clock: () => 1000,
    newId: () => randomUUID(),
    audit: async (e) => {
      events.push(e);
      return 'AVAILABLE';
    },
    createFactory() {
      return {
        grant(_owner, admit) {
          admit();
          return {};
        },
        async execute() {
          return { outcome: 'OBSERVED', code: 'OK' };
        },
        async close() {
          closed = true;
          return 'RETIRED';
        },
        get retired() {
          return closed;
        },
        get evidence() {
          return { directoryCleanup: closed };
        },
      };
    },
  });
  let id = 0;
  const call = async (method, expectedRevision) =>
    JSON.parse(
      await service.execute(
        {
          version: 2,
          requestId: 'p' + ++id,
          method,
          ...(method === 'runtimeVersion.get'
            ? {}
            : { expectedRevision, expectedInstallationRevision: 1 }),
        },
        () => true,
      ),
    );
  const initial = await call('runtimeVersion.get'),
    pending = await call('runtimeVersion.request', initial.snapshot.revision);
  const stop = Date.now() + 2000;
  while (!service.retired) {
    assert.ok(Date.now() < stop);
    await new Promise((r) => setImmediate(r));
  }
  const terminal = await call('runtimeVersion.get');
  assert.equal(terminal.snapshot.state, 'VERIFIED');
  return {
    initial,
    pending,
    terminal,
    events,
    async cleanup() {
      assert.equal(await service.shutdown(), 'RETIRED');
      assert.equal(tokens.size, 0);
    },
  };
}
