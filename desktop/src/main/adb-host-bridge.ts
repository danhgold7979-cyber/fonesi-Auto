import {
  snapshotVideo,
  snapshotVideoStart,
  videoUuid,
  type VideoSnapshot,
  type VideoStart,
  type VideoControl,
} from './video-contract.ts';
import {
  snapshotInputQueryFacts,
  validInputAction,
  type InputQueryFacts,
  type InputQueryAction,
} from './input-query-contract.ts';
import {
  snapshotMetadataQueryFacts,
  validMetadataDeadline,
  validMetadataField,
  validMetadataTransportId,
  type MetadataQueryFacts,
  type MetadataQueryField,
} from './metadata-query-contract.ts';
/** Private injected byte transport only. No spawn, bootstrap issuer or production wiring. */
import { snapshotHostTransportFacts, type HostTransportFacts } from './adb-host-lifecycle.ts';
import {
  snapshotHostAcquisitionFacts,
  type HostAcquisitionFacts,
  type HostNativeProvider,
} from './adb-host-adapter.ts';
import type { RuntimeReadObservation } from './platform-tools-runtime-custody.ts';
export const HOST_FRAME_LIMIT = 65536;
const operations = [
  'VERSION',
  'START',
  'HEALTH',
  'RETIRE',
  'DISCOVER',
  'METADATA',
  'INPUT',
  'VIDEO_START',
  'VIDEO_STATUS',
  'VIDEO_STOP',
] as const;
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
  version: 1 | 2 | 3 | 4 | 5;
  sessionId: string;
  requestId: number;
  attemptId: string;
  operation: Operation;
  result:
    | HostTransportFacts
    | HostAcquisitionFacts
    | MetadataQueryFacts
    | InputQueryFacts
    | VideoSnapshot
    | Readonly<{ code: string }>;
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
    const parsed = json(raw);
    if (parsed && typeof parsed === 'object' && (parsed as { version?: unknown }).version === 5) {
      const v = record(parsed, [
        'version',
        'requestId',
        'sessionId',
        'attemptId',
        'kind',
        'result',
      ]);
      const result = snapshotVideo(v.result);
      if (
        !result ||
        !uuid(v.sessionId) ||
        !uuid(v.attemptId) ||
        !Number.isSafeInteger(v.requestId) ||
        (v.requestId as number) <= 0 ||
        !['VIDEO_START', 'VIDEO_STATUS', 'VIDEO_STOP'].includes(v.kind as string)
      )
        return null;
      return Object.freeze({
        version: 5,
        sessionId: v.sessionId,
        requestId: v.requestId as number,
        attemptId: v.attemptId,
        operation: v.kind as VideoControl,
        result,
      });
    }
    const v = record(parsed, [
      'version',
      'sessionId',
      'requestId',
      'attemptId',
      'operation',
      'result',
    ]);
    if (
      v.version !==
        (v.operation === 'INPUT'
          ? 4
          : v.operation === 'METADATA'
            ? 3
            : v.operation === 'DISCOVER'
              ? 2
              : 1) ||
      !uuid(v.sessionId) ||
      !uuid(v.attemptId) ||
      typeof v.requestId !== 'number' ||
      !Number.isSafeInteger(v.requestId) ||
      v.requestId <= 0 ||
      !operations.includes(v.operation as Operation)
    )
      return null;
    let result: Response['result'] | null =
      v.operation === 'INPUT'
        ? snapshotInputQueryFacts(v.result)
        : v.operation === 'METADATA'
          ? snapshotMetadataQueryFacts(v.result)
          : v.operation === 'DISCOVER'
            ? snapshotHostAcquisitionFacts(v.result)
            : snapshotHostTransportFacts(v.result);
    if (
      (v.operation === 'DISCOVER' || v.operation === 'METADATA' || v.operation === 'INPUT') &&
      !result
    )
      return null;
    if (!result) {
      const e = record(v.result, ['code']);
      if (!errors.includes(e.code as (typeof errors)[number])) return null;
      result = Object.freeze({ code: e.code as string });
    }
    return Object.freeze({
      version: v.version as 1 | 2 | 3 | 4,
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
  queries: number;
  videoId: string | null;
  videoControls: number;
  videoStopping: boolean;
};
type Pending = {
  attempt: Attempt;
  operation: Operation;
  deadlineUtc: number | undefined;
  videoId?: string;
  resolve(
    f:
      | HostTransportFacts
      | HostAcquisitionFacts
      | MetadataQueryFacts
      | InputQueryFacts
      | VideoSnapshot,
  ): void;
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
    if (p.operation.startsWith('VIDEO_')) {
      const facts = snapshotVideo(result);
      if (!facts || facts.sessionId !== p.videoId) {
        breakChannel();
        p.reject(failure());
        return;
      }
      if (!facts.localRetired) p.attempt.terminal = false;
      p.resolve(facts);
      return; // Video snapshots never release foreground attempt/runtime custody.
    }
    if ('snapshotRevision' in result) {
      breakChannel();
      p.reject(failure());
      return;
    }
    if (p.operation === 'DISCOVER' || p.operation === 'METADATA' || p.operation === 'INPUT') {
      if (
        !('kind' in result) ||
        result.kind !==
          (p.operation === 'INPUT'
            ? 'INPUT_QUERY'
            : p.operation === 'METADATA'
              ? 'METADATA_QUERY'
              : 'ACQUISITION') ||
        (result.observedAtUtc !== null &&
          (p.deadlineUtc === undefined || result.observedAtUtc > p.deadlineUtc))
      ) {
        breakChannel();
        p.reject(failure());
        return;
      }
      if (!result.operationRetired) p.attempt.terminal = false;
      p.resolve(result);
      return; // Query retirement never changes foreground terminal state.
    }
    if (
      'kind' in result &&
      (result.kind === 'ACQUISITION' ||
        result.kind === 'METADATA_QUERY' ||
        result.kind === 'INPUT_QUERY')
    ) {
      breakChannel();
      p.reject(failure());
      return;
    }
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
    deadlineUtc?: number,
    metadata?: Readonly<{
      transportId: string;
      field?: MetadataQueryField;
      action?: InputQueryAction;
    }>,
  ): Promise<HostTransportFacts | HostAcquisitionFacts | MetadataQueryFacts | InputQueryFacts> {
    try {
      const a = exact(token);
      if (operation !== 'RETIRE' && (closed || a.stopping)) throw failure();
      if (
        (operation === 'HEALTH' ||
          operation === 'DISCOVER' ||
          operation === 'METADATA' ||
          operation === 'INPUT') &&
        (a.kind !== 'FOREGROUND' || a.terminal)
      )
        throw failure();
      if (
        (operation === 'DISCOVER' || operation === 'METADATA' || operation === 'INPUT') &&
        (!Number.isSafeInteger(deadlineUtc) || (deadlineUtc as number) < 0 || a.queries >= 128)
      )
        throw failure();
      if (
        (operation === 'METADATA' || operation === 'INPUT') &&
        (!validMetadataDeadline(deadlineUtc) ||
          !metadata ||
          !validMetadataTransportId(metadata.transportId) ||
          !(operation === 'INPUT'
            ? validInputAction(metadata.action)
            : validMetadataField(metadata.field)))
      )
        throw failure();
      if (
        pending.size >= 2 ||
        [...pending.values()].some(
          (p) =>
            (p.operation === 'RETIRE' || p.operation === 'VIDEO_STOP') === (operation === 'RETIRE'),
        )
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
        `${JSON.stringify(operation === 'INPUT' ? { version: 4, sessionId, requestId: id, attemptId: a.id, operation, action: metadata?.action, transportId: metadata?.transportId, deadlineUtc } : operation === 'METADATA' ? { version: 3, sessionId, requestId: id, attemptId: a.id, operation, field: metadata?.field, transportId: metadata?.transportId, deadlineUtc } : operation === 'DISCOVER' ? { version: 2, sessionId, requestId: id, attemptId: a.id, operation, deadlineUtc } : { version: 1, sessionId, requestId: id, attemptId: a.id, operation })}\n`,
      );
      if (operation === 'RETIRE') a.stopping = true;
      a.handed = true;
      if (operation === 'DISCOVER' || operation === 'METADATA' || operation === 'INPUT')
        a.queries++;
      else a.terminal = false;
      return new Promise<
        HostTransportFacts | HostAcquisitionFacts | MetadataQueryFacts | InputQueryFacts
      >((resolve, reject) => {
        const p: Pending = {
          attempt: a,
          operation,
          deadlineUtc,
          resolve: (value) => {
            if ('snapshotRevision' in value) reject(failure());
            else resolve(value);
          },
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
  function sendVideo(
    token: object,
    kind: VideoControl,
    raw: VideoStart | string,
  ): Promise<VideoSnapshot> {
    try {
      const a = exact(token);
      const start = kind === 'VIDEO_START' ? snapshotVideoStart(raw) : null;
      const videoId = start?.videoId ?? raw;
      const cleanupKind = (operation: Operation) =>
        operation === 'RETIRE' || operation === 'VIDEO_STOP';
      if (
        !videoUuid(videoId) ||
        a.kind !== 'FOREGROUND' ||
        !a.handed ||
        a.terminal ||
        broken ||
        (kind !== 'VIDEO_STOP' &&
          (closed || a.stopping || a.videoStopping || a.videoControls >= 128)) ||
        (kind === 'VIDEO_START' ? !start || a.videoId !== null : a.videoId !== videoId) ||
        pending.size >= 2 ||
        [...pending.values()].some((p) => cleanupKind(p.operation) === cleanupKind(kind)) ||
        next >= Number.MAX_SAFE_INTEGER
      )
        throw failure();
      if (kind === 'VIDEO_START') a.videoId = videoId;
      if (kind === 'VIDEO_STOP') a.videoStopping = true;
      else a.videoControls++;
      const id = ++next;
      const body = start
        ? {
            version: 5,
            requestId: id,
            sessionId,
            attemptId: a.id,
            kind,
            videoId,
            transportId: start.transportId,
            hostEpoch: start.hostEpoch,
            deadlineUtc: start.deadlineUtc,
            artifactId: start.artifactId,
            scid: start.scid,
            nonceHex: start.nonceHex,
          }
        : { version: 5, requestId: id, sessionId, attemptId: a.id, kind, videoId };
      const frame = new TextEncoder().encode(`${JSON.stringify(body)}\n`);
      return new Promise<VideoSnapshot>((resolve, reject) => {
        const p: Pending = {
          attempt: a,
          operation: kind,
          deadlineUtc: start?.deadlineUtc,
          videoId,
          resolve: (value) => {
            const facts = snapshotVideo(value);
            if (facts) resolve(facts);
            else reject(failure());
          },
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
    videoStart: (token: object, request: VideoStart) => sendVideo(token, 'VIDEO_START', request),
    videoStatus: (token: object, videoId: string) => sendVideo(token, 'VIDEO_STATUS', videoId),
    videoStop: (token: object, videoId: string) => sendVideo(token, 'VIDEO_STOP', videoId),
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
      current = {
        token,
        id,
        kind,
        handed: false,
        terminal: false,
        stopping: false,
        queries: 0,
        videoId: null,
        videoControls: 0,
        videoStopping: false,
      };
      return token;
    },
    version: (token: object, runtime: RuntimeReadObservation) =>
      send(token, 'VERSION', runtime) as Promise<HostTransportFacts>,
    startForeground: (token: object, runtime: RuntimeReadObservation) =>
      send(token, 'START', runtime) as Promise<HostTransportFacts>,
    health: (token: object) => send(token, 'HEALTH') as Promise<HostTransportFacts>,
    retire: (token: object) => send(token, 'RETIRE') as Promise<HostTransportFacts>,
    input: (token: object, transportId: string, action: InputQueryAction, deadlineUtc: number) =>
      send(token, 'INPUT', undefined, deadlineUtc, {
        transportId,
        action,
      }) as Promise<InputQueryFacts>,
    metadata: (
      token: object,
      transportId: string,
      field: MetadataQueryField,
      deadlineUtc: number,
    ) =>
      send(token, 'METADATA', undefined, deadlineUtc, {
        transportId,
        field,
      }) as Promise<MetadataQueryFacts>,
    discover: (token: object, deadlineUtc: number) =>
      send(token, 'DISCOVER', undefined, deadlineUtc) as Promise<HostAcquisitionFacts>,
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
