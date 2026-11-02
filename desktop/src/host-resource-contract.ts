export const HOST_RESOURCE_CHANNEL = 'foundation:host-resources:v1';
export const HOST_RESOURCE_LIMIT = 8192;
export const HOST_RESOURCE_FRESH_MS = 5000;
export const HOST_RESOURCE_CODES = [
  'OK',
  'BUSY',
  'CANCELLED',
  'CLOSED',
  'DEADLINE',
  'INVALID',
  'UNAVAILABLE',
  'WORKER_FAILED',
  'SESSION_REVOKED',
] as const;
export type HostResourceCode = (typeof HOST_RESOURCE_CODES)[number];
export type HostResourceRequest =
  | Readonly<{ version: 1; requestId: string; method: 'SAMPLE' }>
  | Readonly<{ version: 1; requestId: string; method: 'CANCEL'; targetId: string }>;
export const HOST_METRICS = ['hostCpu', 'mainCpu', 'totalRam', 'freeRam', 'mainRss'] as const;
export type HostMetricKey = (typeof HOST_METRICS)[number];
export type HostMetric = Readonly<{
  unit: 'PERCENT' | 'BYTES';
  source:
    | 'NODE_OS_CPUS'
    | 'NODE_PROCESS_CPU_USAGE'
    | 'NODE_OS_TOTALMEM'
    | 'NODE_OS_FREEMEM'
    | 'NODE_PROCESS_MEMORY_RSS';
  scope: 'TOTAL_HOST' | 'MAIN_PROCESS';
  value: number | null;
  code: 'OK' | 'COUNTER_INVALID' | 'PROBE_FAILED' | 'UNSUPPORTED_PLATFORM';
}>;
export type HostResourceSample = Readonly<{
  version: 1;
  sequence: number;
  startedUtc: number;
  endedUtc: number;
  intervalMs: number;
  metrics: Readonly<Record<HostMetricKey, HostMetric>>;
}>;
export const HOST_METRIC_INFO = Object.freeze({
  hostCpu: { unit: 'PERCENT', source: 'NODE_OS_CPUS', scope: 'TOTAL_HOST' },
  mainCpu: { unit: 'PERCENT', source: 'NODE_PROCESS_CPU_USAGE', scope: 'MAIN_PROCESS' },
  totalRam: { unit: 'BYTES', source: 'NODE_OS_TOTALMEM', scope: 'TOTAL_HOST' },
  freeRam: { unit: 'BYTES', source: 'NODE_OS_FREEMEM', scope: 'TOTAL_HOST' },
  mainRss: { unit: 'BYTES', source: 'NODE_PROCESS_MEMORY_RSS', scope: 'MAIN_PROCESS' },
} as const);
export type HostResourceResponse = Readonly<{
  version: 1;
  requestId: string | null;
  code: HostResourceCode;
  sample: HostResourceSample | null;
  remainingFreshMs: number;
}>;
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const id = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^h[1-9][0-9]{0,5}$/.test(value) &&
  value.length <= 7 &&
  Number(value.slice(1)) <= 65536;
