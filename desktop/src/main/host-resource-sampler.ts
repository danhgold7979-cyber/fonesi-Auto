import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  parseHostResourceSample,
  hostResourceResponse,
  HOST_RESOURCE_FRESH_MS,
  type HostResourceCode,
  type HostResourceSample,
} from '../host-resource-contract.ts';
export type HostWorker = Readonly<{
  on: (name: 'message' | 'error' | 'exit', callback: (value: unknown) => void) => unknown;
  terminate: () => Promise<number>;
}>;
type Options = Readonly<{
  platform?: string;
  spawn?: (sequence: number) => HostWorker;
  now?: () => number;
  utc?: () => number;
  timer?: Readonly<{ set: (fn: () => void, ms: number) => unknown; clear: (id: unknown) => void }>;
}>;
export function createHostResourceSampler(options: Options = {}) {
  const now = options.now ?? (() => performance.now()),
    utc = options.utc ?? Date.now;
  const timer = options.timer ?? {
    set: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clear: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>),
  };
  const spawn =
    options.spawn ??
    ((sequence: number) =>
      new Worker(join(__dirname, 'host-resource-worker.cjs'), {
        workerData: { sequence },
        execArgv: [],
        env: {},
      }));
  let closed = false,
    sequence = 0;
  type Active = {
    owner: object;
    id: string;
    cancel: (code: HostResourceCode) => void;
    drain: Promise<void>;
  };
  let active: Active | null = null;
  let admitting = false;
  function sample(id: string, owner: object, current: () => boolean): Promise<string> {
    if (closed) return Promise.resolve(hostResourceResponse(id, 'CLOSED'));
    if (active || admitting) return Promise.resolve(hostResourceResponse(id, 'BUSY'));
    if ((options.platform ?? process.platform) !== 'win32')
      return Promise.resolve(hostResourceResponse(id, 'UNAVAILABLE'));
    if (sequence >= 65536) return Promise.resolve(hostResourceResponse(id, 'UNAVAILABLE'));
    let started: number, startedUtc: number;
    admitting = true;
    try {
      if (!current()) return Promise.resolve(hostResourceResponse(id, 'SESSION_REVOKED'));
      started = now();
      startedUtc = utc();
    } catch {
      return Promise.resolve(hostResourceResponse(id, 'UNAVAILABLE'));
    } finally {
      admitting = false;
    }
    if (closed) return Promise.resolve(hostResourceResponse(id, 'CLOSED'));
    if (!Number.isFinite(started) || !Number.isSafeInteger(startedUtc) || startedUtc < 0)
      return Promise.resolve(hostResourceResponse(id, 'UNAVAILABLE'));
    const serial = ++sequence;
    let resolveResult!: (wire: string) => void, resolveDrain!: () => void;
    const result = new Promise<string>((resolve) => {
      resolveResult = resolve;
    });
    const drain = new Promise<void>((resolve) => {
      resolveDrain = resolve;
    });
    let delivered = false,
      worker: HostWorker | null = null,
      exited = false,
      failed = false,
      stopping = false;
    let candidate: HostResourceSample | null = null,
      received = 0,
      handle: unknown;
    const deliver = (code: HostResourceCode, value: HostResourceSample | null = null, age = 0) => {
      if (delivered) return;
      delivered = true;
      resolveResult(
        hostResourceResponse(
          id,
          code,
          value,
          value ? Math.max(0, HOST_RESOURCE_FRESH_MS - age) : 0,
        ),
      );
    };
    const stop = (code: HostResourceCode) => {
      failed = true;
      deliver(code);
      if (stopping) return;
      stopping = true;
      if (worker && !exited) {
        try {
          void worker.terminate().catch(() => {});
        } catch {}
      }
    };
    const entry: Active = { owner, id, cancel: stop, drain };
    active = entry;
    const deadline = () => {
      let elapsed: number;
      try {
        elapsed = now() - started;
      } catch {
        stop('WORKER_FAILED');
        return;
      }
      if (!Number.isFinite(elapsed) || elapsed < 0) {
        stop('WORKER_FAILED');
        return;
      }
      if (elapsed < 3000) {
        handle = timer.set(deadline, 3000 - elapsed);
        return;
      }
      stop('DEADLINE');
    };
    handle = timer.set(deadline, 3000);
    try {
      worker = spawn(serial);
      worker.on('message', (raw) => {
        if (exited || failed) return;
        if (candidate) {
          stop('WORKER_FAILED');
          return;
        }
        const parsed = parseHostResourceSample(raw);
        let time: number, clock: number;
        try {
          time = now();
          clock = utc();
        } catch {
          stop('WORKER_FAILED');
          return;
        }
        if (
          !parsed ||
          parsed.sequence !== serial ||
          parsed.startedUtc < startedUtc ||
          parsed.endedUtc > clock ||
          !Number.isFinite(time) ||
          time < started ||
          time - started < parsed.intervalMs ||
          time - started >= 3000
        ) {
          stop('WORKER_FAILED');
          return;
        }
        candidate = parsed;
        received = time;
      });
      worker.on('error', () => stop('WORKER_FAILED'));
      worker.on('exit', (code) => {
        if (exited) return;
        exited = true;
        timer.clear(handle);
        try {
          const time = now();
          if (
            !failed &&
            code === 0 &&
            candidate &&
            Number.isFinite(time) &&
            time >= received &&
            time - started < 3000 &&
            !closed &&
            current() &&
            !closed &&
            !failed
          )
            deliver('OK', candidate, time - started);
          else deliver(failed ? 'WORKER_FAILED' : closed ? 'CLOSED' : 'WORKER_FAILED');
        } catch {
          deliver('WORKER_FAILED');
        }
        if (active === entry) active = null;
        resolveDrain();
      });
      if (stopping || closed) {
        stopping = false;
        stop(closed ? 'CLOSED' : 'CANCELLED');
      }
    } catch {
      stop('WORKER_FAILED');
      if (!worker) {
        timer.clear(handle);
        if (active === entry) active = null;
        resolveDrain();
      }
    }
    return result;
  }
  return Object.freeze({
    sample,
    cancel(id: string, owner: object) {
      if (active?.owner !== owner || active.id !== id) return false;
      active.cancel('CANCELLED');
      return true;
    },
    close() {
      closed = true;
      active?.cancel('CLOSED');
      return active?.drain ?? Promise.resolve();
    },
    get retired() {
      return active === null;
    },
  });
}
export type HostResourceSampler = ReturnType<typeof createHostResourceSampler>;
