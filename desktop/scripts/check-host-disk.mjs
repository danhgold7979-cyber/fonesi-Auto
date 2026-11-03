import assert from 'node:assert/strict';
import { mkdtempSync, lstatSync, realpathSync, statfsSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { verifyBuild } from './build-manifest.mjs';
import { createHostResourceSampler } from '../src/main/host-resource-sampler.ts';
import { parseHostResourceResponse } from '../src/host-resource-contract.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deadline = setTimeout(() => {
  console.log('HOST_DISK_WINDOWS_DEADLINE_NOT_RETIRED');
  process.exit(1);
}, 15000);
deadline.unref();
let owned = null,
  identity = null,
  sampler = null;
try {
  if (
    process.argv.length !== 2 ||
    process.platform !== 'win32' ||
    process.arch !== 'x64' ||
    process.versions.node !== '24.22.1' ||
    Object.keys(process.env).some((key) =>
      ['NODE_OPTIONS', 'NODE_PATH'].includes(key.toUpperCase()),
    )
  )
    throw new Error('RUNTIME_NOT_ADMITTED');
  if (!verifyBuild(root)) throw new Error('BUILD_NOT_VERIFIED');
  owned = mkdtempSync(resolve(tmpdir(), 'fonesi-host-disk-'));
  identity = realpathSync(owned);
  const direct = statfsSync(owned, { bigint: true });
  let dataRoot = owned;
  // Fixed production worker bytes; the factory injection selects only this verified bundle.
  sampler = createHostResourceSampler({
    dataRoot: () => dataRoot,
    spawn: (sequence, selectedRoot) =>
      new Worker(resolve(root, 'build/host-resource-worker.cjs'), {
        workerData: { sequence, dataRoot: selectedRoot },
        execArgv: [],
        env: {},
      }),
  });
  const owner = {};
  const observed = parseHostResourceResponse(await sampler.sample('h1', owner, () => true));
  assert.equal(observed?.code, 'OK');
  assert.ok(sampler.retired);
  assert.ok(observed.remainingFreshMs > 0 && observed.remainingFreshMs < 5000);
  const disk = observed.sample.metrics;
  assert.equal(disk.totalDisk.code, 'OK');
  assert.equal(disk.totalDisk.value, Number(direct.bsize * direct.blocks));
  assert.equal(disk.availableDisk.code, 'OK');
  assert.ok(Number.isSafeInteger(disk.availableDisk.value));
  assert.ok(disk.availableDisk.value >= 0 && disk.availableDisk.value <= disk.totalDisk.value);
  assert.ok(!JSON.stringify(observed).includes(owned));
  console.log('HOST_DISK_WINDOWS_OWNED_BUNDLE_PASS');
  dataRoot = null;
  const absent = parseHostResourceResponse(await sampler.sample('h2', owner, () => true));
  assert.equal(absent?.code, 'OK');
  assert.equal(absent.sample.metrics.availableDisk.code, 'DATA_VOLUME_UNAVAILABLE');
  assert.equal(absent.sample.metrics.availableDisk.value, null);
  assert.equal(absent.sample.metrics.freeRam.code, 'OK');
  assert.ok(sampler.retired);
  console.log('HOST_DISK_WINDOWS_ABSENT_ROOT_PASS');
  dataRoot = resolve(owned, 'never-created');
  const missing = parseHostResourceResponse(await sampler.sample('h3', owner, () => true));
  assert.equal(missing?.code, 'OK');
  assert.equal(missing.sample.metrics.availableDisk.code, 'PROBE_FAILED');
  assert.equal(missing.sample.metrics.availableDisk.value, null);
  assert.equal(missing.sample.metrics.freeRam.code, 'OK');
  assert.ok(sampler.retired);
  assert.ok(!JSON.stringify(missing).includes(dataRoot));
  console.log('HOST_DISK_WINDOWS_MISSING_ROOT_PASS');
  dataRoot = owned;
  const pending = sampler.sample('h4', owner, () => true);
  assert.equal(sampler.cancel('h4', owner), true);
  assert.equal(parseHostResourceResponse(await pending)?.code, 'CANCELLED');
  await sampler.close();
  assert.ok(sampler.retired);
  console.log('HOST_DISK_WINDOWS_CANCEL_DRAIN_PASS');
  console.log('HOST_DISK_WINDOWS_NODE_24_22_1_PASS_4');
  console.log('HOST_DISK_ELECTRON_RUNTIME_NOT_RUN');
} catch {
  console.log('HOST_DISK_WINDOWS_FAILED');
  process.exitCode = 1;
} finally {
  await sampler?.close();
  if (owned !== null) {
    try {
      const stat = lstatSync(owned);
      if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(owned) !== identity) {
        console.log('HOST_DISK_OWNED_CLEANUP_FAILED');
        process.exitCode = 1;
      } else {
        rmdirSync(owned);
        console.log('HOST_DISK_OWNED_DIRECTORY_RETIRED');
      }
    } catch {
      console.log('HOST_DISK_OWNED_CLEANUP_FAILED');
      process.exitCode = 1;
    }
  }
  clearTimeout(deadline);
}
