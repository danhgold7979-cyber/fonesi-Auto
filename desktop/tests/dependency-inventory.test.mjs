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
} from 'node:fs';
import {
  renderDependencyInventory,
  matchesDependencyInventory,
  admittedDependencyInventory,
} from '../scripts/dependency-inventory.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const names = ['package.json', 'package-lock.json', 'dependency-review.json'];
const texts = names.map((name) => readFileSync(resolve(root, name), 'utf8'));
const render = (values = texts) => renderDependencyInventory(...values);
const result = JSON.parse(render());
const fixture = () => texts.map((text) => JSON.parse(text));
function changed(edit, sync = true) {
  const values = fixture();
  edit(...values);
  if (sync) {
    values[2].manifest = values[0];
    values[2].lock = values[1];
  }
  return values.map((value) => JSON.stringify(value));
}
function bad(edit, sync = true) {
  assert.throws(() => render(changed(edit, sync)), /^Error: DEPENDENCY_INVENTORY_REJECTED$/);
}
function packageEdit(field, value) {
  bad((_manifest, lock, review) => {
    lock.packages['node_modules/react'][field] = value;
    if (Object.hasOwn(review.packages['node_modules/react'], field))
      review.packages['node_modules/react'][field] = value;
  });
}
test('actual reviewed closure contains every 80 lock entries and all 57 optional entries', () => {
  const lock = fixture()[1];
  assert.equal(result.kind, 'FONESI_AUTO_NPM_LOCK_INVENTORY');
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.scope, 'DESKTOP_NPM_LOCK_RESOLUTION_ONLY');
  assert.equal(result.packageCount, 80);
  assert.equal(result.packages.length, 80);
  assert.equal(result.packages.filter((item) => item.optional).length, 57);
  assert.deepEqual(
    result.packages.map((item) => item.lockPath),
    Object.keys(lock.packages).filter(Boolean).sort(),
  );
  assert.equal(new Set(result.packages.map((item) => item.lockPath)).size, 80);
  for (const item of result.packages) {
    const original = lock.packages[item.lockPath];
    assert.equal(item.version, original.version);
    assert.equal(item.registryArtifact, original.resolved);
    assert.equal(item.integrity, original.integrity);
    assert.equal(item.declaredLicense, original.license);
    assert.equal(item.development, original.dev ?? false);
    assert.equal(item.optional, original.optional ?? false);
    assert.deepEqual(item.os, original.os ? [...original.os].sort() : null);
    assert.deepEqual(item.cpu, original.cpu ? [...original.cpu].sort() : null);
  }
});
test('canonical bytes repeat and match committed inventory, with exact input digests', () => {
  const expected = render();
  assert.equal(expected, render());
  assert.equal(expected, readFileSync(resolve(root, 'dependency-inventory.json'), 'utf8'));
  assert.equal(expected.endsWith('\n'), true);
  for (const [i, name] of names.entries()) {
    assert.deepEqual(result.inputs[i], {
      path: `desktop/${name}`,
      sha256: createHash('sha256').update(texts[i]).digest('hex'),
    });
  }
  const whitespace = [...texts];
  whitespace[0] += '\n';
  const next = JSON.parse(render(whitespace));
  assert.notEqual(next.inputs[0].sha256, result.inputs[0].sha256);
  assert.deepEqual(next.packages, result.packages);
});
test('scoped identities and all-host optional resolution are preserved without installed claims', () => {
  const scoped = result.packages.find((item) => item.name === '@js-temporal/polyfill');
  assert.equal(scoped.lockPath, 'node_modules/@js-temporal/polyfill');
  assert.equal(scoped.development, false);
  const windows = result.packages.find((item) => item.name === '@esbuild/win32-x64');
  assert.equal(windows.optional, true);
  assert.deepEqual(windows.os, ['win32']);
  assert.deepEqual(windows.cpu, ['x64']);
  assert.ok(result.packages.some((item) => item.os?.includes('darwin')));
  assert.ok(
    result.limitations.some((text) => text.includes('not installed-host or shipped-product')),
  );
  assert.ok(
    result.limitations.some((text) => text.includes('not all existing admission dependencies')),
  );
  assert.equal(Object.hasOwn(scoped, 'installed'), false);
  assert.equal(Object.hasOwn(scoped, 'licenseApproved'), false);
  assert.equal(Object.hasOwn(scoped, 'signatureVerified'), false);
});
test('nested scoped package instances retain distinct lock paths and canonical ordering', () => {
  const input = changed((_manifest, lock, review) => {
    const source = 'node_modules/@js-temporal/polyfill';
    const nested = 'node_modules/example/node_modules/@js-temporal/polyfill';
    lock.packages[nested] = structuredClone(lock.packages[source]);
    review.packages[nested] = structuredClone(review.packages[source]);
  });
  const projected = JSON.parse(render(input));
  assert.equal(projected.packageCount, 81);
  assert.equal(
    projected.packages.filter((item) => item.name === '@js-temporal/polyfill').length,
    2,
  );
  assert.deepEqual(
    projected.packages.map((item) => item.lockPath),
    projected.packages.map((item) => item.lockPath).sort(),
  );
});
test('dependency ranges remain declared requirements, not invented resolved graph edges', () => {
  for (const item of result.packages) {
    const original = fixture()[1].packages[item.lockPath];
    for (const kind of ['dependencies', 'optionalDependencies', 'peerDependencies'])
      assert.deepEqual(item.declaredRequirements[kind], original[kind] ?? {});
    assert.equal(Object.hasOwn(item, 'resolvedDependencies'), false);
  }
});
test('valid prerelease metadata, absent flags and ordered platform restrictions are explicit', () => {
  const projected = JSON.parse(
    render(
      changed((_manifest, lock, review) => {
        const item = lock.packages['node_modules/react'];
        item.version = '19.3.0-rc.1';
        item.resolved = 'https://registry.npmjs.org/react/-/react-19.3.0-rc.1.tgz';
        delete item.dev;
        delete item.optional;
        item.os = ['win32', 'linux'];
        item.cpu = ['x64', 'arm64'];
        Object.assign(review.packages['node_modules/react'], {
          version: item.version,
          resolved: item.resolved,
        });
      }),
    ),
  );
  const item = projected.packages.find((entry) => entry.name === 'react');
  assert.equal(item.version, '19.3.0-rc.1');
  assert.equal(item.development, false);
  assert.equal(item.optional, false);
  assert.deepEqual(item.os, ['linux', 'win32']);
  assert.deepEqual(item.cpu, ['arm64', 'x64']);
});
test('project, lock root, package count and exact review key coverage fail closed', () => {
  bad((manifest) => {
    manifest.name = 'other';
  });
  bad((manifest) => {
    manifest.private = false;
  });
  bad((manifest) => {
    manifest.version = 'private value';
  });
  bad((_manifest, lock) => {
    lock.packages[''].dependencies = {};
  });
  bad((_manifest, lock) => {
    lock.lockfileVersion = 2;
  });
  bad((_manifest, lock) => {
    lock.requires = false;
  });
  bad((_manifest, lock) => {
    delete lock.packages[''];
  });
  bad((_manifest, _lock, review) => {
    review.packages.extra = {};
  });
  bad((_manifest, _lock, review) => {
    delete review.packages['node_modules/react'];
  });
  bad((_manifest, lock, review) => {
    lock.packages = { '': lock.packages[''] };
    review.packages = {};
  });
  bad((_manifest, lock, review) => {
    for (let i = 0; i < 49; i++) {
      const path = `node_modules/fixture${i}`;
      lock.packages[path] = lock.packages['node_modules/react'];
      review.packages[path] = review.packages['node_modules/react'];
    }
  });
});
test('manifest/lock/review disagreements are not silently repaired', () => {
  bad((manifest) => {
    manifest.description = 'changed';
  }, false);
  bad((_manifest, lock) => {
    lock.packages['node_modules/react'].dev = false;
  }, false);
  bad((_manifest, _lock, review) => {
    review.packages['node_modules/react'].license = 'ISC';
  });
});
for (const value of [
  '../react',
  '/react',
  'node_modules/../react',
  'node_modules/@scope',
  'node_modules/react/extra',
  'node_modules/react\\file',
  'node_modules/React',
  'node_modules/react\n',
])
  test(`invalid lock path denied ${JSON.stringify(value)}`, () => {
    bad((_manifest, lock, review) => {
      lock.packages[value] = lock.packages['node_modules/react'];
      review.packages[value] = review.packages['node_modules/react'];
    });
  });
