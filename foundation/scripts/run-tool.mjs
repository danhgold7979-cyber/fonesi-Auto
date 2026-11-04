// Owned development tools only; no caller-controlled executable/shell API.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function runNode(args) {
  // Nested harness fixtures must start a fresh test runner, not inherit child mode.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 65536,
    shell: false,
    windowsHide: true,
  });
  return {
    status: result.status,
    failed: Boolean(result.error || result.signal),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}
export function suitePassed(result) {
  if (result.failed || result.status !== 0) return false;
  const counts = {};
  for (const field of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const matches = [...result.stdout.matchAll(new RegExp(`^# ${field} (.*)$`, 'gm'))];
    if (matches.length !== 1 || !/^(0|[1-9]\d*)$/.test(matches[0][1])) return false;
    counts[field] = Number(matches[0][1]);
    if (!Number.isSafeInteger(counts[field])) return false;
  }
  return (
    counts.tests > 0 &&
    counts.pass === counts.tests &&
    counts.fail === 0 &&
    counts.cancelled === 0 &&
    counts.skipped === 0 &&
    counts.todo === 0
  );
}
