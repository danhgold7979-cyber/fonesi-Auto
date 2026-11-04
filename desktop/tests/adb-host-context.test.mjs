import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createHostRoot,
  cleanupHostRoot,
  snapshotHostVideoArtifact,
  validateHostVideoJournal,
} from '../src/main/adb-host-context.ts';
function fixture(t) {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'hv-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const owner = randomUUID(),
    sessionId = randomUUID();
  const owned = createHostRoot(base, sessionId, owner, () => {});
  const artifact = {
    artifactId: 'a'.repeat(64),
    relativePath: 'video/server.jar',
    bytes: 123,
    sha256: 'a'.repeat(64),
    protocolId: 'AUTO_SCRCPY_5_0_1_VIDEO_NONCE_V1',
    pairManifestSha256: 'b'.repeat(64),
  };
  const b = {
    version: 3,
    operationSet: 'SERVER_ONLY',
    launchId: randomUUID(),
    storeId: randomUUID(),
    ownerToken: owner,
    sessionId,
    installationRevision: 1,
    videoArtifact: artifact,
  };
  const bootstrap = JSON.stringify(b),
    file = (n) => path.join(owned.root, n),
    put = (n, v) => fs.writeFileSync(file(n), JSON.stringify(v));
  fs.writeFileSync(file('bootstrap.json'), bootstrap);
  const common = {
    version: 1,
    launchId: b.launchId,
    storeId: b.storeId,
    ownerToken: owner,
    hostSessionId: sessionId,
    attemptId: randomUUID(),
    videoId: randomUUID(),
    transportId: '1',
    hostEpoch: 1,
    installationRevision: 1,
    artifactSha256: artifact.sha256,
    protocolId: artifact.protocolId,
  };
  const intent = {
    ...common,
    remoteDirectory: `/data/local/tmp/fonesi-video-${common.videoId}`,
    scid: 1,
    nonceSha256: 'c'.repeat(64),
    admittedUtc: 1000,
    deadlineUtc: 31000,
  };
  const settlement = {
    ...common,
    directory: 'CREATED',
    upload: 'VERIFIED',
    launch: 'EXITED',
    localRetired: true,
    cleanup: 'CLEANED',
    streamObserved: true,
    code: 'CLOSED',
  };
  put('video-intent.json', intent);
  put('video-settlement.json', settlement);
  return { owned, bootstrap, artifact, put, file, intent, settlement };
}
test('video metadata parser is structural only, frozen and rejects getters or arbitrary assets', () => {
  const value = {
    artifactId: 'a'.repeat(64),
    relativePath: 'video/server.jar',
    bytes: 8388608,
    sha256: 'a'.repeat(64),
    protocolId: 'AUTO_SCRCPY_5_0_1_VIDEO_NONCE_V1',
    pairManifestSha256: 'b'.repeat(64),
  };
  assert.ok(Object.isFrozen(snapshotHostVideoArtifact(value)));
  for (const patch of [
    { bytes: 8388609 },
    { relativePath: 'elsewhere.jar' },
    { artifactId: 'a'.repeat(64) + '\n' },
    { sha256: 'b'.repeat(64) },
    { extra: true },
  ])
    assert.equal(snapshotHostVideoArtifact({ ...value, ...patch }), null);
  let called = 0;
  Object.defineProperty(value, 'bytes', {
    get() {
      called++;
      return 10;
    },
  });
  assert.equal(snapshotHostVideoArtifact(value), null);
  assert.equal(called, 0);
});
test('actual owned cleanup deletes only known clean video journal; partial or uncertain evidence survives', (t) => {
  for (const mode of ['clean', 'missing', 'uncertain', 'exit', 'mismatch', 'duplicate']) {
    const f = fixture(t);
    if (mode === 'missing') fs.unlinkSync(f.file('video-settlement.json'));
    if (mode === 'uncertain')
      f.put('video-settlement.json', {
        ...f.settlement,
        cleanup: 'UNKNOWN',
        code: 'OUTCOME_UNKNOWN',
      });
    if (mode === 'exit')
      f.put('video-settlement.json', { ...f.settlement, launch: 'STARTED', cleanup: 'PENDING' });
    if (mode === 'mismatch')
      f.put('video-settlement.json', { ...f.settlement, videoId: randomUUID() });
    if (mode === 'duplicate')
      fs.writeFileSync(
        f.file('video-intent.json'),
        JSON.stringify(f.intent).replace('"version":1', '"version":1,"version":1'),
      );
    if (mode === 'clean') {
      validateHostVideoJournal(f.owned.root, f.bootstrap, true);
      cleanupHostRoot(f.owned, f.bootstrap, () => {});
      assert.equal(fs.existsSync(f.owned.root), false);
    } else {
      assert.throws(() => cleanupHostRoot(f.owned, f.bootstrap, () => {}));
      assert.equal(fs.existsSync(f.file('.owner')), true);
      assert.equal(fs.existsSync(f.file('video-intent.json')), true);
    }
  }
});
test('final cleanup callback cannot replace clean settlement and cause any deletion', (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.file('profile/retained.txt'), 'retain');
  let once = false;
  assert.throws(() =>
    cleanupHostRoot(f.owned, f.bootstrap, () => {
      if (!once) {
        once = true;
        f.put('video-settlement.json', {
          ...f.settlement,
          localRetired: false,
          code: 'OUTCOME_UNKNOWN',
        });
      }
    }),
  );
  assert.equal(fs.readFileSync(f.file('profile/retained.txt'), 'utf8'), 'retain');
  assert.equal(fs.existsSync(f.file('.owner')), true);
});

