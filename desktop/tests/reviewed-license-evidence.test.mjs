import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mkdirSync,
  mkdtempSync,
  lstatSync,
  realpathSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import {
  renderReviewedLicenseEvidence,
  admittedReviewedLicenseEvidence,
  readEvidenceFile,
} from '../scripts/reviewed-license-evidence.mjs';
import { TOOL_LICENSE_PROVENANCE } from '../scripts/reviewed-tool-license-pins.mjs';
import { TEST_FILES } from '../scripts/test-batches.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const names = ['package.json', 'package-lock.json', 'dependency-review.json'];
const texts = names.map((name) => readFileSync(resolve(root, name), 'utf8'));
const paths = ['@js-temporal/polyfill', 'jsbi', 'react', 'react-dom', 'scheduler'].map(
  (name) => `node_modules/${name}/LICENSE`,
);
const provenance = JSON.parse(TOOL_LICENSE_PROVENANCE);
for (const artifact of provenance.artifacts)
  for (const text of artifact.texts)
    paths.push(`${artifact.lockPath}/${text.archiveMember.slice('package/'.length)}`);
const inputs = () => paths.map((path) => ({ path, bytes: readFileSync(resolve(root, path)) }));
const render = (licenses = inputs(), source = texts) =>
  renderReviewedLicenseEvidence(...source, licenses);
