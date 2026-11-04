// Disposable lab wire shape only; not the application's IPC contract.
export type HealthRequest = { version: 1; correlation: string };
export type HealthResult = { ok: true; version: 1; correlation: string } |
  { ok: false; code: 'INVALID_REQUEST' | 'UNTRUSTED_SENDER' };
export type LabBridge = { health: (request: HealthRequest) => Promise<HealthResult> };
export function isHealthRequest(value: unknown): value is HealthRequest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Object.keys(row).sort().join(',') === 'correlation,version' && row.version === 1 &&
    typeof row.correlation === 'string' && /^lab-[a-z0-9-]{1,48}$/.test(row.correlation);
}
declare global { interface Window { lab: LabBridge } }
