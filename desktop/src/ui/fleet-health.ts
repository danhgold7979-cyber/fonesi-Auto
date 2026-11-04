import { snapshotFleetSnapshot, type FleetSnapshot } from '../fleet-contract.ts';
import type { UiSnapshot } from './ui-model.ts';

// An internal consistency binding, not independent authentication of an IPC sender.
// Production calls this only after the existing main fleet response validation.
export type FleetHealth = Readonly<{
  source: 'MAIN_FLEET_PROJECTION';
  scope: 'CAPTURED_REGISTRY_RECORDS';
  registryRevision: number;
  selection: FleetSnapshot['selection'];
  records: FleetSnapshot['devices'];
  recordCount: number;
  observationTime: null;
  verificationTime: null;
}>;
const healthBySnapshot = new WeakMap<object, FleetHealth>();
const empty = Object.freeze([]);
const rows = Object.freeze({ devices: empty, accounts: empty, media: empty, jobs: empty });
export function projectFleetUi(
  input: unknown,
  state: 'READY' | 'LOADING' | 'ERROR',
  healthAvailable = true,
): UiSnapshot {
  if (state === 'LOADING') return Object.freeze({ status: 'LOADING', ...rows });
  const fleet = state === 'READY' ? snapshotFleetSnapshot(input) : null;
  if (!fleet) return Object.freeze({ status: 'ERROR', code: 'INVALID_RESPONSE', ...rows });
  if (fleet.availability === 'UNAVAILABLE')
    return Object.freeze({
      status: 'UNAVAILABLE',
      reason: fleet.reason as 'BINARY_UNAVAILABLE' | 'LIVE_DISCOVERY_UNAVAILABLE',
      ...rows,
    });
  const snapshot: UiSnapshot = Object.freeze({
    status: 'READY',
    provenance: 'MAIN_OBSERVED',
    ...rows,
    devices: Object.freeze(
      fleet.devices.map((device) =>
        Object.freeze({
          id: device.deviceId,
          generation: device.generation,
          name: device.label,
          serial: '—',
          status: device.state,
          connection: 'UNKNOWN',
        }),
      ),
    ),
  });
  if (healthAvailable === true)
    healthBySnapshot.set(
      snapshot,
      Object.freeze({
        source: 'MAIN_FLEET_PROJECTION',
        scope: 'CAPTURED_REGISTRY_RECORDS',
        registryRevision: fleet.registryRevision,
        selection: fleet.selection,
        records: fleet.devices,
        recordCount: fleet.devices.length,
        observationTime: null,
        verificationTime: null,
      }),
    );
  return snapshot;
}
export function readFleetHealth(snapshot: unknown): FleetHealth | null {
  return snapshot !== null && typeof snapshot === 'object'
    ? (healthBySnapshot.get(snapshot) ?? null)
    : null;
}

// The renderer retains this per view even when it clears failed/unknown display data.
// Revisions order records within that view; they make no claim about elapsed time.
export function createFleetRevisionGate() {
  let registryRevision = -1,
    selectionRevision = -1;
  return Object.freeze({
    admit(input: unknown): boolean {
      const fleet = snapshotFleetSnapshot(input);
      if (
        !fleet ||
        fleet.registryRevision < registryRevision ||
        fleet.selection.revision < selectionRevision
      )
        return false;
      registryRevision = fleet.registryRevision;
      selectionRevision = fleet.selection.revision;
      return true;
    },
  });
}

export const FLEET_CSV_LIMITS = Object.freeze({
  records: 256,
  cellCodeUnits: 256,
  utf8Bytes: 262144,
});
export const FLEET_CSV_COLUMNS = Object.freeze([
  'schema_version',
  'source',
  'scope',
  'registry_revision',
  'selection_revision',
  'record_count',
  'device_id',
  'generation',
  'label',
  'state',
  'device_verification',
  'observation_time_availability',
  'verification_time_availability',
] as const);

// A string primitive, not a report-source admission API. Formula protection changes
// the lexical representation; CSV quoting does not certify spreadsheet auto-typing.
export function encodeFleetCsvCell(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > FLEET_CSV_LIMITS.cellCodeUnits) return null;
  for (let i = 0; i < input.length; i++) {
    const unit = input.charCodeAt(i);
    if ((unit < 32 && unit !== 9 && unit !== 10 && unit !== 13) || unit === 127) return null;
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = input.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return null;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return null;
  }
  const value = /^\s*[=+@-]|^[\t\r\n]/u.test(input) ? `'${input}` : input;
  return `"${value.replaceAll('"', '""')}"`;
}
export type FleetCsvPreview = Readonly<{
  source: FleetHealth['source'];
  scope: FleetHealth['scope'];
  registryRevision: number;
  selectionRevision: number;
  recordCount: number;
  csv: string;
  utf8Bytes: number;
}>;
const csvContexts = new WeakMap<object, string>();
export function captureFleetCsvPreview(snapshot: unknown): FleetCsvPreview | null {
  const health = readFleetHealth(snapshot);
  if (!health || health.recordCount > FLEET_CSV_LIMITS.records) return null;
  const encoder = new TextEncoder();
  let csv = '',
    utf8Bytes = 0;
  const append = (values: readonly string[]): boolean => {
    const cells = values.map(encodeFleetCsvCell);
    if (cells.some((cell) => cell === null)) return false;
    const line = `${cells.join(',')}\r\n`;
    const size = encoder.encode(line).byteLength;
    if (utf8Bytes + size > FLEET_CSV_LIMITS.utf8Bytes) return false;
    utf8Bytes += size;
    csv += line;
    return true;
  };
  if (!append(FLEET_CSV_COLUMNS)) return null;
  for (const device of health.records) {
    if (
      !append([
        '1',
        health.source,
        health.scope,
        String(health.registryRevision),
        String(health.selection.revision),
        String(health.recordCount),
        device.deviceId,
        String(device.generation),
        device.label,
        device.state,
        device.verification,
        'NOT_PROVIDED_BY_SOURCE',
        'NOT_PROVIDED_BY_SOURCE',
      ])
    )
      return null;
  }
  const preview = Object.freeze({
    source: health.source,
    scope: health.scope,
    registryRevision: health.registryRevision,
    selectionRevision: health.selection.revision,
    recordCount: health.recordCount,
    csv,
    utf8Bytes,
  });
  csvContexts.set(preview, JSON.stringify(health));
  return preview;
}

// Compare admitted semantic content, not projection allocation identity. This is
// an internal consistency check; caller lifetime still owns pending/revocation.
export function isFleetCsvPreviewCurrent(preview: unknown, snapshot: unknown): boolean {
  if (!preview || typeof preview !== 'object') return false;
  const context = csvContexts.get(preview),
    health = readFleetHealth(snapshot);
  return context !== undefined && health !== null && context === JSON.stringify(health);
}
