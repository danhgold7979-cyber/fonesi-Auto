// Supplied declarations only. No execution, certification, persistence or mutable registry.
const WORKFLOW_IDS = ['fb-page-video', 'fb-page-photo', 'fb-page-reels'] as const;
export type WorkflowId = (typeof WORKFLOW_IDS)[number];
const STEP_SPECS = [
  ['RESOLVE_SCOPE', 'READ_ONLY', 'EXACT_DEVICE_ACCOUNT_TARGET_REFERENCES'],
  ['VERIFY_IDENTITY', 'READ_ONLY', 'CURRENT_ACCOUNT_AND_PAGE_IDENTITY'],
  ['VERIFY_POLICY', 'READ_ONLY', 'ACTION_PERMISSION_AND_EXACT_CAPABILITY'],
  ['VALIDATE_MEDIA', 'READ_ONLY', 'EXACT_MEDIA_HASH_KIND_AND_ORDER'],
  ['PREPARE_COMPOSER', 'DEVICE_MUTATION', 'EXACT_COMPOSER_AND_ORDERED_ASSETS'],
  ['FILL_CONTENT', 'DEVICE_MUTATION', 'EXACT_UNICODE_CAPTION_HASHTAGS'],
  ['PUBLISH', 'EXTERNAL_EFFECT', 'PUBLICATION_READBACK'],
  ['VERIFY_PUBLICATION', 'READ_ONLY', 'PUBLICATION_READBACK'],
  ['PLAN_COMMENTS', 'DECLARATION_ONLY', 'VERIFIED_POST_COMMENT_DEPENDENCY'],
] as const;
export type WorkflowStepId = (typeof STEP_SPECS)[number][0];
export type WorkflowEffectClass = (typeof STEP_SPECS)[number][1];
export type WorkflowVerification =
  | Exclude<(typeof STEP_SPECS)[number][2], 'PUBLICATION_READBACK'>
  | 'PAGE_FEED_VIDEO_READBACK'
  | 'PAGE_ORDERED_PHOTO_READBACK'
  | 'PAGE_REEL_READBACK';
export type WorkflowStepV1 = Readonly<{
  id: WorkflowStepId;
  effectClass: WorkflowEffectClass;
  verification: WorkflowVerification;
  timeoutMs: number;
  retry: 'NEVER';
}>;
export type WorkflowManifestV1 = Readonly<{
  schemaVersion: 1;
  kind: 'FIXED_WORKFLOW_MANIFEST';
  workflowId: WorkflowId;
  definitionVersion: number;
  definitionState: 'UNVERIFIED';
  policySha256: string;
  profileSha256: string;
  inputSchemaSha256: string;
  steps: readonly WorkflowStepV1[];
}>;
export type WorkflowHistory = readonly WorkflowManifestV1[];
export type RetainWorkflowResult =
  | Readonly<{
      ok: false;
      code: 'INVALID_HISTORY' | 'INVALID_MANIFEST' | 'VERSION_CONFLICT' | 'HISTORY_FULL';
    }>
  | Readonly<{ ok: true; disposition: 'ADDED' | 'IDENTICAL'; history: WorkflowHistory }>;
export type ResolveWorkflowResult =
  | Readonly<{ ok: false; code: 'INVALID_HISTORY' | 'INVALID_REFERENCE' | 'NOT_FOUND' }>
  | Readonly<{ ok: true; manifest: WorkflowManifestV1 }>;
