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
