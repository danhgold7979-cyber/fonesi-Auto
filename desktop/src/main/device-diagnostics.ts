// Pure diagnostic projection only: no logger, archive, transport or persistent identity map.
// Trusted main supplies command/correlation UUIDs; their origin is not established here.
import type { ActorCode, ActorResult } from './device-actor.ts';
export const DIAGNOSTIC_REJECTION = 'DEVICE_DIAGNOSTIC_REJECTED' as const;
export const DIAGNOSTIC_OPERATIONS = Object.freeze([
  'MODEL',
  'MANUFACTURER',
  'OS',
  'SDK',
  'LOCALE',
  'RESOLUTION',
  'DENSITY',
  'BATTERY',
  'STORAGE',
  'TAP',
  'SWIPE',
  'KEY',
  'HOME',
  'BACK',
  'TEXT',
] as const);
export const DIAGNOSTIC_HEALTH = Object.freeze([
  'UNKNOWN',
  'HEALTHY',
  'DEVICE_UNAVAILABLE',
  'ADB_UNAVAILABLE',
  'DEGRADED',
] as const);
const codes = Object.freeze({
  OK: true,
  INVALID_REQUEST: true,
  OWNER_REVOKED: true,
  BUSY: true,
  STALE_BINDING: true,
  STALE_DISPLAY: true,
  UNICODE_UNAVAILABLE: true,
  DEADLINE_EXCEEDED: true,
  CANCELLED: true,
  BINARY_UNAVAILABLE: true,
  TRANSPORT_FAILED: true,
  AUDIT_UNAVAILABLE: true,
  OBSERVATION_REJECTED: true,
  OUTCOME_UNKNOWN: true,
  CLOSED: true,
} satisfies Record<ActorCode, true>);
export type DeviceDiagnosticInput = Readonly<{
  version: 1;
  deviceId: string;
  commandId: string | null;
  correlationId: string | null;
  operation: (typeof DIAGNOSTIC_OPERATIONS)[number];
  outcome: ActorResult['outcome'];
  code: ActorCode;
  health: (typeof DIAGNOSTIC_HEALTH)[number];
  durationMs: number | null;
}>;
const keys = Object.freeze([
  'version',
  'deviceId',
  'commandId',
  'correlationId',
  'operation',
  'outcome',
  'code',
  'health',
  'durationMs',
]);
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function snapshot(input: unknown): DeviceDiagnosticInput | null {
  try {
    if (
      !input ||
      typeof input !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))
    )
      return null;
    const d = Object.getOwnPropertyDescriptors(input);
    if (
      Reflect.ownKeys(d).length !== keys.length ||
      keys.some((k) => !Object.hasOwn(d, k) || !Object.hasOwn(d[k] ?? {}, 'value'))
    )
      return null;
    const v = Object.fromEntries(keys.map((k) => [k, d[k]?.value]));
    if (
      v.version !== 1 ||
      !uuid(v.deviceId) ||
      !DIAGNOSTIC_OPERATIONS.includes(v.operation as DeviceDiagnosticInput['operation']) ||
      !DIAGNOSTIC_HEALTH.includes(v.health as DeviceDiagnosticInput['health']) ||
      typeof v.code !== 'string' ||
      !Object.hasOwn(codes, v.code) ||
      !['NOT_DISPATCHED', 'DISPATCHED_UNCONFIRMED', 'OBSERVED', 'OUTCOME_UNKNOWN'].includes(
        v.outcome as string,
      )
    )
      return null;
    if (v.commandId === null || v.correlationId === null) {
      if (v.commandId !== null || v.correlationId !== null || v.outcome !== 'NOT_DISPATCHED')
        return null;
    } else if (
      !uuid(v.commandId) ||
      !uuid(v.correlationId) ||
      v.commandId === v.correlationId ||
      v.commandId === v.deviceId ||
      v.correlationId === v.deviceId
    )
      return null;
    if (
      v.durationMs !== null &&
      (typeof v.durationMs !== 'number' ||
        !Number.isSafeInteger(v.durationMs) ||
        Object.is(v.durationMs, -0) ||
        v.durationMs < 0 ||
        v.durationMs > 86400000)
    )
      return null;
    if (
      (v.outcome === 'OBSERVED' && v.code !== 'OK') ||
      (v.code === 'OK' && !['OBSERVED', 'DISPATCHED_UNCONFIRMED'].includes(v.outcome as string)) ||
      (v.outcome === 'OUTCOME_UNKNOWN' && v.code !== 'OUTCOME_UNKNOWN') ||
      (v.code === 'OUTCOME_UNKNOWN' &&
        !['NOT_DISPATCHED', 'OUTCOME_UNKNOWN'].includes(v.outcome as string))
    )
      return null;
    if (
      v.outcome === 'DISPATCHED_UNCONFIRMED' &&
      ![
        'OK',
        'OWNER_REVOKED',
        'STALE_BINDING',
        'STALE_DISPLAY',
        'DEADLINE_EXCEEDED',
        'TRANSPORT_FAILED',
        'OBSERVATION_REJECTED',
        'BINARY_UNAVAILABLE',
        'CLOSED',
        'UNICODE_UNAVAILABLE',
      ].includes(v.code)
    )
      return null;
    return Object.freeze(v) as DeviceDiagnosticInput;
  } catch {
    return null;
  }
}
export function createDeviceDiagnosticEncoder(): Readonly<{ encode(input: unknown): string }> {
  // Bounded, per-instance, nonpersistent pseudonyms. No API exports the private UUID map.
  const labels = new Map<string, string>();
  return Object.freeze({
    encode(input: unknown): string {
      const v = snapshot(input);
      if (!v) return DIAGNOSTIC_REJECTION;
      let deviceLabel = labels.get(v.deviceId);
      if (!deviceLabel) {
        if (labels.size >= 256) return DIAGNOSTIC_REJECTION;
        deviceLabel = `device-${String(labels.size + 1).padStart(4, '0')}`;
        labels.set(v.deviceId, deviceLabel);
      }
      return JSON.stringify({
        version: 1,
        event: 'DEVICE_COMMAND_RESULT',
        deviceLabel,
        commandId: v.commandId,
        correlationId: v.correlationId,
        operation: v.operation,
        outcome: v.outcome,
        code: v.code,
        health: v.health,
        durationMs: v.durationMs,
      });
    },
  });
}
