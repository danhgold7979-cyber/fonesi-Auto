import { statfsSync, lstatSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { cpus, totalmem, freemem } from 'node:os';
import { cpuUsage, memoryUsage } from 'node:process';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import {
  HOST_METRIC_INFO,
  type HostMetric,
  type HostResourceSample,
} from '../host-resource-contract.ts';

type DiskSpace = Readonly<{
  available: number | null;
  total: number | null;
  code: HostMetric['code'];
}>;
const missingDisk = (code: HostMetric['code']): DiskSpace =>
  Object.freeze({ available: null, total: null, code });
export function calculateDiskSpace(stats: unknown): DiskSpace {
  if (!stats || typeof stats !== 'object') return missingDisk('COUNTER_INVALID');
  const { bsize, blocks, bavail } = stats as Record<string, unknown>;
  if (
    typeof bsize !== 'bigint' ||
    typeof blocks !== 'bigint' ||
    typeof bavail !== 'bigint' ||
    bsize <= 0n ||
    blocks <= 0n ||
    bavail < 0n ||
    bavail > blocks ||
    bsize > BigInt(Number.MAX_SAFE_INTEGER) ||
    blocks > BigInt(Number.MAX_SAFE_INTEGER)
  )
    return missingDisk('COUNTER_INVALID');
  const available = bsize * bavail,
    total = bsize * blocks;
  if (available > BigInt(Number.MAX_SAFE_INTEGER) || total > BigInt(Number.MAX_SAFE_INTEGER))
    return missingDisk('COUNTER_INVALID');
  return Object.freeze({ available: Number(available), total: Number(total), code: 'OK' });
}
export function readDiskSpace(root: string | null): DiskSpace {
  if (root === null) return missingDisk('DATA_VOLUME_UNAVAILABLE');
  try {
    if (
      typeof root !== 'string' ||
      root.length === 0 ||
      root.length > 32767 ||
      root !== resolve(root)
    )
      return missingDisk('PROBE_FAILED');
    const before = lstatSync(root);
    const real = realpathSync(root);
    const equal =
      process.platform === 'win32' ? real.toLowerCase() === root.toLowerCase() : real === root;
    if (!before.isDirectory() || before.isSymbolicLink() || !equal)
      return missingDisk('PROBE_FAILED');
    const observed = calculateDiskSpace(statfsSync(root, { bigint: true }));
    const after = lstatSync(root);
    if (
      !after.isDirectory() ||
      after.isSymbolicLink() ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      realpathSync(root) !== real
    )
      return missingDisk('PROBE_FAILED');
    return observed;
  } catch {
    return missingDisk('PROBE_FAILED');
  }
}

type Counters = Readonly<{ model: string; times: readonly number[] }>;
export type HostCounters = Readonly<{
  utc: number;
  mono: number;
  cpus: readonly Counters[] | null;
  process: Readonly<{ user: number; system: number }> | null;
  total: number | null;
  free: number | null;
  rss: number | null;
  disk?: DiskSpace;
}>;
const valid = (n: number) => Number.isSafeInteger(n) && n >= 0 && !Object.is(n, -0);
const unknown = (
  code: HostMetric['code'] = 'COUNTER_INVALID',
): Pick<HostMetric, 'code' | 'value'> => Object.freeze({ value: null, code });
const observed = (value: number, percent = false): Pick<HostMetric, 'code' | 'value'> =>
  (
    percent
      ? Number.isFinite(value) && value >= 0 && value <= 100 && !Object.is(value, -0)
      : valid(value)
  )
    ? Object.freeze({ value, code: 'OK' })
    : unknown();
function collect(): HostCounters {
  let cores: Counters[] | null = null,
    process: HostCounters['process'] = null;
  let total: number | null = null,
    free: number | null = null,
    rss: number | null = null;
  try {
    const list = cpus();
    if (list.length > 0 && list.length <= 4096)
      cores = list.map((core) => ({
        model: core.model,
        times: [core.times.user, core.times.nice, core.times.sys, core.times.idle, core.times.irq],
      }));
  } catch {}
  try {
    process = cpuUsage();
  } catch {}
  try {
    total = totalmem();
  } catch {}
  try {
    free = freemem();
  } catch {}
  try {
    rss = memoryUsage.rss();
  } catch {}
  return { utc: Date.now(), mono: performance.now(), cpus: cores, process, total, free, rss };
}
export function calculateHostSample(
  first: HostCounters,
  last: HostCounters,
  sequence: number,
): HostResourceSample | null {
  const intervalMs = last.mono - first.mono;
  if (
    !valid(first.utc) ||
    !valid(last.utc) ||
    last.utc < first.utc ||
    !Number.isFinite(intervalMs) ||
    intervalMs < 1000 ||
    intervalMs > 3000 ||
    !valid(sequence) ||
    sequence === 0
  )
    return null;
  let hostCpu = unknown(),
    mainCpu = unknown();
  const a = first.cpus,
    b = last.cpus;
  let topology = !!a && !!b && a.length > 0 && a.length <= 4096 && a.length === b.length;
  let total = 0,
    idle = 0;
  if (topology && a && b)
    for (let i = 0; i < a.length; i++) {
      const before = a[i],
        after = b[i];
      if (
        !before ||
        !after ||
        typeof before.model !== 'string' ||
        before.model.length > 256 ||
        before.model !== after.model ||
        before.times.length !== 5 ||
        after.times.length !== 5
      ) {
        topology = false;
        break;
      }
      for (let j = 0; j < 5; j++) {
        const start = before.times[j],
          end = after.times[j];
        if (
          start === undefined ||
          end === undefined ||
          !valid(start) ||
          !valid(end) ||
          end < start
        ) {
          topology = false;
          break;
        }
        total += end - start;
        if (j === 3) idle += end - start;
      }
      if (!topology) break;
    }
  if (topology && valid(total) && total > 0 && valid(idle) && idle <= total)
    hostCpu = observed(((total - idle) / total) * 100, true);
  if (topology && a && first.process && last.process) {
    const values = [
      first.process.user,
      first.process.system,
      last.process.user,
      last.process.system,
    ];
    if (
      values.every(valid) &&
      last.process.user >= first.process.user &&
      last.process.system >= first.process.system
    ) {
      const delta =
        last.process.user - first.process.user + last.process.system - first.process.system;
      if (valid(delta)) mainCpu = observed((delta / (intervalMs * 1000 * a.length)) * 100, true);
    }
  }
  const ramValid =
    last.total !== null &&
    last.free !== null &&
    valid(last.total) &&
    last.total > 0 &&
    valid(last.free) &&
    last.free <= last.total;
  const disk = last.disk ?? missingDisk('DATA_VOLUME_UNAVAILABLE');
  return Object.freeze({
    version: 2,
    sequence,
    startedUtc: first.utc,
    endedUtc: last.utc,
    intervalMs,
    metrics: Object.freeze({
      availableDisk: Object.freeze({
        ...HOST_METRIC_INFO.availableDisk,
        value: disk.available,
        code: disk.code,
      }),
      totalDisk: Object.freeze({
        ...HOST_METRIC_INFO.totalDisk,
        value: disk.total,
        code: disk.code,
      }),
      hostCpu: Object.freeze({ ...HOST_METRIC_INFO.hostCpu, ...hostCpu }),
      mainCpu: Object.freeze({ ...HOST_METRIC_INFO.mainCpu, ...mainCpu }),
      totalRam: Object.freeze({
        ...HOST_METRIC_INFO.totalRam,
        ...(ramValid
          ? observed(last.total as number)
          : unknown(last.total === null ? 'PROBE_FAILED' : 'COUNTER_INVALID')),
      }),
      freeRam: Object.freeze({
        ...HOST_METRIC_INFO.freeRam,
        ...(ramValid
          ? observed(last.free as number)
          : unknown(last.free === null ? 'PROBE_FAILED' : 'COUNTER_INVALID')),
      }),
      mainRss: Object.freeze({
        ...HOST_METRIC_INFO.mainRss,
        ...(last.rss === null ? unknown('PROBE_FAILED') : observed(last.rss)),
      }),
    }),
  });
}
if (!isMainThread) {
  const port = parentPort;
  if (
    !port ||
    process.platform !== 'win32' ||
    !workerData ||
    Object.keys(workerData).join(',') !== 'sequence,dataRoot' ||
    (workerData.dataRoot !== null &&
      (typeof workerData.dataRoot !== 'string' || workerData.dataRoot.length > 32767)) ||
    !valid(workerData.sequence) ||
    workerData.sequence === 0
  )
    throw new Error('HOST_RESOURCE_WORKER_UNAVAILABLE');
  const first = collect();
  const finish = () => {
    const left = 1000 - (performance.now() - first.mono);
    if (left > 0) {
      setTimeout(finish, left);
      return;
    }
    const disk = readDiskSpace(workerData.dataRoot);
    const sample = calculateHostSample(first, { ...collect(), disk }, workerData.sequence);
    if (!sample) throw new Error('HOST_RESOURCE_SAMPLE_INVALID');
    port.postMessage(JSON.stringify(sample));
    port.close();
  };
  setTimeout(finish, 1000);
}
