export const SCHEME = 'auto-foundation';
export const ENTRY_URL = 'auto-foundation://app/status.html';
export const RENDERER_URL = 'auto-foundation://app/renderer.js';
export const CSP =
  "default-src 'none'; script-src 'self'; style-src 'none'; connect-src 'none'; img-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";

// Raw strings must be exact. Browser normalization before this function is separate.
export function permitsAsset(url: unknown, method: unknown): boolean {
  return typeof url === 'string' && (url === ENTRY_URL || url === RENDERER_URL) && method === 'GET';
}

export type LifecyclePhase = 'IDLE' | 'OPEN' | 'CLOSING' | 'DISPOSED';

export const ASSET_SHA256 = 'f0773b61abd7178bc8e03572a8c814d2b8695f100bfc03f1cd826e0e3ebaa0ff';
