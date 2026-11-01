import { createPlatformToolsProvisioner } from './platform-tools-provisioner.ts';
import type { PlatformToolsRuntimeCustody } from './platform-tools-runtime-custody.ts';
import type { RecipientDecision } from './platform-tools-provisioner.ts';
import { createPlatformToolsDownload } from './platform-tools-download.ts';
import type { SetupNativeResult } from './platform-tools-setup-native.ts';
import {
  snapshotSetupRequest,
  setupSuccess,
  setupError,
} from '../platform-tools-setup-contract.ts';
import type { SetupRequest, SetupSnapshot } from '../platform-tools-setup-contract.ts';
import type { SetupAudit } from '../platform-tools-setup-audit-contract.ts';
export type PlatformToolsSetupService = ReturnType<typeof createPlatformToolsSetupService>;
type Health = 'AVAILABLE' | 'DEGRADED';
export function createPlatformToolsSetupService(
  options: Readonly<{
    dataRoot: string;
    storeId: string;
    assertOwnedSync: () => void;
    custody: PlatformToolsRuntimeCustody;
    assertDataLocation: (path: string) => void;
    clock: () => number;
    newId: () => string;
    native: Readonly<{ interact: (current: () => void) => Promise<SetupNativeResult> }>;
    audit: (record: SetupAudit) => Promise<Health>;
    readOfficialArchive?: (signal: AbortSignal) => Promise<unknown>;
  }>,
) {
  const owned = options.assertOwnedSync.bind(options),
    custody = options.custody,
    next = options.newId.bind(options),
    audit = options.audit.bind(options),
    interact = options.native.interact.bind(options.native);
  let setupToken: object | null = null;
  const idle = () => {
    if (setupToken === null) throw Error('OWNER_REVOKED');
    custody.assertSetup(setupToken);
  };
  function reserve() {
    const result = custody.reserveSetup();
    if (!result.ok) return result.code;
    setupToken = result.token;
    return null;
  }
  function releaseIfRetired() {
    if (setupToken !== null && pending === null && !reserving && core.retired) {
      const result = custody.releaseSetup(setupToken, true);
      if (result.ok) setupToken = null;
    }
  }
  const ids = new Set<string>();
  let reservationDone: Promise<void> = Promise.resolve();
  let releaseReservation: (() => void) | null = null;
  let stopped = false,
    reserving = false,
    initialized = false,
    pending: Promise<void> | null = null,
    closing: Promise<'RETIRED' | 'UNRETIRED'> | null = null;
  let snapshot: SetupSnapshot = Object.freeze({
    revision: 0,
    installationRevision: null,
    state: 'UNAVAILABLE',
    operationId: null,
    code: null,
    candidateVersion: '37.0.1',
  });
  const grants = new WeakMap<object, { decision: RecipientDecision; current: () => boolean }>();
  function validGrant(grant: unknown) {
    if (stopped || !grant || typeof grant !== 'object') return null;
    const g = grants.get(grant);
    try {
      owned();
      idle();
      return g?.current() === true ? g : null;
    } catch {
      return null;
    }
  }
  const core = createPlatformToolsProvisioner({
    ...options,
    assertIdleSync: idle,
    recipient: {
      read: (g) => validGrant(g)?.decision ?? null,
      isCurrent: (g, id) => validGrant(g)?.decision.decisionId === id,
    },
    readOfficialArchive: options.readOfficialArchive ?? createPlatformToolsDownload(),
  });
  function id() {
    if (ids.size >= 65536) throw Error('INTERNAL_FAILURE');
    const value = next();
    if (
      typeof value !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value) ||
      ids.has(value)
    )
      throw Error('INTERNAL_FAILURE');
    ids.add(value);
    return value;
  }
  function admit(current: () => boolean) {
    if (stopped || current() !== true) throw Error('OWNER_REVOKED');
    owned();
    if (setupToken !== null) idle();
    if (stopped || current() !== true) throw Error('OWNER_REVOKED');
    owned();
    if (setupToken !== null) idle();
    if (stopped) throw Error('OWNER_REVOKED');
  }
  function publish(
    state: SetupSnapshot['state'],
    code: SetupSnapshot['code'],
    installationRevision = snapshot.installationRevision,
  ) {
    if (snapshot.revision >= Number.MAX_SAFE_INTEGER) throw Error('LIMIT_EXCEEDED');
    snapshot = Object.freeze({
      ...snapshot,
      revision: snapshot.revision + 1,
      state,
      code,
      installationRevision,
    });
  }
  async function log(record: SetupAudit): Promise<Health> {
    try {
      return (await audit(Object.freeze(record))) === 'AVAILABLE' ? 'AVAILABLE' : 'DEGRADED';
    } catch {
      return 'DEGRADED';
    }
  }
  async function operate(operationId: string, current: () => boolean, expectedRevision: number) {
    let grant: object | null = null;
    let diagnosticId: string;
    try {
      diagnosticId = id();
    } catch {
      publish('FAILED', 'INTERNAL_FAILURE');
      return;
    }
    try {
      admit(current);
      const answer = await interact(() => admit(current));
      admit(current);
      if (!answer.ok) {
        publish('DECLINED', answer.code);
        await log({
          operation: 'PROVISION',
          phase: 'RESULT',
          diagnosticId,
          operationId,
          expectedRevision,
          resultingRevision: snapshot.revision,
          outcome: 'DECLINED',
          code: answer.code,
        });
        return;
      }
      const decisionId = id();
      grant = Object.freeze({});
      grants.set(grant, {
        decision: Object.freeze({
          decisionId,
          accepted: true,
          route: answer.route,
          archivePath: answer.archivePath,
        }),
        current,
      });
      if (
        (await log({
          operation: 'PROVISION',
          phase: 'INTENT',
          diagnosticId,
          operationId,
          expectedRevision,
          resultingRevision: null,
          outcome: 'INTENT',
          code: 'OK',
        })) !== 'AVAILABLE'
      ) {
        publish('FAILED', 'AUDIT_UNAVAILABLE');
        return;
      }
      admit(current);
      if (snapshot.installationRevision === null) {
        publish('OUTCOME_UNKNOWN', 'RECOVERY_REQUIRED');
        return;
      }
      publish('PROVISIONING', null);
      const result = await core.run(grant, snapshot.installationRevision);
      if (result.ok) publish('VERIFIED_LOCAL', null, result.revision);
      else if (result.outcome === 'OUTCOME_UNKNOWN' || result.code === 'RECOVERY_REQUIRED')
        publish(
          'OUTCOME_UNKNOWN',
          result.code === 'RECOVERY_REQUIRED' ? 'RECOVERY_REQUIRED' : 'OUTCOME_UNKNOWN',
        );
      else {
        // A settled NOT_ACTIVATED intent still advances the durable core CAS revision.
        // Reconcile bytes/status only; never replay installation after failure.
        const status = await core.status();
        if (status.status === 'RECOVERY_REQUIRED')
          publish('OUTCOME_UNKNOWN', 'RECOVERY_REQUIRED', status.revision);
        else publish('FAILED', result.code, status.revision);
      }
      await log({
        operation: 'PROVISION',
        phase: 'RESULT',
        diagnosticId,
        operationId,
        expectedRevision,
        resultingRevision: snapshot.revision,
        outcome: result.ok
          ? 'VERIFIED_LOCAL'
          : snapshot.state === 'OUTCOME_UNKNOWN'
            ? 'OUTCOME_UNKNOWN'
            : 'FAILED',
        code: result.ok ? 'OK' : (snapshot.code ?? 'INTERNAL_FAILURE'),
      });
    } catch {
      publish('FAILED', 'OWNER_REVOKED');
      await log({
        operation: 'PROVISION',
        phase: 'RESULT',
        diagnosticId,
        operationId,
        expectedRevision,
        resultingRevision: snapshot.revision,
        outcome: 'FAILED',
        code: 'OWNER_REVOKED',
      });
    } finally {
      if (grant) grants.delete(grant);
    }
  }
  return Object.freeze({
    async initialize() {
      if (initialized || pending || reserving || stopped) throw Error('INVALID_REQUEST');
      const refusal = reserve();
      if (refusal !== null) throw Error(refusal);
      reserving = true;
      reservationDone = new Promise<void>((resolve) => {
        releaseReservation = resolve;
      });
      try {
        owned();
        idle();
        const s = await core.status();
        owned();
        idle();
        if (stopped) throw Error('OWNER_REVOKED');
        snapshot = Object.freeze({
          ...snapshot,
          installationRevision: s.revision,
          state:
            s.status === 'VERIFIED_LOCAL'
              ? 'VERIFIED_LOCAL'
              : s.status === 'RECOVERY_REQUIRED'
                ? 'OUTCOME_UNKNOWN'
                : 'UNAVAILABLE',
          code: s.status === 'RECOVERY_REQUIRED' ? 'RECOVERY_REQUIRED' : null,
        });
        initialized = true;
      } finally {
        reserving = false;
        releaseReservation?.();
        releaseReservation = null;
        releaseIfRetired();
      }
    },
    async execute(input: SetupRequest, current: () => boolean): Promise<string> {
      const request = snapshotSetupRequest(input);
      if (!request) return setupError(null, 'INVALID_REQUEST', null, 'DEGRADED');
      let diagnosticId: string;
      try {
        admit(current);
        if (!initialized) throw Error();
      } catch {
        return setupError(request.requestId, 'OWNER_REVOKED', null, 'DEGRADED');
      }
      try {
        diagnosticId = id();
      } catch {
        return setupError(request.requestId, 'INTERNAL_FAILURE', null, 'DEGRADED');
      }
      if (request.method === 'platformTools.get') {
        const observed = snapshot;
        const health = await log({
          operation: 'READ',
          phase: 'RESULT',
          diagnosticId,
          operationId: observed.operationId,
          expectedRevision: null,
          resultingRevision: observed.revision,
          outcome: 'OBSERVED',
          code: 'OK',
        });
        try {
          admit(current);
        } catch {
          return setupError(request.requestId, 'OWNER_REVOKED', diagnosticId, health);
        }
        return (
          setupSuccess(request.requestId, 'OBSERVED', observed, diagnosticId, health) ??
          setupError(request.requestId, 'INTERNAL_FAILURE', diagnosticId, 'DEGRADED')
        );
      }
      if (pending || reserving)
        return setupError(request.requestId, 'BUSY', diagnosticId, 'DEGRADED');
      if (request.expectedRevision !== snapshot.revision)
        return setupError(request.requestId, 'STALE_REVISION', diagnosticId, 'DEGRADED');
      if (snapshot.state === 'OUTCOME_UNKNOWN')
        return setupError(request.requestId, 'RECOVERY_REQUIRED', diagnosticId, 'DEGRADED');
      const custodyRefusal = reserve();
      if (custodyRefusal !== null)
        return setupError(
          request.requestId,
          custodyRefusal === 'BUSY' ? 'BUSY' : 'OWNER_REVOKED',
          diagnosticId,
          'DEGRADED',
        );
      reserving = true;
      reservationDone = new Promise<void>((resolve) => {
        releaseReservation = resolve;
      });
      try {
        let operationId: string;
        try {
          operationId = id();
        } catch {
          return setupError(request.requestId, 'INTERNAL_FAILURE', diagnosticId, 'DEGRADED');
        }
        const health = await log({
          operation: 'REQUEST',
          phase: 'INTENT',
          diagnosticId,
          operationId,
          expectedRevision: request.expectedRevision,
          resultingRevision: null,
          outcome: 'INTENT',
          code: 'OK',
        });
        if (health !== 'AVAILABLE')
          return setupError(request.requestId, 'AUDIT_UNAVAILABLE', diagnosticId, 'DEGRADED');
        admit(current);
        if (request.expectedRevision !== snapshot.revision)
          return setupError(request.requestId, 'STALE_REVISION', diagnosticId, health);
        snapshot = Object.freeze({ ...snapshot, operationId });
        publish('AWAITING_RECIPIENT', null);
        const ack = snapshot;
        // Reserve independently of the released RPC slot. Actual current() is session/owner observation.
        const task = Promise.resolve().then(() => operate(operationId, current, ack.revision));
        pending = task;
        void task.then(
          () => {
            if (pending === task) pending = null;
            releaseIfRetired();
          },
          () => {
            if (pending === task) pending = null;
            releaseIfRetired();
          },
        );
        const resultHealth = await log({
          operation: 'REQUEST',
          phase: 'RESULT',
          diagnosticId,
          operationId,
          expectedRevision: request.expectedRevision,
          resultingRevision: ack.revision,
          outcome: 'PENDING',
          code: 'OK',
        });
        return (
          setupSuccess(request.requestId, 'PENDING', ack, diagnosticId, resultHealth) ??
          setupError(
            request.requestId,
            'OUTCOME_UNKNOWN',
            diagnosticId,
            'DEGRADED',
            'OUTCOME_UNKNOWN',
          )
        );
      } catch {
        return setupError(request.requestId, 'OWNER_REVOKED', diagnosticId, 'DEGRADED');
      } finally {
        reserving = false;
        releaseReservation?.();
        releaseReservation = null;
        releaseIfRetired();
      }
    },
    shutdown() {
      if (closing) return closing;
      stopped = true;
      const native = pending;
      const coreClosing = core.close();
      closing = (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const result = await Promise.race([
            Promise.all([native, coreClosing, reservationDone]).then(([, r]) => r),
            new Promise<'UNRETIRED'>((resolve) => {
              timer = setTimeout(() => resolve('UNRETIRED'), 120000);
            }),
          ]);
          releaseIfRetired();
          if (result === 'UNRETIRED' && setupToken !== null)
            custody.releaseSetup(setupToken, false);
          return result;
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
      })();
      return closing;
    },
    get retired() {
      releaseIfRetired();
      return pending === null && !reserving && core.retired;
    },
  });
}
