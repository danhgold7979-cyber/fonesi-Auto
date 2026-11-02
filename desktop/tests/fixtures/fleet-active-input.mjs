// Actual Fleet/controller with explicitly supplied ADB-tagged synthetic rows/proofs.
// This is not native acquisition, physical association, or permission to execute input.
import assert from 'node:assert/strict';
import { createFleetService } from '../../src/main/fleet-service.ts';
import { emptyRegistry, reconcileRegistry } from '../../src/main/transport-registry.ts';
export async function fleetActiveFixture(overrides = {}) {
  let registry = emptyRegistry(),
    next = 10;
  const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const rows = [
    { serial: 'synthetic-a', transportId: '1', state: 'DEVICE' },
    { serial: 'synthetic-b', transportId: '2', state: 'DEVICE' },
  ];
  const step = (sequence, proofs = []) => {
    const r = reconcileRegistry(
      registry,
      { sequence, observedAtUtc: 1000 + sequence, source: 'ADB_DISCOVERY', rows, proofs },
      {
        nextId: () => id(next++),
        budget: { maxDevices: 256, maxBindings: 4096, maxEvidence: 4096, maxClaims: 256 },
      },
    );
    assert.equal(r.ok, true);
    registry = r.snapshot;
  };
  step(1);
  const devices = registry.devices.map((d) => d.deviceId);
  step(
    2,
    rows.map((r, i) => ({
      serial: r.serial,
      transportId: r.transportId,
      deviceId: devices[i],
      evidenceId: id(100 + i),
    })),
  );
  const service = createFleetService({
    registry: () => registry,
    assertOwnedSync: () => {},
    newDiagnostic: () => id(900),
    audit: async () => 'AVAILABLE',
    availability: () => 'OBSERVED',
    ...overrides,
  });
  let revision = 0;
  async function select(active, selected = []) {
    const cap = service.grant(() => {});
    try {
      const reply = JSON.parse(
        await service.execute(cap, {
          version: 1,
          requestId: 'f1',
          method: 'fleet.selection.replace',
          expectedRevision: revision,
          selection: { selectedDeviceIds: selected, activeDeviceId: active, groups: [] },
        }),
      );
      assert.equal(reply.ok, true);
      revision = reply.fleet.selection.revision;
      return reply;
    } finally {
      service.revoke(cap);
    }
  }
  await select(devices[0], [devices[1]]);
  return {
    service,
    devices,
    registry,
    select,
    capture: (deviceId = devices[0]) =>
      service.captureActiveInputIntent({
        expectedSelectionRevision: revision,
        expectedRegistryRevision: registry.revision,
        deviceId,
      }),
    get revision() {
      return revision;
    },
  };
}
