import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectSource, checkGraph } from '../scripts/check-boundaries.mjs';
const good = new Map([
  ['types.ts', "export type Name = 'fixture';\n"],
  ['consumer.ts', "import type { Name } from './types.js';\nexport type Alias = Name;\n"],
]);
test('type-only sibling graph accepted', () => assert.equal(checkGraph(good), 'BOUNDARIES_PASS'));
test('comments and inert strings are not imports', () =>
  assert.equal(
    inspectSource("// import 'node:fs';\nexport const marker = 'import';\n").code,
    'SOURCE_ALLOWED',
  ));
for (const [name, source] of Object.entries({
  builtin: "import fs from 'node:fs';",
  platform: "import type { App } from 'electron';",
  tooling: "import type { Tool } from '../scripts/tool.js';",
  fixture: "import type { Test } from '../tests/test.js';",
  traversal: "import type { Name } from './sub/../types.js';",
  reexport: "export { Name } from './types.js';",
  wildcard: "export * from './types.js';",
  dynamic: "void import('./types.js');",
  require: "require('node:fs');",
  importEquals: "import fs = require('node:fs');",
  importType: "export type T = import('./types.js').Name;",
  importMeta: 'export const x = import.meta;',
  encoded: "import type { Name } from '.\\x2ftypes.js';",
  escapedIdentifier: 'const pr\\u006fcess = 1;',
  template: 'export const x = `hello`;',
  regex: 'export const x = /hello/;',
  suppression: '// @ts-ignore\nexport const x = 1;',
  reference: '/// <reference types="node" />',
  ambient: 'declare const process: unknown;',
  process: 'process.exit(0);',
  global: 'globalThis.fetch("x");',
  constructor: 'Object.constructor("x");',
  malformed: 'export const x = "unterminated;',
}))
  test(`reject ${name}`, () => assert.notEqual(inspectSource(source).code, 'SOURCE_ALLOWED'));
test('missing import target rejected', () =>
  assert.equal(
    checkGraph(new Map([['a.ts', "import type { B } from './b.js';"]])),
    'IMPORT_TARGET_MISSING',
  ));
test('type-only cycle rejected', () =>
  assert.equal(
    checkGraph(
      new Map([
        ['a.ts', "import type { B } from './b.js';"],
        ['b.ts', "import type { A } from './a.js';"],
      ]),
    ),
    'IMPORT_CYCLE',
  ));
test('declaration file rejected', () =>
  assert.equal(checkGraph(new Map([['a.d.ts', 'export {};']])), 'SOURCE_NAME_REJECTED'));
test('oversized source rejected', () =>
  assert.equal(inspectSource(' '.repeat(65537)).code, 'SOURCE_TOO_LARGE'));
