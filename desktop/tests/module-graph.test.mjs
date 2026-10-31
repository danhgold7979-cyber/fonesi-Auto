import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync,
  mkdtempSync,
  writeFileSync,
  unlinkSync,
  rmdirSync,
  symlinkSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  inventory,
  localTarget,
  sourceImports,
  validateGraph,
  verifyRuntimeGraph,
} from '../scripts/check-module-graph.mjs';
const root = fileURLToPath(new URL('../src', import.meta.url));
const map = JSON.parse(readFileSync(new URL('../module-map.json', import.meta.url), 'utf8'));
const actual = () => inventory(root);
const denied = async (sources, pattern) =>
  assert.rejects(() => validateGraph(sources, map), pattern);
test('actual nineteen modules pass source and restricted parser runtime graph', async () => {
  assert.deepEqual(await verifyRuntimeGraph(actual(), map), { modules: 19, runtimeInputs: 19 });
});
test('renderer cannot import native, Electron, or main-owned profile services', async () => {
  for (const statement of [
    "import { readFileSync } from 'node:fs';",
    "import { ipcRenderer } from 'electron';",
    "import { prepareOwnedProfile } from './main/profile-owner.js';",
  ]) {
    await denied(
      { ...actual(), 'renderer.tsx': `${statement}\n${actual()['renderer.tsx']}` },
      /EDGE_DENIED/,
    );
  }
});
test('preload cannot gain additional Electron bindings or import main', async () => {
  await denied(
    { ...actual(), 'preload.ts': "import { shell } from 'electron';" },
    /BINDING_DENIED/,
  );
  await denied({ ...actual(), 'preload.ts': "import { app } from './main.js';" }, /EDGE_DENIED/);
});
test('type-only Electron imports cannot become runtime bindings', async () => {
  const sources = actual();
  sources['foundation-bridge.ts'] = sources['foundation-bridge.ts'].replace(
    'import type {',
    'import {',
  );
  await denied(sources, /BINDING_DENIED/);
});
test('mixed type and value bindings remain distinguishable', async () => {
  assert.deepEqual(
    await sourceImports("import { ViewSession, type Caller } from './view-session.js';"),
    [{ specifier: './view-session.js', bindings: { ViewSession: 'value', Caller: 'type' } }],
  );
  const sources = actual();
  sources['foundation-bridge.ts'] = sources['foundation-bridge.ts'].replace(
    'type Caller',
    'Caller',
  );
  await denied(sources, /BINDING_DENIED/);
});
test('contracts cannot import tests/tooling or unreviewed external packages', async () => {
  for (const specifier of ['../scripts/check-module-graph.mjs', 'unexpected-package'])
    await denied(
      { ...actual(), 'ipc-contract.ts': `import { value } from '${specifier}';` },
      /EDGE_DENIED/,
    );
});
test('unknown sources and absent registered sources reject', async () => {
  await denied({ ...actual(), 'unknown.ts': 'export const value=1;' }, /SOURCE_INVENTORY/);
  const sources = actual();
  delete sources['main.ts'];
  await denied(sources, /SOURCE_INVENTORY/);
});
test('escaped absolute query and missing imports reject', async () => {
  for (const specifier of ['node:\\x66s', '/outside.ts', './ipc-contract.js?x', './missing.js'])
    await denied(
      { ...actual(), 'preload-client.ts': `import { value } from '${specifier}';` },
      /IMPORT_SPECIFIER|EDGE_DENIED/,
    );
});
test('dynamic loaders reject before runtime dead-code erasure', async () => {
  for (const source of [
    "if (false) import('node:fs');",
    "const load = require('node:fs');",
    "const load = requ\\u0069re('node:fs');",
    "const target='node:fs'; import(target);",
    'const value = `text $' + "{import('node:fs')}`;",
  ])
    await assert.rejects(
      () => sourceImports(source),
      /DYNAMIC_OR_LATE_IMPORT|REQUIRE_REJECTED|LEXICAL_UNSUPPORTED/,
    );
});
test('unsupported default namespace alias import-equals and reexports reject', async () => {
  for (const source of [
    "import fs from 'node:fs';",
    "import * as fs from 'node:fs';",
    "import {x as y} from 'react';",
    "import fs = require('node:fs');",
    "export { x } from 'node:fs';",
  ])
    await assert.rejects(() => sourceImports(source), /IMPORT_SYNTAX|REEXPORT_UNSUPPORTED/);
});
test('comments strings regex templates and actual JSX do not fabricate imports', async () => {
  assert.deepEqual(
    await sourceImports(
      '// import("x")\nconst text = "require import"; const regex = /import\\("x"\\)/; const template = `import require`;',
    ),
    [],
  );
  assert.equal((await sourceImports(actual()['renderer.tsx'], 'tsx')).length, 2);
});
test('allowed-edge value and type cycles are independently rejected', async () => {
  for (const kind of ['value', 'type']) {
    const prefix = kind === 'type' ? 'type ' : '';
    const declaration = kind === 'type' ? 'type' : 'const';
    const value = kind === 'type' ? 'string' : '1';
    const sources = {
      'a.ts': `import ${prefix}{ B } from './b.js'; export ${declaration} A = ${value};`,
      'b.ts': `import ${prefix}{ A } from './a.js'; export ${declaration} B = ${value};`,
    };
    const fixture = {
      schemaVersion: 1,
      modules: {
        'a.ts': { role: 'contract', imports: { './b.js': { B: kind } } },
        'b.ts': { role: 'contract', imports: { './a.js': { A: kind } } },
      },
    };
    await assert.rejects(() => validateGraph(sources, fixture), /IMPORT_CYCLE/);
  }
});
test('transitive public-to-privileged graph rejects despite individual declared edges', async () => {
  const sources = {
    'ui.ts': "import { value } from './shared.js';",
    'shared.ts': "import { owned } from './native.js';",
    'native.ts': 'export const owned=1;',
  };
  const fixture = {
    schemaVersion: 1,
    modules: {
      'ui.ts': { role: 'renderer', imports: { './shared.js': { value: 'value' } } },
      'shared.ts': { role: 'contract', imports: { './native.js': { owned: 'value' } } },
      'native.ts': { role: 'main-adapter', imports: {} },
    },
  };
  await assert.rejects(() => validateGraph(sources, fixture), /LAYER_DENIED/);
});
test('inventory rejects symlinks without following them', () => {
  const directory = mkdtempSync(join(tmpdir(), 'auto-module-graph-'));
  const file = join(directory, 'owned.ts');
  try {
    writeFileSync(file, 'export const value=1;', { flag: 'wx' });
    // Directory junction is available on Windows without developer-mode symlink privilege.
    const nested = join(directory, 'linked');
    symlinkSync(directory, nested, process.platform === 'win32' ? 'junction' : 'dir');
    try {
      assert.throws(() => inventory(directory), /SOURCE_LINK/);
    } finally {
      unlinkSync(nested);
    }
  } finally {
    unlinkSync(file);
    rmdirSync(directory);
  }
});