test('production absent pair never mints a handle; actual transformed build fixture binds bytes and refuses tamper', async (t) => {
  const context = await import('../src/main/adb-host-context.ts');
  assert.equal(context.openHostVideoArtifact('/not-an-authorized-root'), null);
  assert.equal(context.inspectHostVideoArtifact(Object.freeze({ videoArtifact: true })), null);
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'pair-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'video'));
  fs.mkdirSync(path.join(root, 'native'));
  const put = (name, value) =>
    fs.writeFileSync(
      path.join(root, name),
      typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value),
    );
  const sha = (value) =>
    context.hostHash(
      typeof value === 'object' && !Buffer.isBuffer(value) ? JSON.stringify(value) : value,
    );
  const sources = {};
  for (const name of context.HOST_VIDEO_NATIVE_SOURCES) {
    const raw = `SYNTHETIC_SOURCE_ONLY ${name}`;
    put(name, raw);
    sources[name] = sha(raw);
  }
  const dll = Buffer.alloc(128);
  dll.writeUInt16LE(0x5a4d, 0);
  dll.writeUInt32LE(64, 60);
  dll.writeUInt32LE(0x4550, 64);
  dll.writeUInt16LE(0x8664, 68);
  dll.writeUInt16LE(0x20b, 88);
  put('native/RetainedVideoConsumer.dll', dll);
  const server = Buffer.from('SYNTHETIC_NOT_EXECUTABLE');
  put('video/server.jar', server);
  const build = {
    version: 1,
    sourceCommit: 'a'.repeat(40),
    compilerSha256: 'b'.repeat(64),
    compilerVersion: '1.2.3',
    arguments: ['/nologo', '/target:library', '/platform:x64', '/optimize+'],
    frameworkReferences: { 'System.dll': 'c'.repeat(64), 'System.Core.dll': 'd'.repeat(64) },
    sources,
    consumerSha256: sha(dll),
  };
  const serverBuild = {
    version: 1,
    upstreamCommit: 'a60891aea193d92e7e5c3942700eca63f9d19a5f',
    sourcePatchSha256: 'e'.repeat(64),
    toolchainManifestSha256: 'f'.repeat(64),
    dependenciesManifestSha256: '1'.repeat(64),
    buildCommandSha256: '2'.repeat(64),
    serverBytes: server.length,
    serverSha256: sha(server),
    protocolId: context.HOST_VIDEO_PROTOCOL,
  };
  put('video/consumer-build.json', build);
  put('video/server-build.json', serverBuild);
  const pair = {
    version: 1,
    serverVersion: '5.0.1',
    serverBytes: server.length,
    serverSha256: sha(server),
    protocolId: context.HOST_VIDEO_PROTOCOL,
    consumerBytes: dll.length,
    consumerWindowsArtifactSha256: sha(dll),
    consumerBuildManifestSha256: sha(build),
    serverBuildManifestSha256: sha(serverBuild),
    architecture: 'AMD64',
  };
  put('video/pair.json', pair);
  const { transformSync } = await import('esbuild');
  let source = fs.readFileSync(new URL('../src/main/adb-host-context.ts', import.meta.url), 'utf8');
  const pin = 'const REVIEWED_VIDEO_PAIR: Readonly<{ manifestSha256: string }> | null = null;';
  assert.equal(source.split(pin).length, 2);
  source = source.replace(
    pin,
    `const REVIEWED_VIDEO_PAIR = Object.freeze({manifestSha256:'${sha(pair)}'});`,
  );
  source = source.replace(
    "'./persistence-entry.ts'",
    JSON.stringify(new URL('../src/main/persistence-entry.ts', import.meta.url).href),
  );
  const synthetic = await import(
    `data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')}`
  );
  const token = synthetic.openHostVideoArtifact(root);
  assert.ok(token);
  const record = synthetic.inspectHostVideoArtifact(token);
  assert.equal(record.finalCurrent(), true);
  assert.equal(record.record.sha256, sha(server));
  put('video/server.jar', 'CHANGED');
  assert.equal(record.finalCurrent(), false);
  synthetic.releaseHostVideoArtifact(token);
  assert.equal(synthetic.inspectHostVideoArtifact(token), null);
  assert.throws(() => synthetic.openHostVideoArtifact(root));
  put('video/server.jar', server);
  put('native/RetainedVideoConsumer.dll', Buffer.alloc(128));
  assert.throws(() => synthetic.openHostVideoArtifact(root));
  put('native/RetainedVideoConsumer.dll', dll);
  put('native/RetainedVideoSession.cs', 'changed-source');
  assert.throws(() => synthetic.openHostVideoArtifact(root));
});

test('bootstrap video path loads only pinned captured DLL bytes and never falls back to compiler', () => {
  const ps = fs.readFileSync(new URL('../launch/Invoke-RetainedHost.ps1', import.meta.url), 'utf8');
  assert.match(ps, /\$ReviewedVideoPairSha256=\$null/);
  assert.match(ps, /if\(\$null -eq \$ReviewedVideoPairSha256\)\{Reject\}/);
  assert.match(
    ps,
    /if\(\$null -ne \$videoDll\)\{\[void\]\[Reflection.Assembly\]::Load\(\[byte\[\]\]\$videoDll\)\}else\{Add-Type/,
  );
  assert.ok(
    ps.indexOf('$videoDll=Video-Pair $b $desktop') < ps.indexOf('[Reflection.Assembly]::Load'),
  );
  assert.ok(ps.indexOf('$provider.ConfigureVideo(') < ps.indexOf('RetainedAdbProtocol]::Run('));
  assert.doesNotMatch(ps, /AssemblyResolve|LoadFrom\(/);
  assert.match(ps, /if\(\$b.version -eq 3\)\{\$names\+=,'native\/RetainedVideoSession.cs'\}/);
});
