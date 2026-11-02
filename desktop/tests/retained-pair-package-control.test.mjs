import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as actual from '../verification/retained-pair-package-control.mjs';
const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(
  path.join(desktop, 'verification/retained-pair-package-control.mjs'),
  'utf8',
);
const sha = (b) => createHash('sha256').update(b).digest('hex');
function temporary() {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'retained-package-test-')));
}
async function fixture() {
  const base = temporary(),
    root = path.join(base, 'run-' + randomUUID()),
    owner = randomUUID(),
    baseOwner = randomUUID();
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(base, '.owner'), baseOwner);
  fs.writeFileSync(path.join(root, '.owner'), owner);
  // Only fixed workspace location is transformed. All file/identity/ownership and deletion checks remain actual.
  let text = source
    .replace(
      "const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');",
      `const desktop = ${JSON.stringify(desktop)};`,
    )
    .replace(
      "export const BASE = path.join(desktop, '.retained-pair-package-check');",
      `export const BASE = ${JSON.stringify(base)};`,
    )
    .replace(
      /from '(\.\.\/scripts\/[^']+)'/g,
      (_, n) => `from '${pathToFileURL(path.resolve(desktop, 'verification', n)).href}'`,
    )
    .replace(
      'if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))',
      'if(false)',
    );
  // Formatting-independent replacement after formatter.
  text = text.replace(
    /if \(process\.argv\[1\] && path\.resolve\(process\.argv\[1\]\) === fileURLToPath\(import\.meta\.url\)\)/,
    'if (false)',
  );
  const m = await import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'));
  const ownership = {
    rootIdentity: m.directory(root),
    baseIdentity: m.directory(base),
    owner,
    baseOwner,
  };
  return {
    base,
    root,
    m,
    ownership,
    dispose: () => fs.rmSync(base, { recursive: true, force: true }),
  };
}
test('fixed source metadata matches approved three pins and attribution is a prefix, not a vendor copy', () => {
  const d = path.join(desktop, 'video-source/retained-package');
  for (const [n, k] of [
    ['pair', 'pairManifestSha256'],
    ['notice-manifest', 'noticeManifestSha256'],
    ['evidence-manifest', 'evidenceManifestSha256'],
  ])
    assert.equal(sha(fs.readFileSync(path.join(d, n + '.json'))), actual.PINS[k]);
  const prefix = fs.readFileSync(path.join(d, 'attribution-prefix.txt'), 'utf8');
  assert.ok(prefix.length < 16384);
  assert.match(prefix, /exact recorded tool hash/);
  assert.match(prefix, /six exact DEX/);
  assert.match(prefix, /UNRESOLVED/);
});
test('stable bytes preserve CRLF/control-Z and reject links, excess bytes and replacement', () => {
  const d = temporary();
  try {
    const p = path.join(d, 'a');
    const b = Buffer.from('a\r\nb\x1az');
    fs.writeFileSync(p, b);
    assert.deepEqual(actual.stableFile(p, 6, true).data, b);
    assert.throws(() => actual.stableFile(p, 5));
    fs.linkSync(p, path.join(d, 'b'));
    assert.throws(() => actual.stableFile(p, 6));
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});
test('layout accepts more than old 256-file helper limit under exact fixed names', () => {
  const d = temporary();
  try {
    const names = Array.from({ length: 300 }, (_, i) => 'f' + i);
    for (const n of names) fs.writeFileSync(path.join(d, n), 'x');
    assert.equal(actual.captureLayout(d, names).files.length, 300);
    fs.mkdirSync(path.join(d, 'foreign'));
    fs.writeFileSync(path.join(d, 'foreign', 'held'), 'keep');
    assert.throws(() => actual.captureLayout(d, names));
    assert.equal(fs.readFileSync(path.join(d, 'foreign', 'held'), 'utf8'), 'keep');
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});
test('actual independent path/token UUID cleanup removes only captured inventory and root last', async () => {
  const f = await fixture();
  try {
    assert.notEqual(path.basename(f.root).slice(4), f.ownership.owner);
    fs.mkdirSync(path.join(f.root, 'candidate'));
    fs.writeFileSync(path.join(f.root, 'candidate', 'a'), 'captured');
    const layout = f.m.captureLayout(f.root, ['.owner', 'candidate/a']);
    fs.writeFileSync(path.join(f.root, 'cleanup.json'), JSON.stringify({ layout }));
    f.m.removeCaptured(f.root, f.ownership, layout, 'cleanup.json');
    assert.equal(fs.existsSync(f.root), false);
    assert.equal(fs.readFileSync(path.join(f.base, '.owner'), 'utf8'), f.ownership.baseOwner);
  } finally {
    f.dispose();
  }
});
test('same-token root replacement and unknown file refuse without deleting replacement', async () => {
  const f = await fixture();
  try {
    fs.writeFileSync(path.join(f.root, 'a'), 'original');
    const layout = f.m.captureLayout(f.root, ['.owner', 'a']);
    fs.writeFileSync(path.join(f.root, 'cleanup.json'), '{}');
    fs.renameSync(f.root, f.root + '-retained');
    fs.mkdirSync(f.root);
    fs.writeFileSync(path.join(f.root, '.owner'), f.ownership.owner);
    fs.writeFileSync(path.join(f.root, 'a'), 'replacement');
    fs.writeFileSync(path.join(f.root, 'cleanup.json'), '{}');
    assert.throws(() => f.m.removeCaptured(f.root, f.ownership, layout, 'cleanup.json'));
    assert.equal(fs.readFileSync(path.join(f.root, 'a'), 'utf8'), 'replacement');
  } finally {
    f.dispose();
  }
});
test('changed captured bytes, unknown directory and changed base token refuse before deletion', async () => {
  const f = await fixture();
  try {
    fs.writeFileSync(path.join(f.root, 'a'), 'original');
    const layout = f.m.captureLayout(f.root, ['.owner', 'a']);
    fs.writeFileSync(path.join(f.root, 'cleanup.json'), '{}');
    fs.writeFileSync(path.join(f.root, 'a'), 'modified');
    assert.throws(() => f.m.removeCaptured(f.root, f.ownership, layout, 'cleanup.json'));
    fs.writeFileSync(path.join(f.root, 'a'), 'original');
    fs.mkdirSync(path.join(f.root, 'foreign'));
    assert.throws(() => f.m.removeCaptured(f.root, f.ownership, layout, 'cleanup.json'));
    fs.rmdirSync(path.join(f.root, 'foreign'));
    fs.writeFileSync(path.join(f.base, '.owner'), randomUUID());
    assert.throws(() => f.m.removeCaptured(f.root, f.ownership, layout, 'cleanup.json'));
    assert.equal(fs.readFileSync(path.join(f.root, 'a'), 'utf8'), 'original');
  } finally {
    f.dispose();
  }
});
test('artifact input rejects alternate receipt without adopting its rows', () => {
  const d = temporary();
  try {
    fs.writeFileSync(path.join(d, 'retention-receipt.json'), '{}');
    assert.throws(() => actual.admitArtifact(d));
    assert.equal(fs.readdirSync(d).length, 1);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

// Reuse the existing synthetic package policy fixture without importing/running its tests.
// Its only package-admission substitutions are three known synthetic runtime/license hashes
// and the fixture's pair approval. Real verifier, archive writer and receipt code still run.
async function composedFixture({ mutateResult = false } = {}) {
  const { transformSync } = await import('esbuild');
  const { runInNewContext } = await import('node:vm');
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const pairFixture = await import('./fixtures/retained-pair-package.mjs');
  const admission = require('../launch/package-admission.cjs');
  const legacy = fs.readFileSync(path.join(desktop, 'tests/package-build.test.mjs'), 'utf8');
  const functions =
    legacy.slice(
      legacy.indexOf('function syntheticPolicyPackage('),
      legacy.indexOf("test('synthetic-hash policy composition admits"),
    ) +
    legacy.slice(
      legacy.indexOf('function retainedBuilderFixture('),
      legacy.indexOf("test('retained pair builder copies"),
    );
  const packageHelpers = runInNewContext(
    transformSync(
      functions
        .replaceAll(
          'fileURLToPath(import.meta.url)',
          `fileURLToPath(${JSON.stringify(pathToFileURL(path.join(desktop, 'tests/package-build.test.mjs')).href)})`,
        )
        .replace(
          "new URL('../scripts/build-package.mjs', import.meta.url).href",
          JSON.stringify(pathToFileURL(path.join(desktop, 'scripts/build-package.mjs')).href),
        ) + '\n({pairedBuildFixture});',
      { loader: 'js', target: 'es2022' },
    ).code,
    {
      fs,
      assert,
      Buffer,
      process,
      require,
      admission,
      root: desktop,
      transformSync,
      runInNewContext,
      ...pairFixture,
      ...fs,
      resolve: path.resolve,
      dirname: path.dirname,
      fileURLToPath,
      createHash,
      URL,
    },
  );
  const base = temporary(),
    root = path.join(base, 'run-' + randomUUID()),
    owner = randomUUID(),
    baseOwner = randomUUID();
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(base, '.owner'), baseOwner);
  fs.writeFileSync(path.join(root, '.owner'), owner);
  const external = path.join(base, 'synthetic-input');
  fs.mkdirSync(external);
  const f = packageHelpers.pairedBuildFixture(external);
  const candidateRows = actual.captureLayout(f.candidate, f.f.verifier.RETAINED_PAIR_FILES);
  const buffers = new Map(
    candidateRows.files.map((row) => [row.path, fs.readFileSync(path.join(f.candidate, row.path))]),
  );
  const license = path.join(base, 'node-LICENSE');
  fs.writeFileSync(license, 'SYNTHETIC fixed prerequisite');
  const runtime = path.join(base, 'runtime.json');
  fs.writeFileSync(runtime, JSON.stringify({ head: 'a'.repeat(40) }));
  const context = {
    version: 1,
    sourceHead: 'a'.repeat(40),
    sourceTree: 'b'.repeat(40),
    npmVersion: '11.0.0',
    nodeExe: process.execPath,
  };
  fs.writeFileSync(path.join(root, 'context.json'), JSON.stringify(context));
  let calls = 0;
  const producer = async (options) => {
    calls++;
    assert.equal(options.retainedPairRoot, path.join(root, 'candidate'));
    const video = f.builder.copyRetainedPair(options.retainedPairRoot, f.stage);
    f.f.refresh(video);
    assert.equal(f.f.verifier.verifyPackage(f.stage).version, 2);
    const container = path.join(options.outputParent, 'Fonesi-Auto-' + randomUUID());
    fs.mkdirSync(container);
    const capture = f.builder.capturePackageArchive(f.stage),
      zipStage = path.join(container, '.staging.zip'),
      zip = path.join(container, 'Fonesi-Auto.zip'),
      final = path.join(container, 'package');
    const digest = f.builder.writeStoredZip(f.stage, zipStage, capture);
    f.builder.promotePackage(f.stage, final, zipStage, zip, digest, zip + '.receipt.json');
    const receipt = f.builder.writePackageReceipt(final, zip, digest, capture);
    return { directory: final, zip, sha256: digest.sha256, bytes: digest.bytes, receipt };
  };
  let text = fs.readFileSync(
    path.join(desktop, 'verification/retained-pair-package-control.mjs'),
    'utf8',
  );
  const replace = (from, to) => {
    assert.equal(text.split(from).length, 2, 'exact synthetic seam ' + from.slice(0, 60));
    text = text.replace(from, to);
  };
  replace(
    "const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');",
    `const desktop = ${JSON.stringify(desktop)};`,
  );
  replace(
    "export const BASE = path.join(desktop, '.retained-pair-package-check');",
    `export const BASE = ${JSON.stringify(base)};`,
  );
  replace(
    "export const LICENSE = path.join(desktop, '.retained-pair-package-node-LICENSE');",
    `export const LICENSE = ${JSON.stringify(license)};`,
  );
  replace(
    "requireThat(process.platform === 'win32' && process.arch === 'x64');",
    'requireThat(true); // Explicit synthetic build-only host seam, not Windows evidence.',
  );
  replace(
    "const runtimePath = path.join(desktop, '.runtime/persistence-runtime-manifest.json');",
    `const runtimePath = ${JSON.stringify(runtime)};`,
  );
  // Artifact hashes/Windows prerequisites have separate exact actual-byte admission tests.
  // This fixture substitutes only their input producer, preserving original control flow/fences.
  const start = text.indexOf('export function admitArtifact('),
    end = text.indexOf('export function materializeCandidate(', start);
  assert.ok(start > 0 && end > start);
  text =
    text.slice(0, start) +
    'export function admitArtifact(){ return fixtureArtifact; }\nexport function candidateBuffers(){ return fixtureBuffers; }\n' +
    text.slice(end);
  for (const [key, value] of Object.entries(f.f.verifier.verifyRetainedPair(f.candidate)))
    if (['pairManifestSha256', 'noticeManifestSha256', 'evidenceManifestSha256'].includes(key))
      text = text.replace(actual.PINS[key], value);
  if (mutateResult)
    replace(
      "json(path.join(root, 'build-result.json'), publicResult);",
      "json(path.join(root, 'build-result.json'), publicResult);\nfs.writeFileSync(path.join(root,'build-result.json'),JSON.stringify({...publicResult,packageFiles:publicResult.packageFiles+1})); // causal post-write replacement",
    );
  text = text.slice(0, text.indexOf('if (process.argv[1]'));
  const module = { exports: {} };
  runInNewContext(transformSync(text, { loader: 'js', format: 'cjs', target: 'es2022' }).code, {
    module,
    exports: module.exports,
    Buffer,
    process,
    console,
    fixtureArtifact: { synthetic: true },
    fixtureBuffers: buffers,
    require(name) {
      if (name === '../scripts/build-package.mjs') return { buildPackage: producer };
      if (name === '../scripts/package-manifest.mjs')
        return {
          verifyRetainedPair: f.f.verifier.verifyRetainedPair,
          verifyPackage: f.f.verifier.verifyPackage,
          packageInventory: f.f.verifier.inventory,
          NODE_SHA: actual.stableFile(process.execPath, 128 * 1024 * 1024).sha256,
          NODE_LICENSE_SHA: sha(fs.readFileSync(license)),
        };
      if (name === '../scripts/build-manifest.mjs')
        return { inputs: [], outputs: [], verifyBuild: () => true };
      return require(name);
    },
  });
  const m = module.exports;
  // Emulate the wrapper's immutable actual-settlement byte captures, not an authority callback
  // supplied to production. Controller has no arbitrary registration/injection API.
  let prepared = null,
    sealed = null;
  const capturePrepared = () => {
    prepared = ['context.json', 'private.json'].map((n) => [
      n,
      fs.readFileSync(path.join(root, n)),
    ]);
  };
  const preparedCurrent = () => {
    for (const [n, b] of prepared) assert.deepEqual(fs.readFileSync(path.join(root, n)), b);
  };
  const build = async () => {
    preparedCurrent();
    const result = await m.build(root);
    preparedCurrent();
    sealed = fs.readFileSync(path.join(root, 'cleanup.json'));
    const seal = JSON.parse(sealed),
      row = seal.layout.files.find((x) => x.path === 'build-result.json'),
      b = fs.readFileSync(path.join(root, 'build-result.json'));
    assert.equal(row.bytes, b.length);
    assert.equal(row.sha256, sha(b));
    assert.deepEqual(JSON.parse(b), JSON.parse(JSON.stringify(result)));
    return result;
  };
  const cleanup = () => {
    preparedCurrent();
    assert.deepEqual(fs.readFileSync(path.join(root, 'cleanup.json')), sealed);
    m.cleanup(root);
  };
  return {
    base,
    root,
    m,
    prepare() {
      m.prepare(root);
      capturePrepared();
    },
    build,
    cleanup,
    get calls() {
      return calls;
    },
    dispose() {
      fs.rmSync(base, { recursive: true, force: true });
    },
  };
}

test('actual controller prepare/build/seal/cleanup composes shared synthetic package, ZIP and receipt validation', async () => {
  const f = await composedFixture();
  try {
    f.prepare();
    const r = await f.build();
    assert.equal(f.calls, 1);
    assert.equal(r.packageVerified, true);
    assert.equal(r.archiveBound, true);
    assert.ok(r.packageFiles > 23);
    assert.ok(r.archiveBytes > 0);
    f.cleanup();
    assert.equal(fs.existsSync(f.root), false);
  } finally {
    f.dispose();
  }
});
test('cross-action prepared state and coherent cleanup seal replacements refuse before next effect', async () => {
  const f = await composedFixture();
  try {
    f.prepare();
    const p = path.join(f.root, 'private.json'),
      saved = fs.readFileSync(p),
      v = JSON.parse(saved);
    v.context.sourceTree = 'c'.repeat(40);
    fs.writeFileSync(p, JSON.stringify(v));
    await assert.rejects(f.build);
    assert.equal(f.calls, 0);
    fs.writeFileSync(p, saved);
    await f.build();
    const seal = path.join(f.root, 'cleanup.json'),
      s = JSON.parse(fs.readFileSync(seal));
    s.layout.files = s.layout.files.filter((x) => x.path !== 'build-result.json');
    fs.writeFileSync(seal, JSON.stringify(s));
    assert.throws(f.cleanup);
    assert.equal(fs.existsSync(path.join(f.root, 'build-result.json')), true);
  } finally {
    f.dispose();
  }
});
test('coherent post-write public result replacement cannot become the cleanup baseline', async () => {
  const f = await composedFixture({ mutateResult: true });
  try {
    f.prepare();
    await assert.rejects(f.build, /RETAINED_PAIR_PACKAGE_REJECTED/);
    assert.equal(f.calls, 1);
    assert.equal(fs.existsSync(path.join(f.root, 'cleanup.json')), false);
    assert.equal(fs.existsSync(path.join(f.root, 'build-result.json')), true);
  } finally {
    f.dispose();
  }
});
