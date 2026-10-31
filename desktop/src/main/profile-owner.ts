import { lstatSync, realpathSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';
export const OWNER_MARKER = 'FONESI_AUTO_FOUNDATION_PROFILE_V1\n';

// Trusted launcher creates a fresh owned root; no renderer filesystem interface.
export function prepareOwnedProfile(candidate: unknown): Readonly<Record<'userData' | 'sessionData' | 'logs' | 'crashDumps', string>> {
  if (typeof candidate !== 'string' || !candidate || candidate !== resolve(candidate)) throw new Error('OWNER_REJECTED');
  const compare = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
  const stat = lstatSync(candidate);
  if (!stat.isDirectory() || stat.isSymbolicLink() || compare(realpathSync(candidate)) !== compare(candidate) ||
    !/^fonesi-auto-foundation-[A-Za-z0-9-]+$/.test(basename(candidate))) throw new Error('OWNER_REJECTED');
  const entries = readdirSync(candidate);
  if (entries.length !== 1 || entries[0] !== '.owner') throw new Error('OWNER_REJECTED');
  const marker = join(candidate, '.owner'), markerStat = lstatSync(marker);
  if (!markerStat.isFile() || markerStat.isSymbolicLink() || markerStat.size !== Buffer.byteLength(OWNER_MARKER) ||
    readFileSync(marker, 'utf8') !== OWNER_MARKER) throw new Error('OWNER_REJECTED');
  const paths = { userData: join(candidate, 'profile'), sessionData: join(candidate, 'session'),
    logs: join(candidate, 'logs'), crashDumps: join(candidate, 'crashes') };
  for (const path of Object.values(paths)) mkdirSync(path);
  return Object.freeze(paths);
}