const MANIFEST_KEYS = [
  'schemaVersion',
  'kind',
  'workflowId',
  'definitionVersion',
  'definitionState',
  'policySha256',
  'profileSha256',
  'inputSchemaSha256',
  'steps',
];
function refuse(): never {
  throw new Error('INVALID_DECLARATION');
}
function integer(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= maximum;
}
function workflowId(value: unknown): value is WorkflowId {
  return value === 'fb-page-video' || value === 'fb-page-photo' || value === 'fb-page-reels';
}
function sha256(value: unknown): value is string {
  return typeof value === 'string' && value.length === 64 && /^[0-9a-f]{64}$/.test(value);
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    refuse();
  const names = Reflect.ownKeys(value);
  if (
    names.length !== keys.length ||
    names.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    refuse();
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) refuse();
    result[key] = descriptor.value;
  }
  return result;
}
function array(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) refuse();
  const length = Object.getOwnPropertyDescriptor(value, 'length');
  if (
    !length ||
    !('value' in length) ||
    !Number.isSafeInteger(length.value) ||
    length.value < 0 ||
    length.value > maximum ||
    Reflect.ownKeys(value).length !== length.value + 1
  )
    refuse();
  const result: unknown[] = [];
  for (let i = 0; i < length.value; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) refuse();
    result.push(descriptor.value);
  }
  return result;
}
function readback(id: WorkflowId): WorkflowVerification {
  return id === 'fb-page-video'
    ? 'PAGE_FEED_VIDEO_READBACK'
    : id === 'fb-page-photo'
      ? 'PAGE_ORDERED_PHOTO_READBACK'
      : 'PAGE_REEL_READBACK';
}
function snapshot(value: unknown): WorkflowManifestV1 {
  const manifest = record(value, MANIFEST_KEYS);
  if (
    manifest.schemaVersion !== 1 ||
    manifest.kind !== 'FIXED_WORKFLOW_MANIFEST' ||
    !workflowId(manifest.workflowId) ||
    !integer(manifest.definitionVersion, Number.MAX_SAFE_INTEGER) ||
    manifest.definitionState !== 'UNVERIFIED' ||
    !sha256(manifest.policySha256) ||
    !sha256(manifest.profileSha256) ||
    !sha256(manifest.inputSchemaSha256)
  )
    refuse();
  const id = manifest.workflowId;
  const rawSteps = array(manifest.steps, STEP_SPECS.length);
  if (rawSteps.length !== STEP_SPECS.length) refuse();
  const steps = rawSteps.map((raw, index): WorkflowStepV1 => {
    const step = record(raw, ['id', 'effectClass', 'verification', 'timeoutMs', 'retry']);
    const spec = STEP_SPECS[index];
    if (!spec) refuse();
    const verification = spec[2] === 'PUBLICATION_READBACK' ? readback(id) : spec[2];
    if (
      step.id !== spec[0] ||
      step.effectClass !== spec[1] ||
      step.verification !== verification ||
      !integer(step.timeoutMs, 2147483647) ||
      step.retry !== 'NEVER'
    )
      refuse();
    return Object.freeze({
      id: spec[0],
      effectClass: spec[1],
      verification,
      timeoutMs: step.timeoutMs,
      retry: 'NEVER',
    });
  });
  return Object.freeze({
    schemaVersion: 1,
    kind: 'FIXED_WORKFLOW_MANIFEST',
    workflowId: id,
    definitionVersion: manifest.definitionVersion,
    definitionState: 'UNVERIFIED',
    policySha256: manifest.policySha256,
    profileSha256: manifest.profileSha256,
    inputSchemaSha256: manifest.inputSchemaSha256,
    steps: Object.freeze(steps),
  });
}
export function snapshotWorkflowManifest(value: unknown): WorkflowManifestV1 | null {
  try {
    return snapshot(value);
  } catch {
    return null;
  }
}
export function snapshotWorkflowHistory(value: unknown): WorkflowHistory | null {
  try {
    const identities = new Set<string>();
    const history = array(value, 128).map((raw) => {
      const manifest = snapshot(raw);
      const key = `${manifest.workflowId}:${manifest.definitionVersion}`;
      if (identities.has(key)) refuse();
      identities.add(key);
      return manifest;
    });
    return Object.freeze(history);
  } catch {
    return null;
  }
}
export function retainWorkflowManifest(history: unknown, candidate: unknown): RetainWorkflowResult {
  const prior = snapshotWorkflowHistory(history);
  if (prior === null) return Object.freeze({ ok: false, code: 'INVALID_HISTORY' });
  const next = snapshotWorkflowManifest(candidate);
  if (next === null) return Object.freeze({ ok: false, code: 'INVALID_MANIFEST' });
  const existing = prior.find(
    (entry) =>
      entry.workflowId === next.workflowId && entry.definitionVersion === next.definitionVersion,
  );
  if (existing) {
    // Both operands are closed, owned snapshots in canonical field order.
    if (JSON.stringify(existing) !== JSON.stringify(next))
      return Object.freeze({ ok: false, code: 'VERSION_CONFLICT' });
    return Object.freeze({ ok: true, disposition: 'IDENTICAL', history: prior });
  }
  if (prior.length === 128) return Object.freeze({ ok: false, code: 'HISTORY_FULL' });
  return Object.freeze({
    ok: true,
    disposition: 'ADDED',
    history: Object.freeze([...prior, next]),
  });
}
export function resolveWorkflowManifest(
  history: unknown,
  reference: unknown,
): ResolveWorkflowResult {
  const definitions = snapshotWorkflowHistory(history);
  if (definitions === null) return Object.freeze({ ok: false, code: 'INVALID_HISTORY' });
  try {
    const ref = record(reference, ['workflowId', 'definitionVersion']);
    if (!workflowId(ref.workflowId) || !integer(ref.definitionVersion, Number.MAX_SAFE_INTEGER))
      refuse();
    const manifest = definitions.find(
      (entry) =>
        entry.workflowId === ref.workflowId && entry.definitionVersion === ref.definitionVersion,
    );
    return manifest
      ? Object.freeze({ ok: true, manifest })
      : Object.freeze({ ok: false, code: 'NOT_FOUND' });
  } catch {
    return Object.freeze({ ok: false, code: 'INVALID_REFERENCE' });
  }
}
