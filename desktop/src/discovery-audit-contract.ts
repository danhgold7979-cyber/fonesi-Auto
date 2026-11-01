import {
  DISCOVERY_CODES,
  DISCOVERY_FAILURE_CODES,
  validDiscoveryRevision,
  validDiscoveryUuid,
  type DiscoveryCode,
} from './discovery-contract.ts';
export type DiscoveryAudit = Readonly<{
  operation: 'READ' | 'START' | 'REFRESH' | 'STOP';
  stage: 'READ' | 'REQUEST' | 'EXECUTION' | 'TRANSPORT';
  phase: 'INTENT' | 'RESULT';
  diagnosticId: string;
  operationId: string | null;
  expectedRevision: number | null;
  resultingRevision: number | null;
  outcome:
    | 'INTENT'
    | 'OBSERVED'
    | 'PENDING'
    | 'STARTED'
    | 'COMMITTED'
    | 'NOT_COMMITTED'
    | 'FAILED'
    | 'CLEANUP_RETIRED'
    | 'UNRETIRED'
    | 'OUTCOME_UNKNOWN';
  code: 'OK' | DiscoveryCode;
}>;
export const DISCOVERY_AUDIT_FIELDS = Object.freeze([
  'operation',
  'stage',
  'phase',
  'diagnosticId',
  'operationId',
  'expectedRevision',
  'resultingRevision',
  'outcome',
  'code',
] as const);
export function validDiscoveryAuditTuple(input: Record<string, unknown>): boolean {
  try {
    const v: Record<string, unknown> = Object.create(null);
    for (const k of DISCOVERY_AUDIT_FIELDS) {
      const d = Object.getOwnPropertyDescriptor(input, k);
      if (!d || !('value' in d) || !d.enumerable) return false;
      v[k] = d.value;
    }
    if (
      !validDiscoveryUuid(v.diagnosticId) ||
      (v.operationId !== null && !validDiscoveryUuid(v.operationId)) ||
      v.diagnosticId === v.operationId ||
      !['INTENT', 'RESULT'].includes(v.phase as string) ||
      (v.code !== 'OK' && !DISCOVERY_CODES.some((x) => x === v.code))
    )
      return false;
    const rev = validDiscoveryRevision;
    if (v.stage === 'TRANSPORT') {
      if (
        v.operation !== 'START' ||
        v.operationId === null ||
        !rev(v.expectedRevision) ||
        v.resultingRevision !== null
      )
        return false;
      if (v.phase === 'INTENT') return v.outcome === 'INTENT' && v.code === 'OK';
      return (
        (v.outcome === 'OBSERVED' && v.code === 'OK') ||
        (v.outcome === 'FAILED' && DISCOVERY_FAILURE_CODES.some((x) => x === v.code)) ||
        (v.outcome === 'OUTCOME_UNKNOWN' &&
          ['OUTCOME_UNKNOWN', 'RECOVERY_REQUIRED'].includes(v.code as string))
      );
    }
    if (v.operation === 'READ')
      return (
        v.stage === 'READ' &&
        v.phase === 'RESULT' &&
        v.operationId === null &&
        v.expectedRevision === null &&
        rev(v.resultingRevision) &&
        ((v.outcome === 'OBSERVED' && v.code === 'OK') ||
          (v.outcome === 'FAILED' && v.code !== 'OK'))
      );
    if (
      !['START', 'REFRESH', 'STOP'].includes(v.operation as string) ||
      !['REQUEST', 'EXECUTION'].includes(v.stage as string)
    )
      return false;
    if (
      v.operation === 'STOP'
        ? v.expectedRevision !== null
        : v.expectedRevision !== null && !rev(v.expectedRevision)
    )
      return false;
    if (v.stage === 'REQUEST' && v.phase === 'RESULT' && v.outcome === 'FAILED')
      return v.code !== 'OK' && rev(v.resultingRevision);
    if (v.operationId === null) return false;
    if (v.operation !== 'STOP' && !rev(v.expectedRevision)) return false;
    if (v.phase === 'INTENT')
      return (
        v.operation !== 'STOP' &&
        v.outcome === 'INTENT' &&
        v.code === 'OK' &&
        v.resultingRevision === null
      );
    if (!rev(v.resultingRevision)) return false;
    if (v.stage === 'REQUEST') return v.outcome === 'PENDING' && v.code === 'OK';
    if (v.outcome === 'UNRETIRED' || v.outcome === 'OUTCOME_UNKNOWN')
      return [
        'OUTCOME_UNKNOWN',
        'RECOVERY_REQUIRED',
        'CLOSED',
        'OWNER_REVOKED',
        'SESSION_REVOKED',
      ].includes(v.code as string);
    if (v.operation === 'STOP') return v.outcome === 'CLEANUP_RETIRED' && v.code === 'OK';
    if (v.operation === 'START')
      return (
        (v.outcome === 'STARTED' && v.code === 'OK') ||
        (v.outcome === 'FAILED' && DISCOVERY_FAILURE_CODES.some((x) => x === v.code))
      );
    return (
      (v.outcome === 'COMMITTED' &&
        (v.code === 'OK' ||
          ['SESSION_REVOKED', 'OWNER_REVOKED', 'CLOSED'].includes(v.code as string))) ||
      (v.outcome === 'NOT_COMMITTED' && DISCOVERY_FAILURE_CODES.some((x) => x === v.code))
    );
  } catch {
    return false;
  }
}
