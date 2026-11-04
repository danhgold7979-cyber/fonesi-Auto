// Main-only injected provider adapter. Admission must establish current runtime,
// retained root lease and profile custody; availability alone proves none of them.
export type NativeSecretProvider = Readonly<{
  isAsyncEncryptionAvailable: () => Promise<boolean>;
  encryptStringAsync: (value: string) => Promise<Buffer>;
  decryptStringAsync: (value: Buffer) => Promise<{ result: string; shouldReEncrypt: boolean }>;
}>;
export type SecretProviderCode =
  | 'KEY_UNAVAILABLE'
  | 'OWNER_REVOKED'
  | 'INVALID_REQUEST'
  | 'DECRYPTION_FAILED';
export class SecretProviderError extends Error {
  readonly code: SecretProviderCode;
  constructor(code: SecretProviderCode) {
    super(code);
    this.code = code;
    Object.freeze(this);
  }
}
const LIMIT = 32768;
function fail(code: SecretProviderCode): never {
  throw new SecretProviderError(code);
}
function text(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= LIMIT &&
    Buffer.byteLength(value, 'utf8') <= LIMIT
  );
}
function copy(value: unknown): Buffer | null {
  try {
    if (!(value instanceof Uint8Array) || !ArrayBuffer.isView(value)) return null;
    const proto = Object.getPrototypeOf(Uint8Array.prototype);
    const length = Object.getOwnPropertyDescriptor(proto, 'byteLength')?.get?.call(value);
    const backing = Object.getOwnPropertyDescriptor(proto, 'buffer')?.get?.call(value);
    if (
      typeof length !== 'number' ||
      length < 1 ||
      length > LIMIT ||
      !(backing instanceof ArrayBuffer)
    )
      return null;
    const result = Buffer.alloc(length);
    Uint8Array.prototype.set.call(result, value);
    return result;
  } catch {
    return null;
  }
}
function decoded(value: unknown): Readonly<{ result: string; shouldReEncrypt: boolean }> | null {
  try {
    if (value === null || typeof value !== 'object') return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 2 || !keys.includes('result') || !keys.includes('shouldReEncrypt'))
      return null;
    const result = Object.getOwnPropertyDescriptor(value, 'result');
    const hint = Object.getOwnPropertyDescriptor(value, 'shouldReEncrypt');
    if (
      !result ||
      !hint ||
      !('value' in result) ||
      !('value' in hint) ||
      !result.enumerable ||
      !hint.enumerable ||
      !text(result.value) ||
      typeof hint.value !== 'boolean'
    )
      return null;
    return Object.freeze({ result: result.value, shouldReEncrypt: hint.value });
  } catch {
    return null;
  }
}
export function createSecretProvider(
  provider: NativeSecretProvider,
  assertAdmitted: () => Promise<void>,
) {
  // Snapshot trusted callbacks once: later ordinary adapter mutation cannot redirect work.
  const available = provider.isAsyncEncryptionAvailable.bind(provider);
  const encrypt = provider.encryptStringAsync.bind(provider);
  const decrypt = provider.decryptStringAsync.bind(provider);
  const admitted = assertAdmitted;
  async function admission() {
    try {
      await admitted();
    } catch {
      fail('OWNER_REVOKED');
    }
  }
  async function ready() {
    await admission();
    let usable: unknown;
    try {
      usable = await available();
    } catch {
      fail('KEY_UNAVAILABLE');
    }
    await admission();
    if (usable !== true) fail('KEY_UNAVAILABLE');
  }
  return Object.freeze({
    encrypt: async (plaintext: string): Promise<Uint8Array> => {
      if (!text(plaintext)) fail('INVALID_REQUEST');
      await ready();
      let raw: unknown;
      try {
        raw = await encrypt(plaintext);
      } catch {
        fail('KEY_UNAVAILABLE');
      }
      // Snapshot before any later await; do not modify provider-owned buffers.
      const output = Buffer.isBuffer(raw) ? copy(raw) : null;
      try {
        await admission();
        if (!output) fail('KEY_UNAVAILABLE');
        return new Uint8Array(output);
      } finally {
        output?.fill(0);
      }
    },
    decrypt: async (
      ciphertext: Uint8Array,
    ): Promise<Readonly<{ result: string; shouldReEncrypt: boolean }>> => {
      const input = copy(ciphertext);
      if (!input) fail('INVALID_REQUEST');
      try {
        await ready();
        let raw: unknown;
        try {
          raw = await decrypt(input);
        } catch {
          fail('DECRYPTION_FAILED');
        }
        const result = decoded(raw);
        await admission();
        if (!result) fail('DECRYPTION_FAILED');
        if (result.shouldReEncrypt) fail('KEY_UNAVAILABLE');
        return result;
      } finally {
        input.fill(0);
      }
    },
  });
}
