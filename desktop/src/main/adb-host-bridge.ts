/** Private injected byte transport only. No spawn, bootstrap issuer or production wiring. */
import { snapshotHostTransportFacts, type HostTransportFacts } from './adb-host-lifecycle.ts';
import type { HostNativeProvider } from './adb-host-adapter.ts';
import type { RuntimeReadObservation } from './platform-tools-runtime-custody.ts';
export const HOST_FRAME_LIMIT = 65536;
const operations = ['VERSION', 'START', 'HEALTH', 'RETIRE'] as const;
type Operation = (typeof operations)[number];
const errors = [
  'ADMISSION_REJECTED',
  'BINARY_CHANGED',
  'PROFILE_REJECTED',
  'ENDPOINT_REJECTED',
  'BUSY',
  'CLOSED',
  'NATIVE_FAILED',
  'UNRETIRED',
] as const;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function record(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('HOST_BRIDGE_REJECTED');
  const descriptors = Object.getOwnPropertyDescriptors(v);
  if (Reflect.ownKeys(descriptors).length !== keys.length) throw Error('HOST_BRIDGE_REJECTED');
  const out: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const d = descriptors[key];
    if (!d || !('value' in d) || !d.enumerable) throw Error('HOST_BRIDGE_REJECTED');
    out[key] = d.value;
  }
  return out;
}
// Derived unchanged grammar from fleet-contract.ts; private reuse avoids a renderer edge.
function json(raw: string): unknown {
  let at = 0;
  const ws = () => {
    while (/[\x20\t\r\n]/.test(raw[at] ?? '!')) at++;
  };
  const str = (): string => {
    const start = at++;
    while (at < raw.length) {
      const c = raw[at++];
      if (c === '"') return JSON.parse(raw.slice(start, at));
      if (c === '\\') at++;
    }
    throw Error();
  };
  const value = (depth: number): unknown => {
    ws();
    if (depth > 8) throw Error();
    if (raw[at] === '"') return str();
    if (raw[at] === '{') {
      at++;
      ws();
      const out: Record<string, unknown> = Object.create(null);
      if (raw[at] === '}') {
        at++;
        return out;
      }
      while (true) {
        ws();
        if (raw[at] !== '"') throw Error();
        const key = str();
        if (Object.hasOwn(out, key)) throw Error();
        ws();
        if (raw[at++] !== ':') throw Error();
        out[key] = value(depth + 1);
        ws();
        const c = raw[at++];
        if (c === '}') return out;
        if (c !== ',') throw Error();
      }
    }
    if (raw[at] === '[') {
      at++;
      ws();
      const out: unknown[] = [];
      if (raw[at] === ']') {
        at++;
        return out;
      }
      while (true) {
        out.push(value(depth + 1));
        ws();
        const c = raw[at++];
        if (c === ']') return out;
        if (c !== ',') throw Error();
      }
    }
    const m = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
      raw.slice(at),
    );
    if (!m) throw Error();
    at += m[0].length;
    return JSON.parse(m[0]);
  };
  const out = value(0);
  ws();
  if (at !== raw.length) throw Error();
  return out;
}
type Response = Readonly<{
  version: 1;
  sessionId: string;
  requestId: number;
  attemptId: string;
  operation: Operation;
  result: HostTransportFacts | Readonly<{ code: string }>;
}>;
export function parseHostFrame(bytes: Uint8Array): Response | null {
  try {
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.length < 2 ||
      bytes.length > HOST_FRAME_LIMIT ||
      bytes[bytes.length - 1] !== 10 ||
      bytes.slice(0, -1).includes(10)
    )
      return null;
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return null;
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, -1));
    const v = record(json(raw), [
      'version',
      'sessionId',
      'requestId',
      'attemptId',
      'operation',
      'result',
    ]);
    if (
      v.version !== 1 ||
      !uuid(v.sessionId) ||
      !uuid(v.attemptId) ||
      typeof v.requestId !== 'number' ||
      !Number.isSafeInteger(v.requestId) ||
      v.requestId <= 0 ||
      !operations.includes(v.operation as Operation)
    )
      return null;
    let result: Response['result'] | null = snapshotHostTransportFacts(v.result);
    if (!result) {
      const e = record(v.result, ['code']);
      if (!errors.includes(e.code as (typeof errors)[number])) return null;
      result = Object.freeze({ code: e.code as string });
    }
    return Object.freeze({
      version: 1,
      sessionId: v.sessionId,
      requestId: v.requestId,
      attemptId: v.attemptId,
      operation: v.operation as Operation,
      result,
    });
  } catch {
    return null;
  }
}
export interface HostByteTransport {
  write(frame: Uint8Array): Promise<void>;
  subscribe(chunk: (bytes: Uint8Array) => void, end: () => void): void;
  /** Cleanup signal only, never positive retirement evidence. */
  requestCleanup(): void;
}
type Attempt = {
  token: object;
  id: string;
  kind: 'VERSION' | 'FOREGROUND';
  handed: boolean;
  terminal: boolean;
  stopping: boolean;
};
type Pending = {
  attempt: Attempt;
  operation: Operation;
  resolve(f: HostTransportFacts): void;
  reject(e: Error): void;
  writeDone: boolean;
  response: Response | null;
};
export function createHostBridge(
  options: Readonly<{
    sessionId: string;
    newAttemptId(): string;
    transport: HostByteTransport;
    assertRuntime(runtime: RuntimeReadObservation): void;
  }>,
) {
  const sessionId = options.sessionId,
    mint = options.newAttemptId.bind(options),
    admit = options.assertRuntime.bind(options);
  if (!uuid(sessionId)) throw Error('HOST_BRIDGE_REJECTED');
  const write = options.transport.write.bind(options.transport),
    cleanup = options.transport.requestCleanup.bind(options.transport);
  const pending = new Map<number, Pending>(),
    ids = new Set<string>();
  let current: Attempt | null = null,
    next = 0,
    closed = false,
    broken = false,
    cleanupRequested = false;
  const buffer = new Uint8Array(HOST_FRAME_LIMIT);
  let buffered = 0;
  const failure = () => Error('HOST_BRIDGE_UNCONFIRMED');
  function signalCleanup() {
    if (!cleanupRequested) {
      cleanupRequested = true;
      try {
        cleanup();
      } catch {}
    }
  }
  function breakChannel() {
    if (broken) return;
    broken = true;
    closed = true;
    buffered = 0;
    if (current) current.terminal = false;
    // Rejection is uncertainty, never retirement. Adapter retains exact attempt/read custody.
    for (const p of pending.values()) p.reject(failure());
    pending.clear();
    signalCleanup();
  }
  function finish(id: number, p: Pending) {
    if (!p.writeDone || !p.response || pending.get(id) !== p) return;
    pending.delete(id);
    const result = p.response.result;
    if ('code' in result) {
      p.attempt.terminal = false;
      p.reject(failure());
      return;
    }
    if ((p.attempt.kind === 'VERSION') !== (result.kind === 'INVOCATION')) {
      breakChannel();
      p.reject(failure());
      return;
    }
    p.attempt.terminal =
      (result.dispatched
        ? result.exitCode !== null
        : result.exitCode === null && result.observation === null) &&
      (result.kind === 'INVOCATION'
        ? result.processRetired
        : result.jobState === 'RETIRED' && result.endpointState === 'ABSENT');
    p.resolve(result);
  }
  function receive(bytes: Uint8Array) {
    try {
      if (broken || !(bytes instanceof Uint8Array) || bytes.length > HOST_FRAME_LIMIT) {
        breakChannel();
        return;
      }
      for (const byte of bytes) {
        if (buffered >= HOST_FRAME_LIMIT) {
          breakChannel();
          return;
        }
        buffer[buffered++] = byte;
        if (byte !== 10) continue;
        const response = parseHostFrame(buffer.subarray(0, buffered));
        buffered = 0;
        if (!response || response.sessionId !== sessionId) {
          breakChannel();
          return;
        }
        const p = pending.get(response.requestId);
        if (
          !p ||
          p.response ||
          p.attempt.id !== response.attemptId ||
          p.operation !== response.operation
        ) {
          breakChannel();
          return;
        }
        p.response = response;
        finish(response.requestId, p);
      }
    } catch {
      breakChannel();
    }
  }
  try {
    options.transport.subscribe(receive, breakChannel);
  } catch {
    breakChannel();
    throw failure();
  }
  function exact(token: object): Attempt {
    if (!current || current.token !== token || broken) throw failure();
    return current;
  }
  function send(
    token: object,
    operation: Operation,
    runtime?: RuntimeReadObservation,
  ): Promise<HostTransportFacts> {
    try {
      const a = exact(token);
      if (operation !== 'RETIRE' && (closed || a.stopping)) throw failure();
      if (operation === 'HEALTH' && a.kind !== 'FOREGROUND') throw failure();
      if (
        pending.size >= 2 ||
        [...pending.values()].some((p) => (p.operation === 'RETIRE') === (operation === 'RETIRE'))
      )
        throw failure();
      if (operation === 'VERSION' || operation === 'START') {
        if (a.handed || (operation === 'VERSION') !== (a.kind === 'VERSION') || !runtime)
          throw failure();
        admit(runtime);
        if (closed || broken || a.stopping || current !== a) throw failure();
      } else if (!a.handed) {
        if (operation !== 'RETIRE') throw failure();
        a.stopping = true;
        a.terminal = true;
        return Promise.resolve(
          a.kind === 'VERSION'
            ? Object.freeze({
                version: 2,
                kind: 'INVOCATION',
                dispatched: false,
                processRetired: true,
                exitCode: null,
                observation: null,
              })
            : Object.freeze({
                version: 2,
                kind: 'SESSION',
                dispatched: false,
                jobState: 'RETIRED',
                endpointState: 'ABSENT',
                exitCode: null,
                observation: null,
              }),
        );
      }
      if (next >= Number.MAX_SAFE_INTEGER) {
        breakChannel();
        throw failure();
      }
      const id = ++next;
      const frame = new TextEncoder().encode(
        `${JSON.stringify({ version: 1, sessionId, requestId: id, attemptId: a.id, operation })}\n`,
      );
      if (operation === 'RETIRE') a.stopping = true;
      a.handed = true;
      a.terminal = false;
      return new Promise<HostTransportFacts>((resolve, reject) => {
        const p: Pending = {
          attempt: a,
          operation,
          resolve,
          reject,
          writeDone: false,
          response: null,
        };
        pending.set(id, p);
        try {
          Promise.resolve(write(frame)).then(
            () => {
              p.writeDone = true;
              finish(id, p);
            },
            () => breakChannel(),
          );
        } catch {
          breakChannel();
        }
      });
    } catch {
      return Promise.reject(failure());
    }
  }
  const provider: HostNativeProvider = Object.freeze({
    reserveAttempt(kind: 'VERSION' | 'FOREGROUND') {
      if (
        closed ||
        broken ||
        ids.size >= 128 ||
        pending.size ||
        (current && !current.terminal) ||
        !['VERSION', 'FOREGROUND'].includes(kind)
      )
        throw failure();
      let id: string;
      try {
        id = mint();
      } catch {
        throw failure();
      }
      if (
        !uuid(id) ||
        ids.has(id) ||
        closed ||
        broken ||
        pending.size ||
        (current && !current.terminal)
      )
        throw failure();
      ids.add(id);
      const token = Object.freeze({});
      current = { token, id, kind, handed: false, terminal: false, stopping: false };
      return token;
    },
    version: (token: object, runtime: RuntimeReadObservation) => send(token, 'VERSION', runtime),
    startForeground: (token: object, runtime: RuntimeReadObservation) =>
      send(token, 'START', runtime),
    health: (token: object) => send(token, 'HEALTH'),
    retire: (token: object) => send(token, 'RETIRE'),
  });
  return Object.freeze({
    provider,
    close() {
      closed = true;
      signalCleanup();
    },
    get closed() {
      return closed;
    },
  });
}
