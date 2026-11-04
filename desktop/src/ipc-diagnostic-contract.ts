import type { ErrorCode, Method } from './ipc-contract.ts';
import { RESPONSE_BYTES } from './ipc-contract.ts';
import type { LogHealth } from './log-contract.ts';
import { diagnosticId, publicErrorCode, nullableDiagnosticCode } from './log-contract.ts';
export const DIAGNOSTIC_CHANNEL = 'foundation:request:v2';
function health(value: unknown): value is LogHealth {
  return value === 'AVAILABLE' || value === 'DEGRADED';
}
function result(method: Method) {
  return method === 'health.get'
    ? { kind: 'health', status: 'READY', services: 'UNAVAILABLE' }
    : { kind: 'settings', revision: 0, persistence: 'NOT_PERSISTED', theme: 'LIGHT' };
}
export function diagnosticError(
  code: ErrorCode,
  reference: string | null,
  logging: LogHealth,
): string {
  if (
    !publicErrorCode(code) ||
    !health(logging) ||
    (reference === null && code === 'INTERNAL_FAILURE' && logging !== 'DEGRADED') ||
    (reference === null ? !nullableDiagnosticCode(code) : !diagnosticId(reference))
  )
    return JSON.stringify({
      version: 2,
      ok: false,
      diagnosticId: null,
      logging: 'DEGRADED',
      code: 'INTERNAL_FAILURE',
    });
  return JSON.stringify({ version: 2, ok: false, diagnosticId: reference, logging, code });
}
export function localDiagnosticError(code: ErrorCode): string {
  return JSON.stringify({
    version: 2,
    ok: false,
    diagnosticId: null,
    logging: 'DEGRADED',
    code: publicErrorCode(code) ? code : 'INTERNAL_FAILURE',
  });
}
export function diagnosticSuccess(
  requestId: string,
  method: Method,
  reference: string,
  logging: LogHealth,
): string {
  if (
    typeof requestId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,32}$/.test(requestId) ||
    !['health.get', 'settings.get'].includes(method) ||
    !diagnosticId(reference) ||
    !health(logging)
  )
    return localDiagnosticError('INTERNAL_FAILURE');
  return JSON.stringify({
    version: 2,
    ok: true,
    requestId,
    diagnosticId: reference,
    logging,
    result: result(method),
  });
}
// Exact own-producer serialization rejects duplicate keys, including nested fields.
export function validateDiagnosticResponse(
  raw: unknown,
  requestId: string,
  method: Method,
): string | null {
  if (
    typeof raw !== 'string' ||
    raw.length > RESPONSE_BYTES ||
    new TextEncoder().encode(raw).byteLength > RESPONSE_BYTES
  )
    return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const response = value as Record<string, unknown>;
    if (response.version !== 2 || !health(response.logging)) return null;
    if (
      response.ok === false &&
      response.code === 'INTERNAL_FAILURE' &&
      response.diagnosticId === null &&
      response.logging !== 'DEGRADED'
    )
      return null;
    let canonical: string;
    if (response.ok === true) {
      if (response.requestId !== requestId || !diagnosticId(response.diagnosticId)) return null;
      canonical = diagnosticSuccess(requestId, method, response.diagnosticId, response.logging);
    } else if (response.ok === false) {
      if (
        !publicErrorCode(response.code) ||
        (response.diagnosticId === null
          ? !nullableDiagnosticCode(response.code)
          : !diagnosticId(response.diagnosticId))
      )
        return null;
      canonical = diagnosticError(
        response.code as ErrorCode,
        response.diagnosticId as string | null,
        response.logging,
      );
    } else return null;
    return raw === canonical ? canonical : null;
  } catch {
    return null;
  }
}