test('ambiguous JSX quote/comment/template text cannot hide erased loaders', async () => {
  for (const source of [
    `export const x = <div>"{false && import('node:fs')}"</div>;`,
    `export const x = <div>"{false && "x" && import('node:fs')}"</div>;`,
    `export const x = <div>"{false && "x" && require('node:fs')}"</div>;`,
    `export const x = <div>/*{false && import('node:fs')}*/</div>;`,
    `export const x = <div>'{false && import("node:fs")}'</div>;`,
    `const name='node:fs'; export const x=<div>/*{require(name)}*/</div>;`,
    `const name='node:fs'; export const x=<div> = /{require(name)}/ </div>;`,
    "const name='node:fs'; export const x=<div>/*{requ\\u0069re(name)}*/</div>;",

    "export const x = <div>`{false && require('node:fs')}`</div>;",
  ]) {
    const fixture = { schemaVersion: 1, modules: { 'ui.tsx': { role: 'renderer', imports: {} } } };
    await assert.rejects(
      () => verifyRuntimeGraph({ 'ui.tsx': source }, fixture),
      /LEXICAL_UNSUPPORTED|DYNAMIC_OR_LATE_IMPORT|REQUIRE_REJECTED/,
    );
  }
});

test('TSX loader words in opaque data are explicitly unsupported, not silently treated as safe', async () => {
  await assert.rejects(
    () => sourceImports('export const text="import";', 'tsx'),
    /LEXICAL_UNSUPPORTED/,
  );
  assert.deepEqual(await sourceImports('export const text="import";', 'ts'), []);
});

test('ordinary UI text passes the explicitly limited TSX grammar', async () => {
  const fixture = { schemaVersion: 1, modules: { 'ui.tsx': { role: 'renderer', imports: {} } } };
  assert.deepEqual(
    await verifyRuntimeGraph(
      { 'ui.tsx': 'export const view = <div>Public status unavailable</div>;' },
      fixture,
    ),
    { modules: 1, runtimeInputs: 1 },
  );
});

test('declared local edge still requires an actually registered target', async () => {
  const fixture = {
    schemaVersion: 1,
    modules: { 'a.ts': { role: 'contract', imports: { './missing.js': { value: 'value' } } } },
  };
  await assert.rejects(
    () => validateGraph({ 'a.ts': "import { value } from './missing.js';" }, fixture),
    /MISSING_TARGET/,
  );
});

test('actual filesystem inventory cannot hide an unregistered source', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'auto-module-graph-'));
  const first = join(directory, 'a.ts');
  const extra = join(directory, 'extra.ts');
  try {
    writeFileSync(first, 'export const value = 1;', { flag: 'wx' });
    writeFileSync(extra, 'export const unexpected = 2;', { flag: 'wx' });
    const fixture = { schemaVersion: 1, modules: { 'a.ts': { role: 'contract', imports: {} } } };
    await assert.rejects(() => validateGraph(inventory(directory), fixture), /SOURCE_INVENTORY/);
  } finally {
    unlinkSync(extra);
    unlinkSync(first);
    rmdirSync(directory);
  }
});

