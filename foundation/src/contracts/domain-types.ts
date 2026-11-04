// Synthetic development contract v1. These aliases do not validate or confer authority.
export type FixtureId = string;
export type FixtureRevision = number;
export type EffectState =
  | 'NOT_DISPATCHED'
  | 'DISPATCH_POSSIBLE'
  | 'VERIFIED'
  | 'FAILED_KNOWN'
  | 'UNKNOWN';
export type DeviceFixture = Readonly<{ deviceId: FixtureId; generation: FixtureRevision }>;
export type BindingFixture = Readonly<{
  bindingId: FixtureId;
  deviceId: FixtureId;
  generation: FixtureRevision;
  serial: string;
}>;
export type IdentityFixture = Readonly<{
  identityId: FixtureId;
  platform: string;
  state: 'VERIFIED' | 'UNVERIFIED' | 'CONFLICT' | 'RETIRED';
  evidenceId: FixtureId | null;
}>;
export type AccountFixture = Readonly<{
  accountId: FixtureId;
  deviceId: FixtureId;
  platform: string;
  identityId: FixtureId | null;
}>;
export type TargetFixture = Readonly<{
  targetId: FixtureId;
  accountId: FixtureId;
  platform: string;
}>;
export type EvidenceFixture = Readonly<{
  evidenceId: FixtureId;
  kind: 'IDENTITY' | 'EFFECT' | 'RECOVERY';
  subjectId: FixtureId;
}>;
export type SecretFixture = Readonly<{
  secretRefId: FixtureId;
  deviceId: FixtureId;
  purpose: 'PROXY_CREDENTIAL';
}>;
export type DesiredFixture = Readonly<{
  desiredId: FixtureId;
  deviceId: FixtureId;
  revision: FixtureRevision;
  enabled: boolean;
}>;
export type ObservedFixture = Readonly<{
  observationId: FixtureId;
  deviceId: FixtureId;
  desiredRevision: FixtureRevision;
  availability: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN' | 'ERROR';
  effectiveEnabled: boolean | null;
  source: string;
  freshness: 'CURRENT' | 'STALE';
}>;
export type EffectFixture = Readonly<{
  effectId: FixtureId;
  accountId: FixtureId;
  targetId: FixtureId;
  bindingId: FixtureId;
  state: EffectState;
  evidenceId: FixtureId | null;
}>;
export type HoldFixture = Readonly<{
  holdId: FixtureId;
  reason: 'QUEUED_WORK' | 'UNKNOWN_RECOVERY';
  subjectIds: readonly FixtureId[];
}>;
export type DomainFixtureSnapshot = Readonly<{
  contract: 'p1-domain-fixture';
  version: 1;
  correlationId: string;
  devices: readonly DeviceFixture[];
  bindings: readonly BindingFixture[];
  identities: readonly IdentityFixture[];
  accounts: readonly AccountFixture[];
  targets: readonly TargetFixture[];
  evidence: readonly EvidenceFixture[];
  secrets: readonly SecretFixture[];
  desired: readonly DesiredFixture[];
  observed: readonly ObservedFixture[];
  effects: readonly EffectFixture[];
  holds: readonly HoldFixture[];
}>;
