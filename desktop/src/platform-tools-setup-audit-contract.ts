import {
  SETUP_CODES,
  validSetupRevision,
  validSetupUuid,
  type SetupCode,
} from './platform-tools-setup-contract.ts';
export type SetupAudit = Readonly<{
  operation: 'READ' | 'REQUEST' | 'PROVISION';
  phase: 'INTENT' | 'RESULT';
  diagnosticId: string;
  operationId: string | null;
  expectedRevision: number | null;
  resultingRevision: number | null;
  action: null | 'INSTALL' | 'ROLLBACK';
  outcome:
    | 'INTENT'
    | 'OBSERVED'
    | 'PENDING'
    | 'VERIFIED_LOCAL'
    | 'DECLINED'
    | 'FAILED'
    | 'OUTCOME_UNKNOWN';
  code: 'OK' | SetupCode;
}>;
export function validSetupAuditTuple(v: Record<string, unknown>): boolean {
  if (
    !validSetupUuid(v.diagnosticId) ||
    (v.operationId !== null && !validSetupUuid(v.operationId)) ||
    v.diagnosticId === v.operationId ||
    !['READ', 'REQUEST', 'PROVISION'].includes(v.operation as string) ||
    !['INTENT', 'RESULT'].includes(v.phase as string) ||
    (v.code !== 'OK' && !SETUP_CODES.includes(v.code as SetupCode))
  )
    return false;
  if (v.operationId === null && v.operation !== 'READ') return false;
  if (v.phase === 'INTENT')
    return (
      v.operation !== 'READ' &&
      v.outcome === 'INTENT' &&
      v.code === 'OK' &&
      validSetupRevision(v.expectedRevision) &&
      v.resultingRevision === null
    );
  if (v.operation === 'READ')
    return (
      v.expectedRevision === null &&
      ((v.outcome === 'OBSERVED' && v.code === 'OK' && validSetupRevision(v.resultingRevision)) ||
        (v.outcome === 'FAILED' && v.code !== 'OK' && v.resultingRevision === null))
    );
  if (
    !validSetupRevision(v.expectedRevision) ||
    (v.resultingRevision !== null && !validSetupRevision(v.resultingRevision))
  )
    return false;
  if (v.outcome === 'PENDING')
    return v.operation === 'REQUEST' && v.code === 'OK' && v.resultingRevision !== null;
  if (v.outcome === 'VERIFIED_LOCAL')
    return v.operation === 'PROVISION' && v.code === 'OK' && v.resultingRevision !== null;
  if (v.outcome === 'DECLINED')
    return (
      ['TERMS_REQUIRED', 'TERMS_DECLINED', 'SETUP_CANCELLED'].includes(v.code as string) &&
      v.resultingRevision !== null
    );
  if (v.outcome === 'OUTCOME_UNKNOWN')
    return ['OUTCOME_UNKNOWN', 'RECOVERY_REQUIRED'].includes(v.code as string);
  return v.outcome === 'FAILED' && v.code !== 'OK';
}

// Schema 6 retains the original tuple validator above; schema 8 adds selected action.
export function validSetupAuditV2Tuple(v: Record<string, unknown>): boolean {
  if (!validSetupAuditTuple(v)) return false;
  if (v.operation === 'READ' || v.operation === 'REQUEST') return v.action === null;
  if (v.action === 'INSTALL' || v.action === 'ROLLBACK') return true;
  if (v.action !== null || v.phase !== 'RESULT') return false;
  return (
    (v.outcome === 'DECLINED' &&
      ['TERMS_REQUIRED', 'TERMS_DECLINED', 'SETUP_CANCELLED'].includes(v.code as string)) ||
    (v.outcome === 'FAILED' && ['INTERNAL_FAILURE', 'OWNER_REVOKED'].includes(v.code as string))
  );
}
