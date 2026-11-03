import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceStagePolicy } from '../scripts/stage-vision-source.mjs';
const valid = {
  platform: 'win32',
  arch: 'x64',
  node: '24.22.1',
  root: 'D:\\a\\_temp\\fonesi-p4-windows-candidate-v1',
  overrides: false,
  build: true,
  argv: 3,
  nodeHash: 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5',
};
test('source staging policy selects only the fixed Windows tool and root', () => {
  assert.equal(sourceStagePolicy(valid), true);
  for (const delta of [
    { platform: 'linux' },
    { arch: 'arm64' },
    { node: '24.22.2' },
    { root: 'D:\\other' },
    { overrides: true },
    { build: false },
    { argv: 2 },
    { nodeHash: '0'.repeat(64) },
  ])
    assert.equal(sourceStagePolicy({ ...valid, ...delta }), false);
});