function decode(raw: unknown): unknown {
  if (
    typeof raw !== 'string' ||
    raw.length > HOST_RESOURCE_LIMIT ||
    new TextEncoder().encode(raw).length > HOST_RESOURCE_LIMIT
  )
    return null;
  try {
    const value: unknown = JSON.parse(raw);
    return JSON.stringify(value) === raw ? value : null;
  } catch {
    return null;
  }
}
export function parseHostResourceRequest(raw: unknown): HostResourceRequest | null {
  const value = decode(raw);
  if (
    !exact(value, [
      'version',
      'requestId',
      'method',
      ...(typeof value === 'object' &&
      value !== null &&
      'method' in value &&
      value.method === 'CANCEL'
        ? ['targetId']
        : []),
    ]) ||
    value.version !== 1 ||
    !id(value.requestId)
  )
    return null;
  if (value.method === 'SAMPLE')
    return Object.freeze({ version: 1, requestId: value.requestId, method: 'SAMPLE' });
  if (value.method === 'CANCEL' && id(value.targetId))
    return Object.freeze({
      version: 1,
      requestId: value.requestId,
      method: 'CANCEL',
      targetId: value.targetId,
    });
  return null;
}
export function parseHostResourceSample(raw: unknown): HostResourceSample | null {
  const value = decode(raw);
  if (
    !exact(value, ['version', 'sequence', 'startedUtc', 'endedUtc', 'intervalMs', 'metrics']) ||
    value.version !== 1 ||
    !integer(value.sequence) ||
    value.sequence < 1 ||
    !integer(value.startedUtc) ||
    !integer(value.endedUtc) ||
    value.endedUtc < value.startedUtc ||
    typeof value.intervalMs !== 'number' ||
    !Number.isFinite(value.intervalMs) ||
    value.intervalMs < 1000 ||
    value.intervalMs > 3000 ||
    !exact(value.metrics, HOST_METRICS)
  )
    return null;
  const metrics = {} as Record<HostMetricKey, HostMetric>;
  for (const key of HOST_METRICS) {
    const metric = value.metrics[key];
    if (
      !exact(metric, ['value', 'code', 'unit', 'source', 'scope']) ||
      !['OK', 'COUNTER_INVALID', 'PROBE_FAILED', 'UNSUPPORTED_PLATFORM'].includes(
        metric.code as string,
      )
    )
      return null;
    if (
      metric.unit !== HOST_METRIC_INFO[key].unit ||
      metric.source !== HOST_METRIC_INFO[key].source ||
      metric.scope !== HOST_METRIC_INFO[key].scope
    )
      return null;
    if (metric.code === 'OK') {
      if (
        typeof metric.value !== 'number' ||
        !Number.isFinite(metric.value) ||
        metric.value < 0 ||
        Object.is(metric.value, -0) ||
        (key.endsWith('Cpu') ? metric.value > 100 : !integer(metric.value))
      )
        return null;
    } else if (metric.value !== null) return null;
    metrics[key] = Object.freeze({
      ...HOST_METRIC_INFO[key],
      value: metric.value as number | null,
      code: metric.code as HostMetric['code'],
    });
  }
  if (
    metrics.totalRam.value !== null &&
    metrics.freeRam.value !== null &&
    metrics.freeRam.value > metrics.totalRam.value
  )
    return null;
  return Object.freeze({
    version: 1,
    sequence: value.sequence,
    startedUtc: value.startedUtc,
    endedUtc: value.endedUtc,
    intervalMs: value.intervalMs,
    metrics: Object.freeze(metrics),
  });
}
export function hostResourceResponse(
  requestId: string | null,
  code: HostResourceCode,
  sample: HostResourceSample | null = null,
  remainingFreshMs = 0,
): string {
  return JSON.stringify({ version: 1, requestId, code, sample, remainingFreshMs });
}
export function parseHostResourceResponse(raw: unknown): HostResourceResponse | null {
  const value = decode(raw);
  if (
    !exact(value, ['version', 'requestId', 'code', 'sample', 'remainingFreshMs']) ||
    value.version !== 1 ||
    (value.requestId !== null && !id(value.requestId)) ||
    !HOST_RESOURCE_CODES.includes(value.code as HostResourceCode) ||
    typeof value.remainingFreshMs !== 'number' ||
    !Number.isFinite(value.remainingFreshMs) ||
    value.remainingFreshMs < 0 ||
    value.remainingFreshMs > HOST_RESOURCE_FRESH_MS
  )
    return null;
  const sample =
    value.sample === null ? null : parseHostResourceSample(JSON.stringify(value.sample));
  if (value.code === 'OK' ? !sample : value.sample !== null || value.remainingFreshMs !== 0)
    return null;
  return Object.freeze({
    version: 1,
    requestId: value.requestId as string | null,
    code: value.code as HostResourceCode,
    sample,
    remainingFreshMs: value.remainingFreshMs,
  });
}
