export const SCHEME = 'auto-foundation';
export const ENTRY_URL = 'auto-foundation://app/status.html';
export const RENDERER_URL = 'auto-foundation://app/renderer.js';
export const STYLE_URL = 'auto-foundation://app/v9.css';
export const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";

// Raw strings must be exact. Browser normalization before this function is separate.
export function permitsAsset(url: unknown, method: unknown): boolean {
  return (
    typeof url === 'string' &&
    (url === ENTRY_URL || url === RENDERER_URL || url === STYLE_URL) &&
    method === 'GET'
  );
}

export type LifecyclePhase = 'IDLE' | 'OPEN' | 'CLOSING' | 'DISPOSED';

export const ASSET_SHA256 = '8a47911fc621e9aa4df7ea9480eb414da4072fa9ee49a64266e4386d56d5037b';

export const STYLE_SHA256 = '1ab2d2d9d1e035dc2353df0c9db12fcce6943f1d59aaa1ea5d9a246fe474822f';