test('type-only named and star reexports reject before esbuild can erase them', async () => {
  const fixture = {
    schemaVersion: 1,
    modules: { 'contract.ts': { role: 'contract', imports: {} } },
  };
  for (const source of [
    "export type { Stats } from 'node:fs';",
    "export type * from 'node:fs';",
    "export type * as Fs from 'node:fs';",
  ]) {
    await assert.rejects(
      () => verifyRuntimeGraph({ 'contract.ts': source }, fixture),
      /REEXPORT_UNSUPPORTED/,
    );
  }
  await assert.rejects(
    () => sourceImports('export const text="export";', 'tsx'),
    /LEXICAL_UNSUPPORTED/,
  );
});

test('compiler bypass and external reference directives cannot hide source dependencies', async () => {
  for (const source of [
    '// @ts-nocheck\nexport const value=1;',
    '/// <reference path="../../outside.d.ts" />\nexport const value=1;',
  ]) {
    await assert.rejects(() => sourceImports(source), /DIRECTIVE_REJECTED/);
  }
});

test('actual absent installation fails after a passing owned metadata CLI control', () => {
  const directory = mkdtempSync(join(tmpdir(), 'auto-bootstrap-absence-'));
  const directories = [
    'desktop',
    'desktop/scripts',
    'tools',
    'tools/phase-00',
    'tools/phase-00/desktop-stack-lab',
  ];
  const files = [
    'desktop/package.json',
    'desktop/package-lock.json',
    'desktop/dependency-review.json',
    'desktop/biome-review.json',
    'desktop/scripts/verify-dependencies.mjs',
    'tools/phase-00/desktop-stack-lab/package-lock.json',
    'tools/phase-00/desktop-stack-lab/dependency-review.json',
  ];
  const written = [];
  const created = [];
  const nodeDirectory = dirname(process.execPath);
  const npmCLI =
    process.platform === 'win32'
      ? resolve(nodeDirectory, 'node_modules/npm/bin/npm-cli.js')
      : resolve(nodeDirectory, '../lib/node_modules/npm/bin/npm-cli.js');
  const options = { shell: false, encoding: 'utf8', timeout: 30000, maxBuffer: 65536 };
  try {
    for (const name of directories) {
      mkdirSync(join(directory, name));
      created.push(name);
    }
    for (const name of files) {
      writeFileSync(join(directory, name), readFileSync(resolve(root, '../..', name)), {
        flag: 'wx',
      });
      written.push(name);
    }
    const version = spawnSync(process.execPath, [npmCLI, '--version'], options);
    assert.equal(version.error, undefined);
    assert.equal(version.status, 0);
    const npm = version.stdout.trim();
    assert.ok(['11.9.0', '11.19.1'].includes(npm));
    const script = join(directory, 'desktop/scripts/verify-dependencies.mjs');
    const positive = spawnSync(process.execPath, [script, '--metadata', npm], options);
    assert.equal(positive.error, undefined);
    assert.equal(positive.status, 0);
    assert.equal(positive.stdout.trim(), 'DEPENDENCIES_VERIFIED 78');
    assert.equal(existsSync(join(directory, 'desktop/node_modules')), false);
    const absent = spawnSync(process.execPath, [script, '--installed', npm], options);
    assert.equal(absent.error, undefined);
    assert.equal(absent.status, 1);
    assert.equal(absent.stdout.trim(), 'DEPENDENCY_CHECK_FAILED');
    assert.equal(existsSync(join(directory, 'desktop/node_modules')), false);
    assert.equal(existsSync(join(directory, 'desktop/.npm-cache')), false);
  } finally {
    for (const name of written.reverse()) unlinkSync(join(directory, name));
    for (const name of created.reverse()) rmdirSync(join(directory, name));
    rmdirSync(directory);
  }
});

test('parent-relative edges resolve only exact registered in-root modules', () => {
  const modules = { 'contract.ts': {}, 'main/adapter.ts': {} };
  assert.equal(localTarget('main/adapter.ts', '../contract.ts', modules), 'contract.ts');
  assert.throws(() => localTarget('adapter.ts', '../contract.ts', modules), /LOCAL_SPECIFIER/);
  assert.throws(
    () => localTarget('main/adapter.ts', '../../contract.ts', modules),
    /LOCAL_SPECIFIER/,
  );
  assert.throws(() => localTarget('main/adapter.ts', '../missing.ts', modules), /MISSING_TARGET/);
  assert.throws(
    () => localTarget('main/adapter.ts', '../main/../contract.ts', modules),
    /LOCAL_SPECIFIER/,
  );
});