const result = render(),
  parsed = JSON.parse(result.json);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function ownedFixture(action) {
  const parent = resolve(root, '.test-output');
  mkdirSync(parent, { recursive: true });
  const checkParent = () => {
    assert.equal(lstatSync(parent).isSymbolicLink(), false);
    assert.equal(realpathSync(parent), resolve(realpathSync(root), '.test-output'));
  };
  checkParent();
  const dir = mkdtempSync(resolve(parent, 'license-evidence-'));
  try {
    return action(dir);
  } finally {
    checkParent();
    assert.equal(lstatSync(dir).isSymbolicLink(), false);
    assert.equal(realpathSync(dir), resolve(realpathSync(parent), basename(dir)));
    rmSync(dir, { recursive: true });
  }
}
function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 262144,
    shell: false,
  });
}
test('full lock mapping preserves80 instances with 8 collected packages,12 texts and72 unassessed', () => {
  const inventory = JSON.parse(readFileSync(resolve(root, 'dependency-inventory.json'), 'utf8'));
  assert.equal(parsed.kind, 'FONESI_AUTO_REVIEWED_LICENSE_TEXT_EVIDENCE');
  assert.equal(parsed.schemaVersion, 2);
  assert.equal(parsed.scope, 'TWELVE_FIXED_REVIEWED_NPM_LICENSE_TEXTS_ONLY');
  assert.equal(parsed.packageCount, 80);
  assert.equal(parsed.collectedTextCount, 12);
  assert.equal(parsed.notCollectedPackageCount, 72);
  assert.deepEqual(
    parsed.packages.map((item) => item.lockPath),
    inventory.packages.map((item) => item.lockPath),
  );
  assert.equal(
    parsed.packages.filter((item) => item.status === 'COLLECTED_REVIEWED_TEXT').length,
    8,
  );
  for (const item of parsed.packages) {
    const source = inventory.packages.find((entry) => entry.lockPath === item.lockPath);
    for (const key of ['name', 'version', 'registryArtifact', 'integrity', 'declaredLicense'])
      assert.equal(item[key], source[key]);
    if (item.status === 'NOT_COLLECTED_BY_THIS_TOOL') assert.deepEqual(item.licenseTexts, []);
    else
      for (const text of item.licenseTexts)
        assert.ok(paths.includes(text.path.slice('desktop/'.length)));
  }
  assert.deepEqual(parsed.inputs, inventory.inputs);
  assert.equal(
    parsed.inventory.sha256,
    hash(readFileSync(resolve(root, 'dependency-inventory.json'))),
  );
  assert.ok(parsed.limitations.some((text) => text.includes('legal clearance')));
  assert.ok(parsed.limitations.some((text) => text.includes('not complete third-party notices')));
});
test('deterministic artifacts preserve full exact text bytes and original pinned digests', () => {
  assert.deepEqual(render(), result);
  assert.equal(result.json, readFileSync(resolve(root, 'reviewed-license-evidence.json'), 'utf8'));
  assert.equal(result.notice, readFileSync(resolve(root, 'reviewed-license-notices.txt'), 'utf8'));
  assert.equal(parsed.notices.sha256, hash(result.notice));
  assert.equal(parsed.notices.bytes, Buffer.byteLength(result.notice));
  for (const input of inputs()) {
    const entry = parsed.packages
      .flatMap((item) => item.licenseTexts)
      .find((item) => item.path === `desktop/${input.path}`);
    assert.equal(entry.sha256, hash(input.bytes));
    assert.equal(entry.bytes, input.bytes.length);
    const start = result.notice.indexOf(`Source: desktop/${input.path}\n`);
    const marker = result.notice.indexOf('BEGIN EXACT TEXT\n', start) + 'BEGIN EXACT TEXT\n'.length;
    const tail = Buffer.from(result.notice.slice(marker));
    assert.deepEqual(tail.subarray(0, input.bytes.length), input.bytes);
    assert.equal(
      tail.subarray(input.bytes.length, input.bytes.length + 16).toString(),
      '\nEND EXACT TEXT\n',
    );
  }
});
for (const mode of [
  'missing',
  'extra',
  'duplicate',
  'reordered',
  'wrong-path',
  'changed',
  'empty',
  'oversized',
  'utf8',
  'bom',
  'string',
  'extra-key',
]) {
  test(`pure input rejection: ${mode}`, () => {
    const licenses = inputs();
    if (mode === 'missing') licenses.pop();
    if (mode === 'extra') licenses.push(licenses[0]);
    if (mode === 'duplicate') licenses[1] = licenses[0];
    if (mode === 'reordered') licenses.reverse();
    if (mode === 'wrong-path') licenses[0].path = 'node_modules/secret/LICENSE';
    if (mode === 'changed') licenses[0].bytes[0] ^= 1;
    if (mode === 'empty') licenses[0].bytes = Buffer.alloc(0);
    if (mode === 'oversized') licenses[0].bytes = Buffer.alloc(32769);
    if (mode === 'utf8') licenses[0].bytes = Buffer.from([0xff]);
    if (mode === 'bom')
      licenses[0].bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), licenses[0].bytes]);
    if (mode === 'string') licenses[0].bytes = licenses[0].bytes.toString();
    if (mode === 'extra-key') licenses[0].secret = 'canary';
    assert.throws(() => render(licenses), /^Error: REVIEWED_LICENSE_EVIDENCE_REJECTED$/);
  });
}
test('accessor evidence is rejected without invocation or inconsistent text/hash output', () => {
  for (const key of ['bytes', 'path']) {
    const licenses = inputs();
    let calls = 0;
    const original = licenses[0][key];
    Object.defineProperty(licenses[0], key, {
      enumerable: true,
      get() {
        calls++;
        return key === 'bytes' && calls === 4 ? Buffer.from('INJECTED_TEST_TEXT') : original;
      },
    });
    assert.throws(() => render(licenses), /REVIEWED_LICENSE_EVIDENCE_REJECTED/);
    assert.equal(calls, 0);
  }
  const licenses = inputs();
  licenses[0][Symbol('extra')] = true;
  assert.throws(() => render(licenses), /REVIEWED_LICENSE_EVIDENCE_REJECTED/);
});
test('review pin disagreement and inconsistent or malformed metadata fail closed', () => {
  for (const value of ['', '{}', 'null', '{secret', 'x'.repeat(262145)])
    assert.throws(() => render(inputs(), [texts[0], texts[1], value]));
  for (const path of paths.slice(0, 2)) {
    const review = JSON.parse(texts[2]);
    review.reviewedFiles[path] = '0'.repeat(64);
    assert.throws(
      () => render(inputs(), [texts[0], texts[1], JSON.stringify(review)]),
      /REVIEWED_LICENSE_EVIDENCE_REJECTED/,
    );
  }
});
test('bounded reader retains BOM and CRLF verbatim, denies malformed UTF8 and bounds', () =>
  ownedFixture((dir) => {
    const bytes = Buffer.from('\uFEFFsample\r\n');
    writeFileSync(resolve(dir, 'LICENSE'), bytes);
    assert.deepEqual(readEvidenceFile(dir, 'LICENSE', 32), bytes);
    assert.throws(() => readEvidenceFile(dir, 'LICENSE', bytes.length - 1));
    for (const value of [Buffer.alloc(0), Buffer.alloc(33), Buffer.from([0xff])]) {
      writeFileSync(resolve(dir, 'LICENSE'), value);
      assert.throws(() => readEvidenceFile(dir, 'LICENSE', 32));
    }
    for (const name of [
      '/LICENSE',
      '../LICENSE',
      'a/../LICENSE',
      './LICENSE',
      'a//LICENSE',
      'a\\LICENSE',
      'secret\n',
    ])
      assert.throws(() => readEvidenceFile(dir, name, 32));
    for (const limit of [0, -1, 262145, Infinity, 1.5, '32'])
      assert.throws(() => readEvidenceFile(dir, 'LICENSE', limit));
    rmSync(resolve(dir, 'LICENSE'));
    assert.throws(() => readEvidenceFile(dir, 'LICENSE', 32));
    mkdirSync(resolve(dir, 'LICENSE'));
    assert.throws(() => readEvidenceFile(dir, 'LICENSE', 32));
  }));
