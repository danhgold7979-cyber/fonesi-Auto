import { createInvocationBudget, type InvocationBudget } from './invocation-budget.ts';
import {
  parseMetadataRequest,
  validMetadataRevision,
  validMetadataDeviceId,
  METADATA_FIELDS,
  parseMetadataResponse,
  metadataError,
  type MetadataRequest,
  type MetadataCode,
} from './metadata-contract.ts';
type Timer = { set: (callback: () => void, ms: number) => unknown; clear: (id: unknown) => void };
type Readiness = Readonly<{
  wait: () => Readonly<{ promise: Promise<boolean>; cancel: () => void }>;
}>;
const defaultTimer: Timer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};
export function createMetadataClient(
  invoke: (wire: string) => Promise<unknown>,
  budget: InvocationBudget = createInvocationBudget(),
  timer: Timer = defaultTimer,
  readiness?: Readiness,
) {
  let disposed = false,
    nextId = 0,
    observed = false;
  let reconciliation: object = Object.freeze({});
  const invalidate = () => {
    observed = false;
    reconciliation = Object.freeze({});
  };
  const pending = new Set<{ dispose: () => void }>();
  function call(
    method: MetadataRequest['method'],
    deviceId?: unknown,
    field?: unknown,
    revision?: unknown,
    registryRevision?: unknown,
  ): Promise<string> {
    const initial = (code: MetadataCode) => metadataError(null, code, null, 'DEGRADED');
    if (disposed) return Promise.resolve(initial('SESSION_UNAVAILABLE'));
    if (method !== 'metadata.get' && !observed)
      return Promise.resolve(initial('SESSION_UNAVAILABLE'));
    if (!Number.isSafeInteger(nextId + 1)) {
      disposed = true;
      invalidate();
      return Promise.resolve(initial('SESSION_UNAVAILABLE'));
    }
    if (
      method === 'metadata.read' &&
      (!validMetadataDeviceId(deviceId) ||
        typeof field !== 'string' ||
        !METADATA_FIELDS.some((candidate) => candidate === field) ||
        !validMetadataRevision(revision) ||
        !validMetadataRevision(registryRevision))
    )
      return Promise.resolve(initial('INVALID_SHAPE'));
    const requestId = `p${nextId + 1}`;
    const wire = JSON.stringify({
      version: 1,
      requestId,
      method,
      ...(method === 'metadata.read'
        ? {
            deviceId,
            field,
            expectedRevision: revision,
            expectedRegistryRevision: registryRevision,
          }
        : {}),
    });
    if (!parseMetadataRequest(wire).ok) return Promise.resolve(initial('INVALID_SHAPE'));
    const lease = budget.acquire();
    if (!lease) return Promise.resolve(initial('BUSY'));
    nextId++;
    if (method !== 'metadata.get') invalidate();
    const epoch = reconciliation;
    const completion = new Promise<string>((resolve) => {
      let delivered = false,
        dispatched = false,
        handle: unknown;
      const failure = (code: MetadataCode) =>
        metadataError(
          requestId,
          code,
          null,
          'DEGRADED',
          code === 'TIMEOUT' || (dispatched && method !== 'metadata.get')
            ? 'OUTCOME_UNKNOWN'
            : 'NOT_STARTED',
        );
      const deliver = (raw: string) => {
        if (!delivered) {
          delivered = true;
          resolve(raw);
        }
      };
      const waiting = method === 'metadata.get' ? readiness?.wait() : undefined;
      const entry = {
        dispose: () => {
          invalidate();
          timer.clear(handle);
          waiting?.cancel();
          deliver(failure('SESSION_UNAVAILABLE'));
        },
      };
      pending.add(entry);
      handle = timer.set(() => {
        if (delivered) return;
        invalidate();
        waiting?.cancel();
        deliver(failure('TIMEOUT'));
      }, 2000);
      const dispatch = () => {
        dispatched = true;
        return invoke(wire);
      };
      let native: Promise<unknown>;
      try {
        native = waiting
          ? waiting.promise.then((ready) => {
              if (!ready || disposed || delivered) return failure('SESSION_UNAVAILABLE');
              return dispatch();
            })
          : Promise.resolve(dispatch());
      } catch {
        native = Promise.reject(Error('INVOKE_FAILED'));
      }
      native
        .then(
          (raw) => {
            if (disposed || delivered) return;
            const response = parseMetadataResponse(raw);
            if (
              !response ||
              (response.requestId !== null && response.requestId !== requestId) ||
              (response.ok &&
                (method === 'metadata.get'
                  ? response.outcome !== 'OBSERVED'
                  : response.outcome !== 'PENDING' ||
                    response.snapshot.deviceId !== deviceId ||
                    response.snapshot.field !== field ||
                    response.snapshot.registryRevision !== registryRevision ||
                    response.snapshot.revision !== (revision as number) + 1))
            ) {
              invalidate();
              deliver(failure('INTERNAL_FAILURE'));
              return;
            }
            if (response.ok && method === 'metadata.get' && epoch === reconciliation)
              observed = true;
            else if (!response.ok) invalidate();
            deliver(raw as string);
          },
          () => {
            if (disposed || delivered) return;
            invalidate();
            deliver(failure('INTERNAL_FAILURE'));
          },
        )
        .finally(() => {
          timer.clear(handle);
          pending.delete(entry);
          lease.release();
        });
    });
    return completion;
  }
  return Object.freeze({
    invalidateObservation: invalidate,
    get: () => call('metadata.get'),
    read: (
      deviceId: unknown,
      field: unknown,
      expectedRevision: unknown,
      expectedRegistryRevision: unknown,
    ) => call('metadata.read', deviceId, field, expectedRevision, expectedRegistryRevision),
    dispose: () => {
      disposed = true;
      invalidate();
      for (const p of pending) p.dispose();
    },
    outstanding: () => pending.size,
  });
}
