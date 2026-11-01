// Fixed main-constructed durable audit vocabulary; no row/device payload.
export const DURABLE_CODES = [
  'INVALID_REQUEST',
  'STALE_REVISION',
  'LIMIT_EXCEEDED',
  'OWNER_REVOKED',
  'INVALID_CAPTURE',
  'STALE_CAPTURE',
  'STORAGE_FAILED',
  'RECOVERY_REQUIRED',
  'AUDIT_UNAVAILABLE',
  'REVISION_EXHAUSTED',
  'OUTCOME_UNKNOWN',
  'BUSY',
] as const;
export type DurableCode = (typeof DURABLE_CODES)[number];
export const DURABLE_OPERATIONS = [
  'STARTUP',
  'RECONCILE',
  'DISPLAY',
  'CAPTURE_RESERVE',
  'CAPTURE_COMMIT',
  'HOLD_ADD',
  'HOLD_RELEASE',
  'PRUNE_MARK',
  'PRUNE_COMPLETE',
  'RECOVER_CLASSIFY',
] as const;
export type DurableOperation = (typeof DURABLE_OPERATIONS)[number];
export type DurableHealth = 'AVAILABLE' | 'DEGRADED';
export type DurableAudit = Readonly<{
  operation: DurableOperation;
  phase: 'INTENT' | 'RESULT';
  diagnosticId: string;
  operationId: string;
  expectedRevision: number | null;
  resultingRevision: number | null;
  code: 'OK' | DurableCode;
}>;