test('reader rejects parent junctions and linked base without following outside fixed tree', () =>
  ownedFixture((dir) => {
    mkdirSync(resolve(dir, 'actual'));
    writeFileSync(resolve(dir, 'actual/LICENSE'), 'test');
    symlinkSync(
      resolve(dir, 'actual'),
      resolve(dir, 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    assert.throws(() => readEvidenceFile(dir, 'linked/LICENSE', 32));
    assert.throws(() => readEvidenceFile(resolve(dir, 'linked'), 'LICENSE', 32));
  }));
test('reader rejects linked file before reading it', () =>
  ownedFixture((dir) => {
    // Directory junctions need no Windows symlink privilege and exercise the leaf-link rejection.
    mkdirSync(resolve(dir, 'actual'));
    symlinkSync(
      resolve(dir, 'actual'),
      resolve(dir, 'LICENSE'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    assert.throws(() => readEvidenceFile(dir, 'LICENSE', 32));
    if (process.platform !== 'win32') {
      rmSync(resolve(dir, 'LICENSE'));
      writeFileSync(resolve(dir, 'original'), 'test');
      symlinkSync(resolve(dir, 'original'), resolve(dir, 'LICENSE'));
      assert.throws(() => readEvidenceFile(dir, 'LICENSE', 32));
    }
  }));
test('admitted CLI has fixed modes, no writes and generic failures', () => {
  const script = resolve(root, 'scripts/reviewed-license-evidence.mjs');
  const before = [
    ...names,
    'dependency-inventory.json',
    'reviewed-license-evidence.json',
    'reviewed-license-notices.txt',
    'reviewed-tool-license-provenance.json',
    ...paths,
  ].map((path) => readFileSync(resolve(root, path)));
  assert.deepEqual(admittedReviewedLicenseEvidence('11.9.0'), result);
  for (const [mode, expected] of [
    ['--json', result.json],
    ['--notice', result.notice],
    ['--check', 'REVIEWED_LICENSE_EVIDENCE_PASS\n'],
  ]) {
    const actual = run(script, [mode, '11.9.0']);
    assert.equal(actual.status, 0);
    assert.equal(actual.stdout, expected);
    assert.equal(actual.stderr, '');
  }
  for (const args of [
    [],
    ['--write', '11.9.0'],
    ['--check', '0.0.0'],
    ['--json', '11.9.0', 'secret-canary'],
  ]) {
    const actual = run(script, args);
    assert.equal(actual.status, 1);
    assert.equal(actual.stdout, 'REVIEWED_LICENSE_EVIDENCE_FAILED\n');
    assert.equal(actual.stderr, '');
  }
  assert.deepEqual(
    [
      ...names,
      'dependency-inventory.json',
      'reviewed-license-evidence.json',
      'reviewed-license-notices.txt',
      'reviewed-tool-license-provenance.json',
      ...paths,
    ].map((path) => readFileSync(resolve(root, path))),
    before,
  );
});
test('real CLI fails closed for missing/stale artifacts and invalid license bytes in owned checkout', () =>
  ownedFixture((dir) => {
    const desktop = resolve(dir, 'desktop');
    const files = [
      ...names,
      'biome-review.json',
      'dependency-inventory.json',
      'reviewed-license-evidence.json',
      'reviewed-license-notices.txt',
      'reviewed-tool-license-provenance.json',
      ...paths,
      'scripts/reviewed-license-evidence.mjs',
      'scripts/reviewed-tool-license-pins.mjs',
      'scripts/dependency-inventory.mjs',
      'scripts/verify-dependencies.mjs',
      'scripts/package-manifest.mjs',
      'launch/package-admission.cjs',
      '../tools/phase-00/desktop-stack-lab/package-lock.json',
      '../tools/phase-00/desktop-stack-lab/dependency-review.json',
    ];
    for (const path of files) {
      mkdirSync(dirname(resolve(desktop, path)), { recursive: true });
      copyFileSync(resolve(root, path), resolve(desktop, path));
    }
    const script = resolve(desktop, 'scripts/reviewed-license-evidence.mjs');
    assert.equal(run(script, ['--check', '11.9.0']).status, 0);
    for (const path of [
      'reviewed-license-evidence.json',
      'reviewed-license-notices.txt',
      'reviewed-tool-license-provenance.json',
      ...paths,
    ]) {
      const target = resolve(desktop, path),
        original = readFileSync(target);
      for (const value of [
        null,
        Buffer.from([0xff]),
        Buffer.from('secret-canary'),
        Buffer.concat([original, Buffer.from('\n')]),
        Buffer.alloc(path.includes('LICENSE') ? 32769 : 262145),
      ]) {
        if (value === null) rmSync(target);
        else writeFileSync(target, value);
        const actual = run(script, ['--check', '11.9.0']);
        assert.equal(actual.status, 1, path);
        assert.equal(actual.stdout, 'REVIEWED_LICENSE_EVIDENCE_FAILED\n');
        assert.equal(actual.stderr, '');
      }
      writeFileSync(target, original);
    }
    const provenancePath = resolve(desktop, 'reviewed-tool-license-provenance.json');
    for (const mode of ['missing-member', 'extra-member', 'reordered-members', 'changed-size']) {
      const changed = JSON.parse(TOOL_LICENSE_PROVENANCE);
      const members = changed.artifacts[0].texts;
      if (mode === 'missing-member') members.pop();
      if (mode === 'extra-member') members.push(members[0]);
      if (mode === 'reordered-members') members.reverse();
      if (mode === 'changed-size') members[0].sizeBytes++;
      writeFileSync(provenancePath, JSON.stringify(changed, null, 2) + '\n');
      const actual = run(script, ['--check', '11.9.0']);
      assert.equal(actual.status, 1, mode);
      assert.equal(actual.stdout, 'REVIEWED_LICENSE_EVIDENCE_FAILED\n');
    }
    writeFileSync(provenancePath, TOOL_LICENSE_PROVENANCE);
    assert.equal(run(script, ['--check', '11.9.0']).status, 0);
  }));
test('source registration is bounded and no runtime/package consumer is introduced', () => {
  assert.ok(TEST_FILES.includes('tests/reviewed-license-evidence.test.mjs'));
  assert.deepEqual([...TEST_FILES].sort(), TEST_FILES);
  const runner = readFileSync(resolve(root, 'scripts/check.mjs'), 'utf8');
  assert.match(runner, /'REVIEWED_LICENSE_EVIDENCE'/);
  assert.match(runner, /scripts\/reviewed-license-evidence\.mjs', '--check', npmVersion/);
  const manifest = readFileSync(resolve(root, 'scripts/build-manifest.mjs'), 'utf8');
  for (const path of [
    'reviewed-license-evidence.json',
    'reviewed-license-notices.txt',
    'reviewed-tool-license-provenance.json',
    'scripts/reviewed-license-evidence.mjs',
    'scripts/reviewed-tool-license-pins.mjs',
  ])
    assert.ok(manifest.includes(`'${path}'`));
  const source = readFileSync(resolve(root, 'scripts/reviewed-license-evidence.mjs'), 'utf8');
  assert.doesNotMatch(source, /writeFile|spawn|execFile|fetch\(|https\.request/);
  for (const path of [
    'src/main.ts',
    'src/preload.ts',
    'src/renderer.tsx',
    'scripts/build-package.mjs',
    'launch/package-admission.cjs',
  ])
    assert.equal(
      readFileSync(resolve(root, path), 'utf8').includes('reviewed-license-evidence'),
      false,
    );
});

test('tool provenance binds the exact seven texts and three existing artifact rows', () => {
  assert.equal(parsed.collectedPackageCount, 8);
  assert.equal(
    parsed.packages.reduce((count, item) => count + item.licenseTexts.length, 0),
    12,
  );
  assert.equal(parsed.toolProvenance.sha256, hash(TOOL_LICENSE_PROVENANCE));
  assert.equal(
    readFileSync(resolve(root, 'reviewed-tool-license-provenance.json'), 'utf8'),
    TOOL_LICENSE_PROVENANCE,
  );
  assert.equal(provenance.artifacts.length, 3);
  for (const artifact of provenance.artifacts) {
    const item = parsed.packages.find((entry) => entry.lockPath === artifact.lockPath);
    for (const key of ['name', 'version', 'registryArtifact', 'integrity', 'declaredLicense'])
      assert.equal(item[key], artifact[key]);
    assert.deepEqual(
      item.licenseTexts.map((entry) => entry.archiveMember),
      artifact.texts.map((entry) => entry.archiveMember),
    );
    for (const text of artifact.texts) {
      const entry = item.licenseTexts.find((value) => value.archiveMember === text.archiveMember);
      assert.equal(entry.sha256, text.sha256);
      assert.equal(entry.bytes, text.sizeBytes);
      assert.equal(
        entry.pinSource,
        'desktop/scripts/reviewed-tool-license-pins.mjs#TOOL_LICENSE_PROVENANCE',
      );
      assert.equal(
        text.readLimitBytes,
        artifact.name === 'typescript' && text.archiveMember === 'package/NOTICE.txt'
          ? 65536
          : 32768,
      );
    }
  }
  assert.equal(parsed.packages.filter((item) => item.name === 'vscode-jsonrpc').length, 0);
  assert.equal(
    parsed.packages.find((item) => item.name === '@biomejs/biome').licenseTexts.length,
    3,
  );
  assert.equal(parsed.packages.find((item) => item.name === 'typescript').licenseTexts.length, 3);
});
test('every new member rejects changed bytes, oversized bytes and accessor inputs', () => {
  for (let index = 5; index < paths.length; index++) {
    for (const mode of ['changed', 'oversized', 'accessor']) {
      const licenses = inputs();
      let calls = 0;
      if (mode === 'changed') licenses[index].bytes[0] ^= 1;
      if (mode === 'oversized')
        licenses[index].bytes = Buffer.alloc(
          paths[index] === 'node_modules/typescript/NOTICE.txt' ? 65537 : 32769,
        );
      if (mode === 'accessor')
        Object.defineProperty(licenses[index], 'bytes', {
          get() {
            calls++;
            return Buffer.from('canary');
          },
        });
      assert.throws(() => render(licenses), /REVIEWED_LICENSE_EVIDENCE_REJECTED/);
      assert.equal(calls, 0);
    }
  }
});
test('consistent lock/review changes cannot replace independently reviewed tool artifact pins', () => {
  for (const artifact of provenance.artifacts) {
    for (const mode of ['version', 'integrity', 'license']) {
      const manifest = JSON.parse(texts[0]),
        lock = JSON.parse(texts[1]),
        review = JSON.parse(texts[2]);
      const item = lock.packages[artifact.lockPath];
      if (mode === 'integrity') item.integrity = `sha512-${Buffer.alloc(64).toString('base64')}`;
      if (mode === 'license') item.license = 'ISC';
      if (mode === 'version') {
        item.version = '99.0.0';
        item.resolved = `https://registry.npmjs.org/${artifact.name}/-/${artifact.name.split('/').at(-1)}-99.0.0.tgz`;
        manifest.devDependencies[artifact.name] = '99.0.0';
        lock.packages[''].devDependencies[artifact.name] = '99.0.0';
      }
      review.manifest = manifest;
      review.lock = lock;
      review.packages[artifact.lockPath] = {
        ...review.packages[artifact.lockPath],
        version: item.version,
        resolved: item.resolved,
        integrity: item.integrity,
        license: item.license,
      };
      assert.throws(
        () =>
          render(
            inputs(),
            [manifest, lock, review].map((value) => JSON.stringify(value)),
          ),
        /REVIEWED_LICENSE_EVIDENCE_REJECTED/,
      );
    }
  }
});
test('exact CRLF text survives generation with narrowly scoped binary Git treatment', () => {
  for (const [path, count] of [
    ['node_modules/typescript/LICENSE', 55],
    ['node_modules/typescript/NOTICE.txt', 436],
  ]) {
    const bytes = readFileSync(resolve(root, path));
    assert.equal((bytes.toString().match(/\r\n/g) ?? []).length, count);
    assert.ok(result.notice.includes(bytes.toString()));
  }
  assert.equal((result.notice.match(/\r\n/g) ?? []).length, 491);
  const attributes = readFileSync(resolve(root, '../.gitattributes'), 'utf8');
  assert.match(attributes, /^desktop\/reviewed-license-notices\.txt -text$/m);
  assert.ok(
    attributes.indexOf('desktop/reviewed-license-notices.txt -text') >
      attributes.indexOf('desktop/** text=auto eol=lf'),
  );
});
test('rendered output owns its byte snapshot after caller mutation', () => {
  const licenses = inputs();
  const output = render(licenses);
  for (const input of licenses) input.bytes.fill(0);
  assert.deepEqual(output, result);
});
