import { createInvocationBudget, type InvocationBudget } from './invocation-budget.ts';
import {
  parseVideoStreamRequest,
  parseVideoStreamResponse,
  snapshotVideoPortMetadata,
  videoStreamResponse,
  type VideoPortMetadata,
} from './video-stream-contract.ts';
export function createVideoStreamClient(
  invoke: (wire: string) => Promise<unknown>,
  budget: InvocationBudget = createInvocationBudget(),
) {
  let closed = false,
    count = 0;
  let start: {
    requestId: string;
    deviceId: string;
    videoId: string | null;
    port: boolean;
    expired: boolean;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  const pending = new Set<(wire: string) => void>();
  function forget() {
    if (start) clearTimeout(start.timer);
    start = null;
  }
  function dispose() {
    if (closed) return;
    closed = true;
    forget();
    for (const deliver of pending) deliver(videoStreamResponse(null, 'CLOSED'));
  }
  return Object.freeze({
    async invoke(raw: unknown): Promise<string> {
      const request = parseVideoStreamRequest(raw);
      if (!request) return videoStreamResponse(null, 'INVALID');
      if (closed || (request.kind === 'START' && count >= 65536))
        return videoStreamResponse(request.requestId, 'CLOSED');
      if (request.kind === 'START' && start) return videoStreamResponse(request.requestId, 'BUSY');
      if (request.kind === 'STOP' && (!start || start.videoId !== request.videoId))
        return videoStreamResponse(request.requestId, 'STALE');
      const lease = request.kind === 'STOP' ? budget.acquireCleanup() : budget.acquire();
      if (!lease) return videoStreamResponse(request.requestId, 'BUSY');
      if (request.kind === 'START') count++;
      if (request.kind === 'START') {
        const token = {
          requestId: request.requestId,
          deviceId: request.deviceId,
          videoId: null,
          port: false,
          expired: false,
          timer: setTimeout(() => {
            if (start === token) token.expired = true;
          }, 30000),
        };
        start = token;
      }
      return new Promise((resolve) => {
        let delivered = false;
        const deliver = (wire: string) => {
          if (delivered) return;
          delivered = true;
          clearTimeout(timer);
          pending.delete(deliver);
          resolve(wire);
        };
        const timer = setTimeout(() => {
          if (request.kind === 'START' && start?.requestId === request.requestId)
            start.expired = true;
          deliver(videoStreamResponse(request.requestId, 'UNCERTAIN'));
        }, 30000);
        pending.add(deliver);
        Promise.resolve()
          .then(() => invoke(raw as string))
          .then(
            (value) => {
              const result = parseVideoStreamResponse(value);
              if (!result || result.requestId !== request.requestId) {
                if (request.kind === 'START' && start?.requestId === request.requestId)
                  start.expired = true;
                deliver(videoStreamResponse(request.requestId, 'UNCERTAIN'));
                return;
              }
              if (request.kind === 'START' && start?.requestId === request.requestId) {
                if (
                  result.code === 'PENDING' &&
                  result.videoId &&
                  (start.videoId === null || start.videoId === result.videoId)
                )
                  start.videoId = result.videoId;
                else if (
                  ['UNAVAILABLE', 'INVALID', 'STALE', 'BUSY', 'CLOSED', 'FAILED'].includes(
                    result.code,
                  ) &&
                  !start.port
                )
                  forget();
                else start.expired = true;
              }
              if (
                request.kind === 'STOP' &&
                result.code === 'STOPPED' &&
                result.videoId === request.videoId
              )
                forget();
              deliver(
                closed ? videoStreamResponse(request.requestId, 'CLOSED') : (value as string),
              );
            },
            () => {
              if (request.kind === 'START' && start?.requestId === request.requestId)
                start.expired = true;
              deliver(videoStreamResponse(request.requestId, 'UNCERTAIN'));
            },
          )
          .finally(() => lease.release());
      });
    },
    acceptPort(
      raw: unknown,
      ports: readonly MessagePort[],
      forward: (meta: VideoPortMetadata, port: MessagePort) => void,
    ): boolean {
      const meta = snapshotVideoPortMetadata(raw),
        entry = start;
      if (
        closed ||
        !entry ||
        entry.port ||
        entry.expired ||
        !meta ||
        meta.requestId !== entry.requestId ||
        meta.deviceId !== entry.deviceId ||
        (entry.videoId !== null && entry.videoId !== meta.videoId) ||
        ports.length !== 1 ||
        meta.deadlineUtc <= Date.now() ||
        meta.deadlineUtc - Date.now() > 30000
      ) {
        for (const p of ports)
          try {
            p.close();
          } catch {}
        return false;
      }
      const port = ports[0];
      if (!port) return false;
      entry.port = true;
      entry.videoId = meta.videoId;
      clearTimeout(entry.timer);
      try {
        forward(meta, port);
        return true;
      } catch {
        port.close();
        entry.expired = true;
        return false;
      }
    },
    dispose,
  });
}
