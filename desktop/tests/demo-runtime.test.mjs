import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  lstatSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { maintenanceArgument } from '../src/persistence-contract.ts';
import { admitDemoRuntime, DEMO_OUTPUTS, DEMO_INPUTS } from '../demo/runtime-contract.ts';
const base = fileURLToPath(new URL('../.test-output', import.meta.url));
function fixture(run) {
  try {
    mkdirSync(base);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  assert.equal(lstatSync(base).isSymbolicLink(), false);
  assert.equal(realpathSync.native(base), base);
  const root = mkdtempSync(join(base, 'demo-runtime-'));
  try {
    const output = join(root, 'demo-build'),
      owner = join(root, 'session'),
      profile = join(owner, 'profile');
    mkdirSync(output);
    mkdirSync(owner);
    mkdirSync(profile);
    const ownerToken = randomUUID();
    writeFileSync(
      join(owner, '.demo-owner.json'),
      JSON.stringify({ version: 1, kind: 'FONESI_DEMO', ownerToken }),
      { flag: 'wx' },
    );
    const outputs = {};
    for (const name of DEMO_OUTPUTS) {
      const bytes = Buffer.from(`owned synthetic ${name}`);
      writeFileSync(join(output, name), bytes, { flag: 'wx' });
      outputs[name] = createHash('sha256').update(bytes).digest('hex');
    }
    writeFileSync(
      join(output, '.verified-demo-build.json'),
      JSON.stringify({
        version: 1,
        mode: 'DEMO',
        inputs: Object.fromEntries(DEMO_INPUTS.map((key) => [key, '0'.repeat(64)])),
        outputs,
      }),
      { flag: 'wx' },
    );
    const entry = join(output, 'main.cjs');
    const input = {
      entry,
      argv: ['electron.exe', entry, '--demo'],
      profile,
      platform: 'win32',
      arch: 'x64',
      electron: '45.1.0',
      node: '24.22.1',
      chrome: '156.0.8078.49',
      environment: {},
    };
    run({ root, owner, output, profile, input, ownerToken });
  } finally {
    assert.equal(realpathSync.native(root), root);
    assert.equal(lstatSync(root).isSymbolicLink(), false);
    rmSync(root, { recursive: true, force: false });
  }
}
test('demo admission binds exact manifest/runtime/argv and fresh owned profile', () =>
  fixture(({ input, ownerToken }) => {
    const admitted = admitDemoRuntime(input);
    assert.equal(admitted.profile, input.profile);
    assert.equal(admitted.ownerToken, ownerToken);
    assert.deepEqual(Object.keys(admitted.assets), [...DEMO_OUTPUTS]);
    for (const patch of [
      { argv: [input.argv[0], input.entry] },
      { argv: [...input.argv, '--inspect'] },
      { argv: [input.argv[0], input.entry, '--DEMO'] },
      { platform: 'linux' },
      { electron: '45.1.1' },
      { environment: { NODE_OPTIONS: '--inspect' } },
      { environment: { ELECTRON_RUN_AS_NODE: '1' } },
    ])
      assert.throws(() => admitDemoRuntime({ ...input, ...patch }), /DEMO_ADMISSION_REJECTED/);
  }));
test('demo refuses modified outputs/foreign marker and nonempty profile without altering them', () =>
  fixture(({ input, output, owner, profile }) => {
    const target = join(output, 'renderer.js'),
      original = readFileSync(target);
    writeFileSync(target, 'tampered');
    assert.throws(() => admitDemoRuntime(input), /DEMO_ADMISSION_REJECTED/);
    assert.equal(readFileSync(target, 'utf8'), 'tampered');
    writeFileSync(target, original);
    const marker = join(owner, '.demo-owner.json'),
      saved = readFileSync(marker);
    writeFileSync(
      marker,
      JSON.stringify({ version: 1, kind: 'PRODUCTION', ownerToken: randomUUID() }),
    );
    assert.throws(() => admitDemoRuntime(input), /DEMO_ADMISSION_REJECTED/);
    writeFileSync(marker, saved);
    writeFileSync(join(profile, 'existing'), 'retained');
    assert.throws(() => admitDemoRuntime(input), /DEMO_ADMISSION_REJECTED/);
    assert.equal(readFileSync(join(profile, 'existing'), 'utf8'), 'retained');
  }));
test('demo closed inventory rejects unknown output and environment is never a mode selector', () =>
  fixture(({ input, output }) => {
    assert.ok(admitDemoRuntime({ ...input, environment: { DEMO: '0', MOCK: 'production' } }));
    assert.throws(
      () =>
        admitDemoRuntime({
          ...input,
          argv: [input.argv[0], input.entry],
          environment: { DEMO: '1', MOCK: '1' },
        }),
      /DEMO_ADMISSION_REJECTED/,
    );
    writeFileSync(join(output, 'unexpected'), 'retained', { flag: 'wx' });
    assert.throws(() => admitDemoRuntime(input), /DEMO_ADMISSION_REJECTED/);
  }));
test('demo rejects duplicate ownership/mode keys and wrong input hash schema', () =>
  fixture(({ input, output, owner }) => {
    const marker = join(owner, '.demo-owner.json'),
      originalMarker = readFileSync(marker, 'utf8');
    writeFileSync(marker, originalMarker.replace('{', '{"version":0,'));
    assert.throws(() => admitDemoRuntime(input), /DEMO_ADMISSION_REJECTED/);
    writeFileSync(marker, originalMarker);
    const file = join(output, '.verified-demo-build.json'),
      original = readFileSync(file, 'utf8');
    writeFileSync(file, original.replace('{', '{"mode":"PRODUCTION",'));
    assert.throws(() => admitDemoRuntime(input), /DEMO_ADMISSION_REJECTED/);
    const manifest = JSON.parse(original);
    delete manifest.inputs[DEMO_INPUTS[0]];
    writeFileSync(file, JSON.stringify(manifest));
    assert.throws(() => admitDemoRuntime(input), /DEMO_ADMISSION_REJECTED/);
    manifest.inputs[DEMO_INPUTS[0]] = 'not-a-hash';
    writeFileSync(file, JSON.stringify(manifest));
    assert.throws(() => admitDemoRuntime(input), /DEMO_ADMISSION_REJECTED/);
  }));
test('demo output admission bounds aggregate bytes even when each file hash is valid', () =>
  fixture(({ input, output }) => {
    const file = join(output, '.verified-demo-build.json'),
      manifest = JSON.parse(readFileSync(file, 'utf8'));
    for (const name of ['main.cjs', 'renderer.js']) {
      const raw = Buffer.alloc(5 * 1024 * 1024, 65);
      writeFileSync(join(output, name), raw);
      manifest.outputs[name] = createHash('sha256').update(raw).digest('hex');
    }
    writeFileSync(file, JSON.stringify(manifest));
    assert.throws(() => admitDemoRuntime(input), /DEMO_ADMISSION_REJECTED/);
  }));

test('demo exact input inventory rejects delimiter-merged keys and unknown owner entries', () =>
  fixture(({ input, output, owner }) => {
    const file = join(output, '.verified-demo-build.json'),
      manifest = JSON.parse(readFileSync(file, 'utf8'));
    const [first, second] = [...DEMO_INPUTS].sort();
    delete manifest.inputs[first];
    delete manifest.inputs[second];
    manifest.inputs[`${first}|${second}`] = '0'.repeat(64);
    writeFileSync(file, JSON.stringify(manifest));
    assert.throws(() => admitDemoRuntime(input), /DEMO_ADMISSION_REJECTED/);
    delete manifest.inputs[`${first}|${second}`];
    manifest.inputs[first] = '0'.repeat(64);
    manifest.inputs[second] = '0'.repeat(64);
    writeFileSync(file, JSON.stringify(manifest));
    writeFileSync(join(owner, 'unknown'), 'retained', { flag: 'wx' });
    assert.throws(() => admitDemoRuntime(input), /DEMO_ADMISSION_REJECTED/);
    assert.equal(readFileSync(join(owner, 'unknown'), 'utf8'), 'retained');
  }));

test('the production argument parser refuses the separate demo entry literal', () => {
  assert.equal(maintenanceArgument(['--demo']), null);
  assert.equal(maintenanceArgument([]), 'NORMAL');
});
