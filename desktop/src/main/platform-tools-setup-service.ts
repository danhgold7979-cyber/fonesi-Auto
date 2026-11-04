import { createPlatformToolsProvisioner } from './platform-tools-provisioner.ts';
import type { PlatformToolsRuntimeCustody } from './platform-tools-runtime-custody.ts';
import type { RecipientDecision } from './platform-tools-provisioner.ts';
import { createPlatformToolsDownload } from './platform-tools-download.ts';
import {
  PLATFORM_TOOLS_INSTALL_TARGET,
  resolvePlatformToolsCandidate,
} from './platform-tools-catalog.ts';
import type {
  SetupAction,
  SetupNativeSelection,
  SetupNativeResult,
} from './platform-tools-setup-native.ts';
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
    native: Readonly<{
      interact: (
        current: () => void,
        selection: SetupNativeSelection,
        selected: (action: SetupAction) => void,
      ) => Promise<SetupNativeResult>;
    }>;
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
    installTargetVersion: PLATFORM_TOOLS_INSTALL_TARGET.candidate.release,
    activeVersion: null,
    rollbackAvailable: false,
  });
  const grants = new WeakMap<
    object,
    {
      decision: RecipientDecision;
      current: () => boolean;
      kind: SetupAction;
      expectedRevision: number;
      active: string | null;
      previous: string | null;
      candidate: object;
    }
  >();
  function validGrant(grant: unknown) {
    if (stopped || !grant || typeof grant !== 'object') return null;
    const g = grants.get(grant);
    try {
      owned();
      idle();
      if (g?.current() !== true || snapshot.installationRevision !== g.expectedRevision)
        return null;
      const selected =
        g.kind === 'INSTALL'
          ? PLATFORM_TOOLS_INSTALL_TARGET
          : resolvePlatformToolsCandidate(g.previous ?? '');
      if (selected !== g.candidate || !selected.activationAllowed || !selected.launchAllowed)
        return null;
      owned();
      idle();
      return stopped ? null : g;
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
  function metadata(status: Awaited<ReturnType<typeof core.status>>) {
    snapshot = Object.freeze({
      ...snapshot,
      activeVersion: status.activeVersion,
      rollbackAvailable: status.rollbackAvailable,
    });
  }
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
      rollbackAvailable: state === 'VERIFIED_LOCAL' ? snapshot.rollbackAvailable : false,
    });
  }
  async function log(record: SetupAudit): Promise<Health> {
    try {
      return (await audit(Object.freeze(record))) === 'AVAILABLE' ? 'AVAILABLE' : 'DEGRADED';
    } catch {
      return 'DEGRADED';
    }
  }
  async function operate(
    operationId: string,
    current: () => boolean,
    expectedRevision: number,
    captured: Awaited<ReturnType<typeof core.status>> & { revision: number },
  ) {
    let grant: object | null = null;
    let action: SetupAction | null = null;
    let diagnosticId: string;
    try {
      diagnosticId = id();
    } catch {
      publish('FAILED', 'INTERNAL_FAILURE');
      return;
    }
    try {
      admit(current);
      const answer = await interact(
        () => admit(current),
        Object.freeze({
          installTargetVersion: snapshot.installTargetVersion,
          activeVersion: captured.activeVersion,
          previousVersion: captured.previousVersion,
          rollbackAvailable: captured.rollbackAvailable,
        }),
        (selected) => {
          if (action !== null && action !== selected) throw Error('OWNER_REVOKED');
          action = selected;
        },
      );
      admit(current);
      if (!answer.ok) {
        if (answer.action !== action) throw Error('OWNER_REVOKED');
        publish('DECLINED', answer.code);
        await log({
          operation: 'PROVISION',
          action,
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
      action = action as SetupAction | null;
      if (action !== answer.kind) throw Error('OWNER_REVOKED');
      const selected =
        action === 'INSTALL'
          ? PLATFORM_TOOLS_INSTALL_TARGET
          : resolvePlatformToolsCandidate(captured.previousArchiveSha256 ?? '');
      if (
        !selected?.activationAllowed ||
        !selected.launchAllowed ||
        (action === 'ROLLBACK' && !captured.rollbackAvailable)
      )
        throw Error('OWNER_REVOKED');
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
        kind: action,
        expectedRevision: captured.revision,
        active: captured.archiveSha256,
        previous: captured.previousArchiveSha256,
        candidate: selected,
      });
      if (
        (await log({
          operation: 'PROVISION',
          action,
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
      const result = await core.run(grant, captured.revision, action);
      if (result.ok) {
        const verified = await core.status();
        metadata(verified);
        if (verified.status !== 'VERIFIED_LOCAL')
          publish('OUTCOME_UNKNOWN', 'RECOVERY_REQUIRED', result.revision);
        else publish('VERIFIED_LOCAL', null, result.revision);
      } else if (result.outcome === 'OUTCOME_UNKNOWN' || result.code === 'RECOVERY_REQUIRED')
        publish(
          'OUTCOME_UNKNOWN',
          result.code === 'RECOVERY_REQUIRED' ? 'RECOVERY_REQUIRED' : 'OUTCOME_UNKNOWN',
        );
      else {
        // A settled NOT_ACTIVATED intent still advances the durable core CAS revision.
        // Reconcile bytes/status only; never replay installation after failure.
        const status = await core.status();
        metadata(status);
        if (status.status === 'RECOVERY_REQUIRED')
          publish('OUTCOME_UNKNOWN', 'RECOVERY_REQUIRED', status.revision);
        else publish('FAILED', result.code, status.revision);
      }
      await log({
        operation: 'PROVISION',
        action,
        phase: 'RESULT',
        diagnosticId,
        operationId,
        expectedRevision,
        resultingRevision: snapshot.revision,
        outcome:
          result.ok && snapshot.state === 'VERIFIED_LOCAL'
            ? 'VERIFIED_LOCAL'
            : snapshot.state === 'OUTCOME_UNKNOWN'
              ? 'OUTCOME_UNKNOWN'
              : 'FAILED',
        code: snapshot.state === 'VERIFIED_LOCAL' ? 'OK' : (snapshot.code ?? 'INTERNAL_FAILURE'),
      });
    } catch {
      let refusal: 'OWNER_REVOKED' | 'INTERNAL_FAILURE' = 'INTERNAL_FAILURE';
      try {
        admit(current);
      } catch {
        refusal = 'OWNER_REVOKED';
      }
      publish('FAILED', refusal);
      await log({
        operation: 'PROVISION',
        action,
        phase: 'RESULT',
        diagnosticId,
        operationId,
        expectedRevision,
        resultingRevision: snapshot.revision,
        outcome: 'FAILED',
        code: refusal,
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
          activeVersion: s.activeVersion,
          rollbackAvailable: s.rollbackAvailable,
          state:
            s.status === 'VERIFIED_LOCAL'
              ? 'VERIFIED_LOCAL'
              : s.status === 'RECOVERY_REQUIRED'
                ? 'OUTCOME_UNKNOWN'
                : 'UNAVAILABLE',
          code:
            s.status === 'RECOVERY_REQUIRED' || s.status === 'POLICY_DENIED'
              ? 'RECOVERY_REQUIRED'
              : null,
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
        if (!pending && !reserving && snapshot.state !== 'OUTCOME_UNKNOWN') {
          const refusal = reserve();
          if (refusal !== null)
            return setupError(
              request.requestId,
              refusal === 'BUSY' ? 'BUSY' : 'OWNER_REVOKED',
              diagnosticId,
              'DEGRADED',
            );
          reserving = true;
          reservationDone = new Promise<void>((resolve) => {
            releaseReservation = resolve;
          });
          try {
            const status = await core.status();
            admit(current);
            metadata(status);
            const state =
              status.status === 'RECOVERY_REQUIRED'
                ? 'OUTCOME_UNKNOWN'
                : status.status === 'POLICY_DENIED'
                  ? 'UNAVAILABLE'
                  : snapshot.state === 'FAILED' || snapshot.state === 'DECLINED'
                    ? snapshot.state
                    : status.status === 'VERIFIED_LOCAL'
                      ? 'VERIFIED_LOCAL'
                      : 'UNAVAILABLE';
            snapshot = Object.freeze({
              ...snapshot,
              installationRevision: status.revision,
              state,
              rollbackAvailable: state === 'VERIFIED_LOCAL' && status.rollbackAvailable,
              code:
                status.status === 'RECOVERY_REQUIRED' || status.status === 'POLICY_DENIED'
                  ? 'RECOVERY_REQUIRED'
                  : state === 'FAILED' || state === 'DECLINED'
                    ? snapshot.code
                    : null,
            });
          } finally {
            reserving = false;
            releaseReservation?.();
            releaseReservation = null;
            releaseIfRetired();
          }
        }
        const observed = snapshot;
        const health = await log({
          operation: 'READ',
          action: null,
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
        // Inspect the complete chain before acknowledging or presenting an interaction.
        const captured = await core.status();
        admit(current);
        metadata(captured);
        if (
          captured.status === 'RECOVERY_REQUIRED' ||
          captured.revision === null ||
          captured.revision !== snapshot.installationRevision
        ) {
          publish('OUTCOME_UNKNOWN', 'RECOVERY_REQUIRED');
          return setupError(request.requestId, 'RECOVERY_REQUIRED', diagnosticId, 'DEGRADED');
        }
        const expectedInstallationRevision = captured.revision;
        let operationId: string;
        try {
          operationId = id();
        } catch {
          return setupError(request.requestId, 'INTERNAL_FAILURE', diagnosticId, 'DEGRADED');
        }
        const health = await log({
          operation: 'REQUEST',
          action: null,
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
        const task = Promise.resolve().then(() =>
          operate(operationId, current, ack.revision, {
            ...captured,
            revision: expectedInstallationRevision,
          }),
        );
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
          action: null,
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
