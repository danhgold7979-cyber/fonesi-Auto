import { createInvocationBudget, type InvocationBudget } from './invocation-budget.ts';
import {
  parseAssociationRequest,
  snapshotAssociationRequest,
  parseAssociationResponse,
  associationError,
  type AssociationRequest,
  type AssociationCode,
  type AssociationResponse,
} from './association-contract.ts';
type Timer = { set: (callback: () => void, ms: number) => unknown; clear: (id: unknown) => void };
type Readiness = Readonly<{
  wait: () => Readonly<{ promise: Promise<boolean>; cancel: () => void }>;
}>;
const defaultTimer: Timer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};
function matches(
  request: AssociationRequest,
  response: Extract<AssociationResponse, { ok: true }>,
): boolean {
  const s = response.snapshot;
  if (
    request.method !== 'association.candidates' &&
    (s.candidates.length !== 0 || s.historical.length !== 0)
  )
    return false;
  if (request.method === 'association.get' || request.method === 'association.candidates')
    return response.outcome === 'OBSERVED';
  if (request.method === 'association.cancel')
    return (
      ['SETTLED', 'UNCHANGED'].includes(response.outcome) && s.operationId === request.operationId
    );
  if (response.outcome !== 'PENDING' || s.revision !== request.expectedRevision + 1) return false;
  if (request.method === 'association.begin')
    return (
      s.state === 'BASELINE_PENDING' &&
      s.mode === request.mode &&
      (request.mode === 'CURRENT' || s.deviceId === request.deviceId)
    );
  const expected = {
    'association.removal': 'REMOVAL_PENDING',
    'association.return': 'RETURN_PENDING',
    'association.confirm': 'CONFIRM_PENDING',
  };
  return s.state === expected[request.method] && s.ceremonyId === request.ceremonyId;
}
export function createAssociationClient(
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
    method: AssociationRequest['method'],
    fields: Record<string, unknown> = {},
  ): Promise<string> {
    const initial = (code: AssociationCode) => associationError(null, code, null, 'DEGRADED');
    if (disposed) return Promise.resolve(initial('SESSION_UNAVAILABLE'));
    const read = method === 'association.get' || method === 'association.candidates';
    if (!read && method !== 'association.cancel' && !observed)
      return Promise.resolve(initial('SESSION_UNAVAILABLE'));
    if (!Number.isSafeInteger(nextId + 1)) {
      disposed = true;
      invalidate();
      return Promise.resolve(initial('SESSION_UNAVAILABLE'));
    }
    const requestId = `p${nextId + 1}`;
    // Snapshot every scalar and exact shape BEFORE JSON serialization: no toJSON/getter calls.
    const request = snapshotAssociationRequest({ version: 1, requestId, method, ...fields });
    if (!request) return Promise.resolve(initial('INVALID_SHAPE'));
    const wire = JSON.stringify(request);
    if (!parseAssociationRequest(wire).ok) return Promise.resolve(initial('INVALID_SHAPE'));
    const lease = budget.acquire();
    if (!lease) return Promise.resolve(initial('BUSY'));
    nextId++;
    if (!read) invalidate();
    const epoch = reconciliation;
    const completion = new Promise<string>((resolve) => {
      let delivered = false,
        handle: unknown;
      const failure = (code: AssociationCode) =>
        associationError(requestId, code, null, 'DEGRADED');
      const deliver = (raw: string) => {
        if (!delivered) {
          delivered = true;
          resolve(raw);
        }
      };
      const waiting = method === 'association.get' ? readiness?.wait() : undefined;
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
            const response = parseAssociationResponse(raw);
            if (
              !response ||
              (response.requestId !== null && response.requestId !== requestId) ||
              (response.ok && !matches(request, response))
            ) {
              invalidate();
              deliver(failure('INTERNAL_FAILURE'));
              return;
            }
            if (response.ok && read && epoch === reconciliation) observed = true;
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
    get: () => call('association.get'),
    candidates: () => call('association.candidates'),
    begin: (expectedRevision: unknown, candidateId: unknown, mode: unknown, deviceId?: unknown) =>
      call('association.begin', {
        expectedRevision,
        candidateId,
        mode,
        ...(deviceId === undefined ? {} : { deviceId }),
      }),
    removal: (expectedRevision: unknown, ceremonyId: unknown) =>
      call('association.removal', { expectedRevision, ceremonyId }),
    return: (expectedRevision: unknown, ceremonyId: unknown) =>
      call('association.return', { expectedRevision, ceremonyId }),
    confirm: (expectedRevision: unknown, ceremonyId: unknown) =>
      call('association.confirm', { expectedRevision, ceremonyId }),
    cancel: (expectedRevision: unknown, operationId: unknown) =>
      call('association.cancel', { expectedRevision, operationId }),
    dispose: () => {
      disposed = true;
      invalidate();
      for (const p of pending) p.dispose();
    },
    outstanding: () => pending.size,
  });
}
