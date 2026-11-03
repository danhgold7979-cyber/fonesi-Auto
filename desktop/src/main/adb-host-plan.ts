/** Private fixed plans only: never executable authority or a generic argv service. */
import { snapshotHostRequest, type HostRequest } from './adb-host-lifecycle.ts';
export type HostPlan = Readonly<{ request: HostRequest }> &
  (
    | Readonly<{ kind: 'VERSION'; argv: readonly ['version'] }>
    | Readonly<{ kind: 'FOREGROUND' }>
    | Readonly<{ kind: 'HEALTH'; service: 'host:version' }>
    | Readonly<{ kind: 'RETIRE' }>
  );
export type HostPlanResult =
  | Readonly<{ ok: true; plan: HostPlan }>
  | Readonly<{ ok: false; outcome: 'NOT_DISPATCHED'; code: 'INVALID_REQUEST' | 'NOT_READY' }>;
export function compileHostPlan(raw: unknown): HostPlanResult {
  const request = snapshotHostRequest(raw);
  if (!request)
    return Object.freeze({ ok: false, outcome: 'NOT_DISPATCHED', code: 'INVALID_REQUEST' });
  if (request.operation === 'DISCOVER')
    return Object.freeze({ ok: false, outcome: 'NOT_DISPATCHED', code: 'NOT_READY' });
  const plan: HostPlan =
    request.operation === 'HOST_VERSION'
      ? Object.freeze({ request, kind: 'VERSION', argv: Object.freeze(['version'] as const) })
      : request.operation === 'SERVER_START'
        ? Object.freeze({ request, kind: 'FOREGROUND' })
        : request.operation === 'SERVER_HEALTH'
          ? Object.freeze({ request, kind: 'HEALTH', service: 'host:version' })
          : Object.freeze({ request, kind: 'RETIRE' });
  return Object.freeze({ ok: true, plan });
}
