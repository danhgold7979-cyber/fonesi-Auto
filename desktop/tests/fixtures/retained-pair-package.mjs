// Explicit synthetic pair/notice approval. Never a binary or license provenance claim.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const sha = (raw) => createHash('sha256').update(raw).digest('hex');
export const APPROVED_SOURCE_SEAM = `const RETAINED_PAIR_APPROVAL = {
  pairManifestSha256: '934a9ff34a1b868fa56ddfc8a57d4eaba64d9d6305b6da05839566b90b366437',
  noticeManifestSha256: '305698d5f4623d7572c1c46a515a17d0984b35d26a82ae743ebeb71a04a0ebf6',
  evidenceManifestSha256: '7bd7125bf8f427cd10a2371f6a435b82c410bd4a0163b5626750049a7aa2a043',
};`;
export function loadApprovedAdmission(approval) {
  let source = fs.readFileSync(path.join(desktop, 'launch/package-admission.cjs'), 'utf8');
  const seam = APPROVED_SOURCE_SEAM;
  if (source.split(seam).length !== 2) throw Error('SYNTHETIC_APPROVAL_SEAM_CHANGED');
  source = source.replace(seam, `const RETAINED_PAIR_APPROVAL = ${JSON.stringify(approval)};`);
  const module = { exports: {} };
  runInNewContext(source, {
    module,
    exports: module.exports,
    require,
    Buffer,
    process: { argv: [], versions: {} },
  });
  return module.exports;
}
export function materializeRetainedPair(root) {
  const write = (name, raw) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, raw, { flag: 'wx' });
    return Buffer.from(raw);
  };
  const json = (name, value) => write(name, JSON.stringify(value));
  const h = 'a'.repeat(64),
    auto = 'a'.repeat(40),
    upstream = 'a60891aea193d92e7e5c3942700eca63f9d19a5f';
  const sourceNames = [
    'IsolatedAdbServer.cs',
    'RetainedAdbSession.cs',
    'RetainedAdbProtocol.cs',
    'RetainedHostAdmission.cs',
    'RetainedVideoSession.cs',
  ];
  const sources = {},
    effective = [];
  for (const name of sourceNames) {
    const raw = fs.readFileSync(path.join(desktop, 'native', name));
    write(`app/native/${name}`, raw);
    sources[`native/${name}`] = sha(raw);
    effective.push({
      namespace: 'CONSUMER',
      path: `native/${name}`,
      bytes: raw.length,
      sha256: sha(raw),
    });
  }
  effective.push({ namespace: 'SERVER', path: 'Synthetic.java', bytes: 1, sha256: h });
  const server = write('app/video/server.jar', 'SYNTHETIC-NOT-A-JAR');
  const dll = Buffer.alloc(128);
  dll.writeUInt16LE(0x5a4d, 0);
  dll.writeUInt32LE(64, 60);
  dll.writeUInt32LE(0x4550, 64);
  dll.writeUInt16LE(0x8664, 68);
  dll.writeUInt16LE(0x20b, 88);
  write('app/native/RetainedVideoConsumer.dll', dll);
  const ev = {};
  for (const [name, value] of Object.entries({
    'commands.json': { version: 1 },
    'dependencies.json': { version: 1 },
    'generated.json': { version: 1 },
    'outputs.json': { version: 1 },
    'report.json': { version: 1, passed: true },
    'source.json': { version: 1, effective },
    'tools.json': {
      version: 1,
      files: [{ namespace: 'BUILD_TOOLS36', path: 'lib/d8.jar', sha256: h }],
    },
  }))
    ev[name] = json(`app/video/evidence/${name}`, value);
  const sb = {
    version: 1,
    upstreamCommit: upstream,
    sourcePatchSha256: h,
    toolchainManifestSha256: sha(ev['tools.json']),
    dependenciesManifestSha256: sha(ev['dependencies.json']),
    buildCommandSha256: sha(ev['commands.json']),
    serverBytes: server.length,
    serverSha256: sha(server),
    protocolId: 'AUTO_SCRCPY_5_0_1_VIDEO_NONCE_V1',
  };
  const cb = {
    version: 1,
    sourceCommit: auto,
    compilerSha256: h,
    compilerVersion: '4.8.0.0',
    arguments: ['/nologo', '/target:library', '/platform:x64', '/optimize+'],
    frameworkReferences: { 'System.dll': h, 'System.Core.dll': h },
    sources,
    consumerSha256: sha(dll),
  };
  for (const [name, value] of [
    ['server-build.json', sb],
    ['consumer-build.json', cb],
  ]) {
    ev[name] = json(`app/video/evidence/${name}`, value);
    json(`app/video/${name}`, value);
  }
  const pair = {
    version: 1,
    serverVersion: '5.0.1',
    serverBytes: server.length,
    serverSha256: sha(server),
    protocolId: sb.protocolId,
    consumerBytes: dll.length,
    consumerWindowsArtifactSha256: sha(dll),
    consumerBuildManifestSha256: sha(ev['consumer-build.json']),
    serverBuildManifestSha256: sha(ev['server-build.json']),
    architecture: 'AMD64',
  };
  const pairRaw = json('app/video/pair.json', pair);
  const evidence = {
    version: 1,
    files: Object.keys(ev)
      .sort()
      .map((name) => ({ path: name, bytes: ev[name].length, sha256: sha(ev[name]) })),
  };
  const evidenceRaw = json('app/video/evidence-manifest.json', evidence);
  const texts = ['APACHE-2.0.txt', 'ATTRIBUTIONS.txt'].map((name) => ({
    name,
    raw: write(`app/video/notices/${name}`, 'SYNTHETIC NOTICE ONLY'),
  }));
  const components = [
    ['SERVER_UPSTREAM', 'COMPILED_CODE'],
    ['SERVER_AIDL', 'GENERATED_CODE'],
    ['SERVER_GENERATED', 'GENERATED_CODE'],
    ['AUTO_PATCH', 'FIRST_PARTY_MODIFICATION'],
    ['AUTO_CONSUMER', 'FIRST_PARTY_COMPILED_CODE'],
  ].map(([id, role], index) => ({
    id,
    role,
    origin: {
      sourceCommit: id === 'SERVER_GENERATED' ? null : id.startsWith('AUTO_') ? auto : upstream,
      sourceHashes: id === 'SERVER_GENERATED' ? [] : [{ path: 'SERVER/Synthetic.java', sha256: h }],
      toolHashes:
        id === 'SERVER_GENERATED' ? [{ path: 'BUILD_TOOLS36/lib/d8.jar', sha256: h }] : [],
    },
    // Synthetic policy tuple fixture, not a legal/provenance assertion.
    licenseEvidence: {
      kind:
        index < 2
          ? 'DECLARED_SOURCE_NOTICE'
          : index === 2
            ? 'SUPPLIED_TOOL_NOTICE'
            : 'OWNER_USE_STATEMENT',
      declaredLicense: index < 2 ? 'Apache-2.0' : null,
      applicability:
        index === 0
          ? 'SOURCE_DECLARED'
          : index < 3
            ? 'OUTPUT_APPLICABILITY_UNRESOLVED'
            : 'OWNER_INTERNAL_USE_NO_EXTERNAL_GRANT',
    },
    noticeFiles: ['ATTRIBUTIONS.txt'],
  }));
  const notice = {
    version: 2,
    pairManifestSha256: sha(pairRaw),
    sourceEvidenceSha256: sha(ev['source.json']),
    dependenciesManifestSha256: sha(ev['dependencies.json']),
    components,
    files: texts.map(({ name, raw }) => ({ path: name, bytes: raw.length, sha256: sha(raw) })),
  };
  const noticeRaw = json('app/video/notice-manifest.json', notice);
  const approval = {
    pairManifestSha256: sha(pairRaw),
    noticeManifestSha256: sha(noticeRaw),
    evidenceManifestSha256: sha(evidenceRaw),
  };
  return { approval, pair, notice, evidence, sourceNames, auto };
}