for (const [field, value] of [
  ['version', 'latest'],
  ['version', '01.2.3'],
  ['version', null],
  ['version', '1.2.3-..'],
  ['version', '1.2.3-01'],
  ['version', '1.2.3-alpha..1'],
  ['resolved', 'https://registry.npmjs.org.evil.invalid/react/-/react-19.3.0.tgz'],
  ['resolved', 'http://registry.npmjs.org/react/-/react-19.3.0.tgz'],
  ['resolved', 'https://user:secret@registry.npmjs.org/react/-/react-19.3.0.tgz'],
  ['resolved', 'https://registry.npmjs.org/react/-/other.tgz'],
  ['integrity', 'sha512-bad'],
  ['integrity', `sha512-${'a'.repeat(86)}==`],
  ['license', 'UNREVIEWED'],
  ['license', ['MIT']],
  ['dev', 'true'],
  ['optional', null],
  ['os', 'win32'],
  ['os', []],
  ['os', ['linux', 'linux']],
  ['cpu', ['x64\n']],
  ['dependencies', { '../escape': '^1.0.0' }],
  ['dependencies', { example: 'https://secret.invalid' }],
])
  test(`malformed ${field} rejected ${JSON.stringify(value)}`, () => packageEdit(field, value));
test('bounded JSON and exact-byte matching never echo malformed or stale input', () => {
  for (const value of [
    undefined,
    null,
    1,
    {},
    [],
    '',
    '{secret',
    '[]',
    'null',
    'true',
    'x'.repeat(16385),
  ])
    assert.throws(
      () => render([value, texts[1], texts[2]]),
      /^Error: DEPENDENCY_INVENTORY_REJECTED$/,
    );
  assert.throws(
    () => render([texts[0], ' '.repeat(131073), texts[2]]),
    /DEPENDENCY_INVENTORY_REJECTED/,
  );
  assert.throws(
    () => render([texts[0], texts[1], ' '.repeat(262145)]),
    /DEPENDENCY_INVENTORY_REJECTED/,
  );
  assert.equal(matchesDependencyInventory(render(), render()), true);
  for (const value of [
    undefined,
    null,
    {},
    '',
    render().trimEnd(),
    render() + '\n',
    'x'.repeat(262145),
  ])
    assert.equal(matchesDependencyInventory(render(), value), false);
});
test('admitted inventory uses existing runtime and override checks', () => {
  assert.equal(admittedDependencyInventory('11.9.0'), render());
  assert.throws(() => admittedDependencyInventory('0.0.0'), /RUNTIME_MISMATCH/);
});
function run(file, args) {
  return spawnSync(process.execPath, [file, ...args], {
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 262144,
    shell: false,
  });
}
test('fixed CLI emits deterministic JSON and rejects extra args without echo', () => {
  const script = resolve(root, 'scripts/dependency-inventory.mjs');
  const unchanged = [...names, 'dependency-inventory.json'].map((name) =>
    readFileSync(resolve(root, name)),
  );
  const actual = run(script, ['--json', '11.9.0']);
  assert.equal(actual.status, 0);
  assert.equal(actual.stderr, '');
  assert.equal(actual.stdout, render());
  for (const args of [
    [],
    ['--write', '11.9.0'],
    ['--json', '0.0.0'],
    ['--json', '11.9.0', 'secret-canary'],
  ]) {
    const denied = run(script, args);
    assert.equal(denied.status, 1);
    assert.equal(denied.stdout, 'DEPENDENCY_INVENTORY_FAILED\n');
    assert.equal(denied.stderr, '');
  }
  assert.deepEqual(
    [...names, 'dependency-inventory.json'].map((name) => readFileSync(resolve(root, name))),
    unchanged,
  );
});
test('actual fixed-file checker fails on missing and stale evidence in an owned fixture', () => {
  const parent = resolve(root, '.test-output');
  mkdirSync(parent, { recursive: true });
  const checkParent = () => {
    assert.equal(lstatSync(parent).isSymbolicLink(), false);
    assert.equal(realpathSync(parent), resolve(realpathSync(root), '.test-output'));
  };
  checkParent();
  const dir = mkdtempSync(resolve(parent, 'fonesi-auto-inventory-'));
  try {
    const desktop = resolve(dir, 'desktop'),
      previous = resolve(dir, 'tools/phase-00/desktop-stack-lab');
    mkdirSync(resolve(desktop, 'scripts'), { recursive: true });
    mkdirSync(previous, { recursive: true });
    for (const name of [...names, 'biome-review.json'])
      copyFileSync(resolve(root, name), resolve(desktop, name));
    for (const name of ['dependency-inventory.mjs', 'verify-dependencies.mjs'])
      copyFileSync(resolve(root, 'scripts', name), resolve(desktop, 'scripts', name));
    for (const name of ['package-lock.json', 'dependency-review.json'])
      copyFileSync(
        resolve(root, '../tools/phase-00/desktop-stack-lab', name),
        resolve(previous, name),
      );
    const script = resolve(desktop, 'scripts/dependency-inventory.mjs');
    for (const content of [
      null,
      render() + '\n',
      '\uFEFF' + render(),
      'x'.repeat(262145),
      Buffer.from([0xff]),
      render(),
    ]) {
      if (content !== null) writeFileSync(resolve(desktop, 'dependency-inventory.json'), content);
      const actual = run(script, ['--check', '11.9.0']);
      assert.equal(actual.status, content === render() ? 0 : 1);
      assert.equal(
        actual.stdout,
        content === render() ? 'DEPENDENCY_INVENTORY_PASS\n' : 'DEPENDENCY_INVENTORY_FAILED\n',
      );
      assert.equal(actual.stderr, '');
    }
    // A synthetic verifier exposes ordering without reading invalid inputs itself.
    writeFileSync(
      resolve(desktop, 'scripts/verify-dependencies.mjs'),
      "export function verify() { console.log('UNEXPECTED_VERIFIER'); throw new Error('UNEXPECTED_VERIFIER'); }\n",
    );
    for (const [path, limit] of [
      ['package.json', 16384],
      ['package-lock.json', 131072],
      ['dependency-review.json', 262144],
      ['biome-review.json', 65536],
      ['../tools/phase-00/desktop-stack-lab/package-lock.json', 131072],
      ['../tools/phase-00/desktop-stack-lab/dependency-review.json', 262144],
    ]) {
      const target = resolve(desktop, path),
        original = readFileSync(target);
      writeFileSync(target, 'x'.repeat(limit + 1));
      for (const kind of ['oversized', 'directory']) {
        if (kind === 'directory') {
          rmSync(target);
          mkdirSync(target);
        }
        const denied = run(script, ['--json', '11.9.0']);
        assert.equal(denied.status, 1);
        assert.equal(denied.stdout, 'DEPENDENCY_INVENTORY_FAILED\n');
        assert.equal(denied.stderr, '');
      }
      rmSync(target, { recursive: true });
      writeFileSync(target, original);
    }
  } finally {
    checkParent();
    assert.equal(lstatSync(dir).isSymbolicLink(), false);
    assert.equal(realpathSync(dir), resolve(realpathSync(parent), basename(dir)));
    rmSync(dir, { recursive: true });
  }
});
test('source checker and build inputs include inventory without runtime consumers or payload changes', () => {
  const runner = readFileSync(resolve(root, 'scripts/check.mjs'), 'utf8');
  assert.match(runner, /\[\s*'DEPENDENCY_INVENTORY',/);
  assert.match(runner, /scripts\/dependency-inventory\.mjs', '--check', npmVersion/);
  const manifest = readFileSync(resolve(root, 'scripts/build-manifest.mjs'), 'utf8');
  assert.match(manifest, /'dependency-inventory\.json'/);
  assert.match(manifest, /'scripts\/dependency-inventory\.mjs'/);
  const source = readFileSync(resolve(root, 'scripts/dependency-inventory.mjs'), 'utf8');
  assert.match(source, /verify\(false, npmVersion\)/);
  assert.doesNotMatch(source, /writeFile|spawn|execFile|fetch\(|https\.request/);
  assert.doesNotMatch(source, /(?:from\s+|import\s*\(|require\s*\()\s*['"][^'"]*node_modules\//);
  for (const path of [
    'src/main.ts',
    'src/preload.ts',
    'src/renderer.tsx',
    'scripts/build-package.mjs',
    'launch/package-admission.cjs',
  ])
    assert.equal(readFileSync(resolve(root, path), 'utf8').includes('dependency-inventory'), false);
});
test('phase11 source workflow has exact branch, bounded restore and no runtime or publication', () => {
  const workflow = readFileSync(
    resolve(root, '../.github/workflows/phase-11-dependency-inventory.yml'),
    'utf8',
  );
  assert.match(workflow, /branches: \[phase-11\]/);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/phase-11'/);
  assert.match(workflow, /runs-on: windows-2022/);
  assert.match(workflow, /timeout-minutes: 15/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /package-manager-cache: false/);
  assert.match(workflow, /node desktop\/scripts\/check\.mjs --restore/);
  assert.doesNotMatch(
    workflow,
    /upload-artifact|download-artifact|pull_request_target|secrets\.|Invoke-|npm (?:install|run)|contents: write/,
  );
  const actions = [...workflow.matchAll(/uses: ([^\s]+)/g)].map((match) => match[1]);
  assert.deepEqual(actions, [
    'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803',
    'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1',
  ]);
});
