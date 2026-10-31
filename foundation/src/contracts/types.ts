export type UnavailableEnvelope = {
  readonly version: 1;
  readonly status: 'UNAVAILABLE';
  readonly reason: 'NOT_IMPLEMENTED' | 'DEPENDENCY_BLOCKED' | 'UNSUPPORTED';
  readonly correlationId: string;
};

export type ValidationCode = 'VALID' | 'INVALID_SHAPE' | 'INVALID_FIELD' | 'UNSUPPORTED_VERSION';
