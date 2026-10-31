'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const helper = path.join(__dirname, 'persistence-matrix-control.cjs');
const environment = { ...process.env };
delete environment.NODE_OPTIONS;
delete environment.NODE_PATH;
test('matrix preflight rejects unknown command, boundary, stage and extra arguments with fixed output', () => {
  for (const args of [
    [],
    ['unknown'],
    ['prepare-store', 'unused', 'source', 'OTHER', 'crash'],
    ['prepare-store', 'unused', 'source', 'BEFORE_COMMIT', 'other'],
    ['prepare-store', 'unused', 'source', 'BEFORE_COMMIT', 'crash', 'extra'],
  ]) {
    const result = spawnSync(process.execPath, [helper, ...args], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 4096,
      env: environment,
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, 'PERSISTENCE_MATRIX_PREPARE_FAILED\n');
    assert.equal(result.stderr, '');
    assert.equal(result.error, undefined);
  }
});
