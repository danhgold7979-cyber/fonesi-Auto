/** Closed input intent/history grammar; no device or command text is accepted. */
export const INPUT_AUDIT_ACTIONS = Object.freeze([
  'HOME',
  'BACK',
  'ENTER',
  'ESCAPE',
  'DPAD_UP',
  'DPAD_DOWN',
  'DPAD_LEFT',
  'DPAD_RIGHT',
  'DPAD_CENTER',
] as const);
export type InputAuditAction = (typeof INPUT_AUDIT_ACTIONS)[number];
export type InputAudit = Readonly<{
  action: InputAuditAction;
  phase: 'INTENT' | 'RESULT';
  diagnosticId: string;
  commandId: string;
  correlationId: string;
  outcome: 'INTENT' | 'NOT_DISPATCHED' | 'DISPATCHED_UNCONFIRMED' | 'OUTCOME_UNKNOWN';
  code:
    | 'OK'
    | 'BUSY'
    | 'CLOSED'
    | 'OWNER_REVOKED'
    | 'STALE_BINDING'
    | 'DEADLINE_EXCEEDED'
    | 'CANCELLED'
    | 'BINARY_UNAVAILABLE'
    | 'AUDIT_UNAVAILABLE'
    | 'INVALID_REQUEST'
    | 'TRANSPORT_FAILED'
    | 'OUTCOME_UNKNOWN';
}>;
export type InputAuditFields = InputAudit;
const keys = Object.freeze([
  'action',
  'phase',
  'diagnosticId',
  'commandId',
  'correlationId',
  'outcome',
  'code',
]);
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export function snapshotInputAudit(input: unknown): InputAuditFields | null {
  try {
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype)
      return null;
    const ds = Object.getOwnPropertyDescriptors(input);
    if (Reflect.ownKeys(ds).length !== keys.length) return null;
    const value: Record<string, unknown> = {};
    for (const key of keys) {
      const d = ds[key];
      if (!d || !('value' in d) || !d.enumerable) return null;
      value[key] = d.value;
    }
    if (
      !INPUT_AUDIT_ACTIONS.includes(value.action as InputAuditAction) ||
      !uuid(value.diagnosticId) ||
      !uuid(value.commandId) ||
      !uuid(value.correlationId) ||
      new Set([value.diagnosticId, value.commandId, value.correlationId]).size !== 3
    )
      return null;
    const valid =
      value.phase === 'INTENT'
        ? value.outcome === 'INTENT' && value.code === 'OK'
        : value.phase === 'RESULT' &&
          ((value.outcome === 'NOT_DISPATCHED' &&
            [
              'BUSY',
              'CLOSED',
              'OWNER_REVOKED',
              'STALE_BINDING',
              'DEADLINE_EXCEEDED',
              'CANCELLED',
              'BINARY_UNAVAILABLE',
              'AUDIT_UNAVAILABLE',
              'INVALID_REQUEST',
            ].includes(value.code as string)) ||
            (value.outcome === 'DISPATCHED_UNCONFIRMED' &&
              [
                'OK',
                'TRANSPORT_FAILED',
                'OWNER_REVOKED',
                'STALE_BINDING',
                'DEADLINE_EXCEEDED',
                'CLOSED',
              ].includes(value.code as string)) ||
            (value.outcome === 'OUTCOME_UNKNOWN' && value.code === 'OUTCOME_UNKNOWN'));
    return valid ? (Object.freeze(value) as InputAuditFields) : null;
  } catch {
    return null;
  }
}
