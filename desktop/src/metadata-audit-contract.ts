import {
  METADATA_CODES,
  METADATA_FIELDS,
  validMetadataRevision,
  validMetadataUuid,
  type MetadataCode,
  type MetadataField,
} from './metadata-contract.ts';
export type MetadataAudit = Readonly<{
  operation: 'GET' | 'READ';
  stage: 'READ' | 'REQUEST' | 'EXECUTION';
  phase: 'INTENT' | 'RESULT';
  diagnosticId: string;
  operationId: string | null;
  field: MetadataField | null;
  expectedRevision: number | null;
  resultingRevision: number | null;
  outcome:
    | 'INTENT'
    | 'OBSERVED'
    | 'PENDING'
    | 'FAILED'
    | 'NOT_DISPATCHED'
    | 'DISPATCHED_UNCONFIRMED'
    | 'OUTCOME_UNKNOWN';
  code: 'OK' | MetadataCode;
}>;
export const METADATA_AUDIT_FIELDS = Object.freeze([
  'operation',
  'stage',
  'phase',
  'diagnosticId',
  'operationId',
  'field',
  'expectedRevision',
  'resultingRevision',
  'outcome',
  'code',
] as const);
export function snapshotMetadataAudit(input: unknown): MetadataAudit | null {
  try {
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype)
      return null;
    const ds = Object.getOwnPropertyDescriptors(input);
    if (Reflect.ownKeys(ds).length !== METADATA_AUDIT_FIELDS.length) return null;
    const v: Record<string, unknown> = {};
    for (const key of METADATA_AUDIT_FIELDS) {
      const d = ds[key];
      if (!d || !('value' in d) || !d.enumerable) return null;
      v[key] = d.value;
    }
    if (
      !validMetadataUuid(v.diagnosticId) ||
      (v.operationId !== null && !validMetadataUuid(v.operationId)) ||
      v.diagnosticId === v.operationId ||
      !['INTENT', 'RESULT'].includes(v.phase as string) ||
      (v.code !== 'OK' && !METADATA_CODES.includes(v.code as MetadataCode))
    )
      return null;
    const rev = validMetadataRevision;
    let valid = false;
    if (v.operation === 'GET')
      valid =
        v.stage === 'READ' &&
        v.phase === 'RESULT' &&
        v.operationId === null &&
        v.field === null &&
        v.expectedRevision === null &&
        rev(v.resultingRevision) &&
        ((v.outcome === 'OBSERVED' && v.code === 'OK') ||
          (v.outcome === 'FAILED' && v.code !== 'OK'));
    else if (
      v.operation === 'READ' &&
      ['REQUEST', 'EXECUTION'].includes(v.stage as string) &&
      METADATA_FIELDS.includes(v.field as MetadataField) &&
      rev(v.expectedRevision)
    ) {
      if (v.stage === 'REQUEST' && v.phase === 'RESULT' && v.outcome === 'FAILED')
        valid =
          rev(v.resultingRevision) &&
          v.code !== 'OK' &&
          (v.operationId === null ||
            ([
              'OWNER_REVOKED',
              'SESSION_REVOKED',
              'STALE_BINDING',
              'DEADLINE_EXCEEDED',
              'AUDIT_UNAVAILABLE',
              'INTERNAL_FAILURE',
            ].includes(v.code as string) &&
              v.resultingRevision === v.expectedRevision));
      else if (v.operationId !== null) {
        if (v.phase === 'INTENT')
          valid =
            v.outcome === 'INTENT' &&
            v.code === 'OK' &&
            v.resultingRevision === null &&
            v.expectedRevision <= Number.MAX_SAFE_INTEGER - 2;
        else if (v.stage === 'REQUEST')
          valid =
            v.outcome === 'PENDING' &&
            v.code === 'OK' &&
            rev(v.resultingRevision) &&
            v.resultingRevision === v.expectedRevision + 1 &&
            v.expectedRevision <= Number.MAX_SAFE_INTEGER - 2;
        else
          valid =
            rev(v.resultingRevision) &&
            v.expectedRevision <= Number.MAX_SAFE_INTEGER - 2 &&
            v.resultingRevision === v.expectedRevision + 2 &&
            ((v.outcome === 'OBSERVED' && v.code === 'OK') ||
              (['NOT_DISPATCHED', 'DISPATCHED_UNCONFIRMED'].includes(v.outcome as string) &&
                v.code !== 'OK') ||
              (v.outcome === 'OUTCOME_UNKNOWN' && v.code === 'OUTCOME_UNKNOWN'));
      }
    }
    return valid ? (Object.freeze(v) as MetadataAudit) : null;
  } catch {
    return null;
  }
}
export function validMetadataAuditTuple(input: Record<string, unknown>): boolean {
  return snapshotMetadataAudit(input) !== null;
}
