export const SCHEME = 'auto-foundation';
export const ENTRY_URL = 'auto-foundation://app/status.html';
export const CSP = "default-src 'none'; script-src 'none'; style-src 'none'; connect-src 'none'; img-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";

// Raw strings must be exact. Browser normalization before this function is separate.
export function permitsAsset(url: unknown, method: unknown): boolean {
  return typeof url === 'string' && url === ENTRY_URL && method === 'GET';
}

export type LifecyclePhase = 'IDLE' | 'OPEN' | 'CLOSING' | 'DISPOSED';

export const ASSET_SHA256 = '7da925accaee7eaa936c6997350de99f23af30dbcf1981a95fb07fb296745aca';
