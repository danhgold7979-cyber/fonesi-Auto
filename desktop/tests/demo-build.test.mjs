import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { DEMO_INPUTS } from '../demo/runtime-contract.ts';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  lstatSync,
  realpathSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  inputs,
  outputs,
  createDemoManifest,
  verifyDemoBuild,
  scanProductionPayload,
  scanProductionBytes,
  scanProductionSource,
} from '../scripts/demo-build-manifest.mjs';
import { outputs as productionOutputs } from '../scripts/build-manifest.mjs';
import { inventory, readMap, validateGraph } from '../scripts/check-module-graph.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function owned(action) {
  const parent = resolve(root, '.test-output');
  const stat = lstatSync(parent);
  assert.equal(stat.isDirectory() && !stat.isSymbolicLink(), true);
  assert.equal(realpathSync.native(parent), parent);
  const path = realpathSync.native(mkdtempSync(resolve(parent, 'demo-build-')));
  try {
    return action(path);
  } finally {
    rmSync(path, { recursive: true });
  }
}
function seed(path) {
  for (const file of inputs) {
    mkdirSync(dirname(resolve(path, file)), { recursive: true });
    writeFileSync(resolve(path, file), 'owned synthetic build input');
  }
  mkdirSync(resolve(path, 'demo-build'));
  for (const file of outputs)
    writeFileSync(resolve(path, 'demo-build', file), 'owned synthetic output');
  writeFileSync(
    resolve(path, 'demo-build/.verified-demo-build.json'),
    JSON.stringify(createDemoManifest(path)),
  );
}
test('demo manifest binds exact mode, current input/output bytes and closed output inventory', () =>
  owned((path) => {
    seed(path);
    assert.equal(verifyDemoBuild(path), true);
    const marker = resolve(path, 'demo-build/.verified-demo-build.json');
    const original = readFileSync(marker);
    const changed = JSON.parse(original);
    changed.mode = 'PRODUCTION';
    writeFileSync(marker, JSON.stringify(changed));
    assert.equal(verifyDemoBuild(path), false);
    writeFileSync(marker, original);
    writeFileSync(resolve(path, 'demo-build/extra.js'), 'unknown');
    assert.equal(verifyDemoBuild(path), false);
    rmSync(resolve(path, 'demo-build/extra.js'));
    writeFileSync(resolve(path, inputs[0]), 'changed input');
    assert.equal(verifyDemoBuild(path), false);
  }));
test('demo output tamper or missing output rejects without silently refreshing manifest', () =>
  owned((path) => {
    seed(path);
    writeFileSync(resolve(path, 'demo-build/renderer.js'), 'changed');
    assert.equal(verifyDemoBuild(path), false);
    rmSync(resolve(path, 'demo-build/demo.css'));
    assert.equal(verifyDemoBuild(path), false);
  }));
test('production payload scanner rejects injected canary, namespaced IDs and unknown demo files', () =>
  owned((path) => {
    for (const file of [...productionOutputs, '.verified-build.json'])
      writeFileSync(resolve(path, file), 'production synthetic bytes');
    assert.equal(scanProductionPayload(path), true);
    writeFileSync(resolve(path, 'renderer.js'), 'FONESI_DEMO_FIXTURE_BUNDLE_20261031_V1');
    assert.throws(() => scanProductionPayload(path), /PRODUCTION_DEMO_LEAK/);
    writeFileSync(resolve(path, 'renderer.js'), 'production synthetic bytes');
    writeFileSync(resolve(path, 'fixtures.cjs'), 'unknown demo file');
    assert.throws(() => scanProductionPayload(path), /DEMO_BUILD_REJECTED/);
    for (const id of [
      'DEMO-DEVICE-1',
      'DEMO-ACCOUNT-1',
      'DEMO-TARGET-1',
      'DEMO-SERIAL-1',
      'DEMO-MEDIA-01',
      'DEMO-JOB-1',
    ])
      assert.throws(() => scanProductionBytes(Buffer.from(id)), /PRODUCTION_DEMO_LEAK/);
  }));
test('production registered graph rejects injected demo imports before any bundler resolution', async () => {
  const sources = inventory(resolve(root, 'src'));
  const map = readMap(resolve(root, 'module-map.json'));
  for (const prefix of [
    "import { DEMO_SNAPSHOT } from '../demo/fixtures.js';\n",
    "import type { Demo } from '../demo/fixtures.js';\n",
  ]) {
    await assert.rejects(
      validateGraph({ ...sources, 'renderer.tsx': prefix + sources['renderer.tsx'] }, map),
      /EDGE_DENIED/,
    );
  }
});
test('current production source payload contains no demo canary or forbidden provider path', () => {
  assert.equal(scanProductionSource(root), true);
});

test('separate demo graph admits exact shared UI closure but rejects privileged renderer imports', async () => {
  const { demoSources } = await import('../scripts/build-demo.mjs');
  const sources = demoSources(root);
  const map = readMap(resolve(root, 'demo-module-map.json'));
  await validateGraph(sources, map);
  for (const prefix of [
    "import { app } from 'electron';\n",
    "import type { DatabaseSync } from 'node:sqlite';\n",
    "import { FoundationDatabase } from '../src/main/foundation-database.js';\n",
  ]) {
    await assert.rejects(
      validateGraph(
        { ...sources, 'demo/renderer.tsx': prefix + sources['demo/renderer.tsx'] },
        map,
      ),
      /EDGE_DENIED/,
    );
  }
  await assert.rejects(
    validateGraph(
      {
        ...sources,
        'demo/renderer.tsx': `${sources['demo/renderer.tsx']}\nif(false) import('../src/main.ts');`,
      },
      map,
    ),
    /DYNAMIC_OR_LATE_IMPORT|LEXICAL_UNSUPPORTED/,
  );
});

test('demo runtime and builder bind the identical fixed input schema', () => {
  assert.deepEqual([...DEMO_INPUTS], [...inputs]);
});

test('virtual graph entries remain registered from actual desktop cwd with matching disk paths', () => {
  const buildUrl = pathToFileURL(resolve(root, 'scripts/build-demo.mjs')).href;
  const graphUrl = pathToFileURL(resolve(root, 'scripts/check-module-graph.mjs')).href;
  const code = `import{demoSources}from ${JSON.stringify(buildUrl)};import{readMap,verifyRuntimeGraph}from ${JSON.stringify(graphUrl)};await verifyRuntimeGraph(demoSources(${JSON.stringify(root)}),readMap(${JSON.stringify(resolve(root, 'demo-module-map.json'))}));console.log('DEMO_CWD_GRAPH_PASS');`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 65536,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.error, undefined);
  assert.equal(result.stdout.trim(), 'DEMO_CWD_GRAPH_PASS');
  const source = readFileSync(resolve(root, 'scripts/build-demo.mjs'), 'utf8');
  assert.ok(source.includes("entryPoints: ['demo-entry:demo/main.ts']"));
  assert.ok(source.includes("entryPoints: ['demo-entry:demo/renderer.tsx']"));
});
