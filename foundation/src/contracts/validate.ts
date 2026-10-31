import type { ValidationCode } from './types.js';

// Input is already parsed data. This is not a hostile same-process sandbox.
export function validateUnavailable(input: unknown): ValidationCode {
  try {
    if (input === null || typeof input !== 'object' || Array.isArray(input) ||
      Object.getPrototypeOf(input) !== Object.prototype) return 'INVALID_SHAPE';
    const names = Object.getOwnPropertyNames(input);
    if (names.length !== 4 || Object.getOwnPropertySymbols(input).length !== 0) return 'INVALID_SHAPE';
    for (const name of names) {
      if (name !== 'version' && name !== 'status' && name !== 'reason' && name !== 'correlationId') return 'INVALID_SHAPE';
      const descriptor = Object.getOwnPropertyDescriptor(input, name);
      if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) return 'INVALID_SHAPE';
    }
    // Reading descriptor.value does not invoke an ordinary input object's getter.
    const version: unknown = Object.getOwnPropertyDescriptor(input, 'version')?.value;
    const status: unknown = Object.getOwnPropertyDescriptor(input, 'status')?.value;
    const reason: unknown = Object.getOwnPropertyDescriptor(input, 'reason')?.value;
    const correlationId: unknown = Object.getOwnPropertyDescriptor(input, 'correlationId')?.value;
    if (typeof version !== 'number' || !Number.isSafeInteger(version)) return 'INVALID_FIELD';
    if (version !== 1) return 'UNSUPPORTED_VERSION';
    if (status !== 'UNAVAILABLE' ||
      (reason !== 'NOT_IMPLEMENTED' && reason !== 'DEPENDENCY_BLOCKED' && reason !== 'UNSUPPORTED') ||
      typeof correlationId !== 'string' || correlationId.length < 1 || correlationId.length > 64) return 'INVALID_FIELD';
    for (let index = 0; index < correlationId.length; index++) {
      const code = correlationId.charCodeAt(index);
      if (!(code === 45 || code === 95 || (code >= 48 && code <= 57) ||
        (code >= 65 && code <= 90) || (code >= 97 && code <= 122))) return 'INVALID_FIELD';
    }
    return 'VALID';
  } catch {
    // Proxy traps can run before throwing; they are outside the accepted input model.
    return 'INVALID_SHAPE';
  }
}
