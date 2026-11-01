import {
  RUNTIME_VERSION_CODES,
  RUNTIME_VERSION_FAILED_CODES,
  validRuntimeVersionRevision,
  validRuntimeVersionUuid,
  type RuntimeVersionCode,
} from './runtime-version-contract.ts';
export type RuntimeVersionAudit = Readonly<{
  operation: 'READ' | 'REQUEST' | 'VERIFY';
  phase: 'INTENT' | 'RESULT';
  diagnosticId: string;
  operationId: string | null;
  expectedRevision: number | null;
  resultingRevision: number | null;
  installationRevision: number | null;
  outcome: 'INTENT' | 'OBSERVED' | 'PENDING' | 'VERIFIED' | 'FAILED' | 'OUTCOME_UNKNOWN';
  code: 'OK' | RuntimeVersionCode;
}>;
export function validRuntimeVersionAuditTuple(input: Record<string, unknown>): boolean {
  try {
    // This tuple helper also accepts the common log fields; never invokes accessors.
    const keys = [
      'operation',
      'phase',
      'diagnosticId',
      'operationId',
      'expectedRevision',
      'resultingRevision',
      'installationRevision',
      'outcome',
      'code',
    ];
    const v: Record<string, unknown> = Object.create(null);
    for (const k of keys) {
      const d = Object.getOwnPropertyDescriptor(input, k);
      if (!d || !('value' in d) || !d.enumerable) return false;
      v[k] = d.value;
    }
    if (
      !validRuntimeVersionUuid(v.diagnosticId) ||
      (v.operationId !== null && !validRuntimeVersionUuid(v.operationId)) ||
      v.diagnosticId === v.operationId ||
      !['READ', 'REQUEST', 'VERIFY'].includes(v.operation as string) ||
      !['INTENT', 'RESULT'].includes(v.phase as string) ||
      (v.code !== 'OK' && !RUNTIME_VERSION_CODES.some((c) => c === v.code))
    )
      return false;
    const positive = (n: unknown) => validRuntimeVersionRevision(n) && n > 0;
    if (v.operation === 'READ')
      return (
        v.operationId === null &&
        v.expectedRevision === null &&
        (v.installationRevision === null || positive(v.installationRevision)) &&
        v.phase === 'RESULT' &&
        ((v.outcome === 'OBSERVED' &&
          v.code === 'OK' &&
          validRuntimeVersionRevision(v.resultingRevision)) ||
          (v.outcome === 'FAILED' && v.code !== 'OK' && v.resultingRevision === null))
      );
    if (
      v.operationId === null ||
      !validRuntimeVersionRevision(v.expectedRevision) ||
      !positive(v.installationRevision)
    )
      return false;
    if (v.phase === 'INTENT')
      return v.outcome === 'INTENT' && v.code === 'OK' && v.resultingRevision === null;
    if (v.outcome === 'OUTCOME_UNKNOWN')
      return (
        ['OUTCOME_UNKNOWN', 'RECOVERY_REQUIRED'].includes(v.code as string) &&
        validRuntimeVersionRevision(v.resultingRevision)
      );
    if (v.operation === 'REQUEST')
      return (
        (v.outcome === 'PENDING' &&
          v.code === 'OK' &&
          validRuntimeVersionRevision(v.resultingRevision)) ||
        (v.outcome === 'FAILED' && v.code !== 'OK' && v.resultingRevision === null)
      );
    return (
      validRuntimeVersionRevision(v.resultingRevision) &&
      ((v.outcome === 'VERIFIED' && v.code === 'OK') ||
        (v.outcome === 'FAILED' && RUNTIME_VERSION_FAILED_CODES.some((c) => c === v.code)))
    );
  } catch {
    return false;
  }
}
