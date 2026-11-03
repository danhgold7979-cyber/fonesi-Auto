import {
  ASSOCIATION_CODES,
  validAssociationUuid,
  validAssociationRevision,
  type AssociationCode,
} from './association-contract.ts';
export type AssociationAudit = Readonly<{
  operation: 'GET' | 'CANDIDATES' | 'BEGIN' | 'REMOVAL' | 'RETURN' | 'CONFIRM' | 'CANCEL';
  stage: 'READ' | 'REQUEST' | 'EXECUTION';
  phase: 'INTENT' | 'RESULT';
  diagnosticId: string;
  operationId: string | null;
  ceremonyId: string | null;
  mode: 'CURRENT' | 'HISTORICAL' | null;
  expectedRevision: number | null;
  resultingRevision: number | null;
  outcome:
    | 'INTENT'
    | 'OBSERVED'
    | 'PENDING'
    | 'UNCHANGED'
    | 'COMMITTED'
    | 'NOT_COMMITTED'
    | 'OUTCOME_UNKNOWN'
    | 'CANCELLED'
    | 'FAILED';
  code: AssociationCode;
}>;
export type AssociationAuditFields = AssociationAudit;
export const ASSOCIATION_AUDIT_FIELDS = Object.freeze([
  'operation',
  'stage',
  'phase',
  'diagnosticId',
  'operationId',
  'ceremonyId',
  'mode',
  'expectedRevision',
  'resultingRevision',
  'outcome',
  'code',
] as const);
export function snapshotAssociationAudit(input: unknown): AssociationAudit | null {
  try {
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype)
      return null;
    const ds = Object.getOwnPropertyDescriptors(input);
    if (Reflect.ownKeys(ds).length !== ASSOCIATION_AUDIT_FIELDS.length) return null;
    const v: Record<string, unknown> = {};
    for (const k of ASSOCIATION_AUDIT_FIELDS) {
      const d = ds[k];
      if (!d || !('value' in d) || !d.enumerable) return null;
      v[k] = d.value;
    }
    if (
      !validAssociationUuid(v.diagnosticId) ||
      (v.operationId !== null && !validAssociationUuid(v.operationId)) ||
      (v.ceremonyId !== null && !validAssociationUuid(v.ceremonyId)) ||
      v.diagnosticId === v.operationId ||
      v.diagnosticId === v.ceremonyId ||
      (v.operationId !== null && v.operationId === v.ceremonyId) ||
      !ASSOCIATION_CODES.some((c) => c === v.code) ||
      !['CURRENT', 'HISTORICAL', null].includes(v.mode as null | string)
    )
      return null;
    const rev = validAssociationRevision;
    let valid = false;
    if (v.operation === 'GET' || v.operation === 'CANDIDATES')
      valid =
        v.stage === 'READ' &&
        v.phase === 'RESULT' &&
        v.operationId === null &&
        v.expectedRevision === null &&
        rev(v.resultingRevision) &&
        (v.ceremonyId === null || v.mode !== null) &&
        ((v.outcome === 'OBSERVED' && v.code === 'OK') ||
          (v.outcome === 'FAILED' && v.code !== 'OK'));
    else if (v.operation === 'CANCEL')
      valid =
        v.stage === 'REQUEST' &&
        v.phase === 'RESULT' &&
        v.operationId !== null &&
        v.mode !== null &&
        rev(v.expectedRevision) &&
        rev(v.resultingRevision) &&
        v.resultingRevision >= v.expectedRevision &&
        v.resultingRevision <= v.expectedRevision + 1 &&
        v.outcome === 'CANCELLED' &&
        v.code === 'CANCELLED';
    else if (
      ['BEGIN', 'REMOVAL', 'RETURN', 'CONFIRM'].includes(v.operation as string) &&
      v.operationId !== null &&
      v.mode !== null &&
      rev(v.expectedRevision) &&
      v.expectedRevision <= Number.MAX_SAFE_INTEGER - 3
    ) {
      if (v.operation !== 'BEGIN' && v.ceremonyId === null) return null;
      if (v.stage === 'REQUEST') {
        if (v.operation === 'BEGIN' && v.ceremonyId !== null) return null;
        valid =
          v.phase === 'INTENT'
            ? v.outcome === 'INTENT' && v.code === 'OK' && v.resultingRevision === null
            : v.phase === 'RESULT' &&
              ((v.outcome === 'PENDING' &&
                v.code === 'OK' &&
                v.resultingRevision === v.expectedRevision + 1) ||
                (v.outcome === 'FAILED' &&
                  v.code !== 'OK' &&
                  (v.resultingRevision === v.expectedRevision + 2 ||
                    v.resultingRevision === v.expectedRevision + 3)));
      } else if (
        v.stage === 'EXECUTION' &&
        v.phase === 'RESULT' &&
        rev(v.resultingRevision) &&
        (v.resultingRevision === v.expectedRevision + 2 ||
          v.resultingRevision === v.expectedRevision + 3)
      ) {
        valid =
          (v.outcome === 'COMMITTED' && v.code === 'OK' && v.ceremonyId !== null) ||
          (v.outcome === 'NOT_COMMITTED' && v.code !== 'OK' && v.code !== 'OUTCOME_UNKNOWN') ||
          (v.outcome === 'OUTCOME_UNKNOWN' &&
            v.code === 'OUTCOME_UNKNOWN' &&
            v.ceremonyId !== null);
      }
    }
    return valid ? (Object.freeze(v) as AssociationAudit) : null;
  } catch {
    return null;
  }
}
