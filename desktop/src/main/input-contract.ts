// Pure main-only input plans. No executable, transport, device action or permission acquisition.
// Device-side syntax reference: AOSP InputShellCommand blob773dc680d4cbf672a55c1a3d41d874d25c14ed95.
// This is not certification of an Android/OEM profile or proof of a physical input effect.
import { validAdbSerial } from './adb-discovery.ts';
export const INPUT_KEYS = Object.freeze([
  'ENTER',
  'ESCAPE',
  'DPAD_UP',
  'DPAD_DOWN',
  'DPAD_LEFT',
  'DPAD_RIGHT',
  'DPAD_CENTER',
] as const);
export const INPUT_KINDS = Object.freeze(['TAP', 'SWIPE', 'KEY', 'HOME', 'BACK', 'TEXT'] as const);
export type InputKey = (typeof INPUT_KEYS)[number];
export type InputBinding = Readonly<{
  deviceId: string;
  bindingId: string;
  generation: number;
  serial: string;
}>;
export type DisplayEvidence = InputBinding &
  Readonly<{
    version: 1;
    evidenceId: string;
    displayId: 0;
    width: number;
    height: number;
    rotation: 0 | 90 | 180 | 270;
    orientationEpoch: number;
    observedUtc: number;
    validUntilUtc: number;
    source: 'SYNTHETIC_TEST' | 'VALIDATED_CAPTURE';
  }>;
export type DeviceInputOperation =
  | Readonly<{ kind: 'TAP'; x: number; y: number }>
  | Readonly<{ kind: 'SWIPE'; x1: number; y1: number; x2: number; y2: number; durationMs: number }>
  | Readonly<{ kind: 'KEY'; key: InputKey }>
  | Readonly<{ kind: 'HOME' }>
  | Readonly<{ kind: 'BACK' }>
  | Readonly<{ kind: 'TEXT'; text: string }>;
export type DeviceInputRequest = InputBinding &
  Readonly<{
    version: 2;
    commandId: string;
    correlationId: string;
    ownerId: string;
    deadlineUtc: number;
    operation: DeviceInputOperation;
    display: DisplayEvidence | null;
  }>;
export const INPUT_TEXT_BYTES = 64 * 1024; // Defensive inspection bound, not a certified product text limit.
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const integer = (value: unknown, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= max &&
  !Object.is(value, -0);
const utc = (value: unknown): value is number => integer(value, 8640000000000000);
function record(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    )
      return null;
    const d = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(d).length !== keys.length) return null;
    const out: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const field = d[key];
      if (!field || !('value' in field) || !field.enumerable) return null;
      out[key] = field.value;
    }
    return out;
  } catch {
    return null;
  }
}
function binding(value: Record<string, unknown>): boolean {
  return (
    uuid(value.deviceId) &&
    uuid(value.bindingId) &&
    integer(value.generation) &&
    validAdbSerial(value.serial)
  );
}
const displayKeys = [
  'version',
  'evidenceId',
  'deviceId',
  'bindingId',
  'generation',
  'serial',
  'displayId',
  'width',
  'height',
  'rotation',
  'orientationEpoch',
  'observedUtc',
  'validUntilUtc',
  'source',
] as const;
export function snapshotDisplayEvidence(input: unknown): DisplayEvidence | null {
  const v = record(input, displayKeys);
  if (
    v?.version !== 1 ||
    !uuid(v.evidenceId) ||
    !binding(v) ||
    v.displayId !== 0 ||
    Object.is(v.displayId, -0) ||
    !integer(v.width, 65535) ||
    v.width === 0 ||
    !integer(v.height, 65535) ||
    v.height === 0 ||
    ![0, 90, 180, 270].includes(v.rotation as number) ||
    Object.is(v.rotation, -0) ||
    !integer(v.orientationEpoch) ||
    !utc(v.observedUtc) ||
    !utc(v.validUntilUtc) ||
    v.validUntilUtc <= v.observedUtc ||
    (v.source !== 'SYNTHETIC_TEST' && v.source !== 'VALIDATED_CAPTURE')
  )
    return null;
  return Object.freeze({ ...v }) as DisplayEvidence;
}
function validText(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > INPUT_TEXT_BYTES) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return new TextEncoder().encode(value).byteLength <= INPUT_TEXT_BYTES;
}
export function exactUnicodeTextEqual(expected: unknown, observed: unknown): boolean {
  return validText(expected) && validText(observed) && expected === observed;
}
const unavailable = Object.freeze({
  available: false as const,
  outcome: 'NOT_DISPATCHED' as const,
  code: 'UNICODE_UNAVAILABLE' as const,
  reason: 'NO_APPROVED_METHOD' as const,
});
export function unicodeInputCapability(): typeof unavailable {
  return unavailable;
}
function operation(input: unknown): DeviceInputOperation | null {
  let descriptors: Record<string, PropertyDescriptor>;
  let kind: unknown;
  try {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))
    )
      return null;
    descriptors = Object.getOwnPropertyDescriptors(input);
    const descriptor = descriptors.kind;
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return null;
    kind = descriptor.value;
  } catch {
    return null;
  }
  let keys: readonly string[];
  if (kind === 'TAP') keys = ['kind', 'x', 'y'];
  else if (kind === 'SWIPE') keys = ['kind', 'x1', 'y1', 'x2', 'y2', 'durationMs'];
  else if (kind === 'KEY') keys = ['kind', 'key'];
  else if (kind === 'HOME' || kind === 'BACK') keys = ['kind'];
  else if (kind === 'TEXT') keys = ['kind', 'text'];
  else return null;
  if (Reflect.ownKeys(descriptors).length !== keys.length) return null;
  const v: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return null;
    v[key] = descriptor.value;
  }
  if (kind === 'TAP' && (!integer(v.x, 65534) || !integer(v.y, 65534))) return null;
  if (
    kind === 'SWIPE' &&
    (!integer(v.x1, 65534) ||
      !integer(v.y1, 65534) ||
      !integer(v.x2, 65534) ||
      !integer(v.y2, 65534) ||
      !integer(v.durationMs, 120000) ||
      v.durationMs === 0)
  )
    return null;
  if (kind === 'KEY' && !INPUT_KEYS.includes(v.key as InputKey)) return null;
  if (kind === 'TEXT' && !validText(v.text)) return null;
  return Object.freeze({ ...v }) as DeviceInputOperation;
}
export function snapshotDeviceInputRequest(input: unknown): DeviceInputRequest | null {
  const v = record(input, [
    'version',
    'commandId',
    'correlationId',
    'deviceId',
    'bindingId',
    'generation',
    'serial',
    'ownerId',
    'operation',
    'deadlineUtc',
    'display',
  ]);
  if (
    v?.version !== 2 ||
    !uuid(v.commandId) ||
    !uuid(v.correlationId) ||
    v.commandId === v.correlationId ||
    !uuid(v.ownerId) ||
    !binding(v) ||
    !utc(v.deadlineUtc)
  )
    return null;
  const op = operation(v.operation);
  if (!op) return null;
  const display = v.display === null ? null : snapshotDisplayEvidence(v.display);
  if (v.display !== null && !display) return null;
  if (
    display &&
    (display.deviceId !== v.deviceId ||
      display.bindingId !== v.bindingId ||
      display.generation !== v.generation ||
      display.serial !== v.serial)
  )
    return null;
  if (op.kind === 'TAP' || op.kind === 'SWIPE') {
    if (!display) return null;
    const points =
      op.kind === 'TAP'
        ? [[op.x, op.y]]
        : [
            [op.x1, op.y1],
            [op.x2, op.y2],
          ];
    if (
      points.some(
        ([x, y]) => x === undefined || y === undefined || x >= display.width || y >= display.height,
      )
    )
      return null;
  }
  return Object.freeze({ ...v, operation: op, display }) as DeviceInputRequest;
}
// Caller must independently admit the VERIFIED current registry binding and operation owner.
// Supplied display facts are not acquisition/certification of physical orientation.
export function displayCurrent(
  input: unknown,
  currentEvidence: unknown,
  now: unknown,
  phase: 'DISPATCH' | 'OBSERVE' = 'DISPATCH',
): boolean {
  if (phase !== 'DISPATCH' && phase !== 'OBSERVE') return false;
  const request = snapshotDeviceInputRequest(input);
  if (!request || !utc(now) || now >= request.deadlineUtc) return false;
  if (
    phase === 'DISPATCH' &&
    request.operation.kind === 'SWIPE' &&
    request.operation.durationMs > request.deadlineUtc - now
  )
    return false;
  if (request.display === null)
    return request.operation.kind !== 'TAP' && request.operation.kind !== 'SWIPE';
  const current = snapshotDisplayEvidence(currentEvidence);
  if (!current || now < current.observedUtc || now >= current.validUntilUtc) return false;
  if (
    phase === 'DISPATCH' &&
    request.operation.kind === 'SWIPE' &&
    request.operation.durationMs > current.validUntilUtc - now
  )
    return false;
  return displayKeys.every((key) => request.display?.[key] === current[key]);
}
const keyCodes: Readonly<Record<InputKey, string>> = Object.freeze({
  ENTER: '66',
  ESCAPE: '111',
  DPAD_UP: '19',
  DPAD_DOWN: '20',
  DPAD_LEFT: '21',
  DPAD_RIGHT: '22',
  DPAD_CENTER: '23',
});
// Fixed device-side argument tokens only. There is no host executable/target/shell-string API.
// Every numeric token comes from exact bounded integers; TEXT has no argument path at all.
export function inputArguments(input: unknown): readonly string[] | null {
  const request = snapshotDeviceInputRequest(input);
  if (!request) return null;
  const op = request.operation;
  if (op.kind === 'TEXT') return null;
  if (op.kind === 'TAP')
    return Object.freeze(['input', 'touchscreen', '-d', '0', 'tap', String(op.x), String(op.y)]);
  if (op.kind === 'SWIPE')
    return Object.freeze([
      'input',
      'touchscreen',
      '-d',
      '0',
      'swipe',
      String(op.x1),
      String(op.y1),
      String(op.x2),
      String(op.y2),
      String(op.durationMs),
    ]);
  return Object.freeze([
    'input',
    'keyboard',
    '-d',
    '0',
    'keyevent',
    op.kind === 'HOME' ? '3' : op.kind === 'BACK' ? '4' : keyCodes[op.key],
  ]);
}
export function mapViewportPoint(
  displayInput: unknown,
  rectangle: unknown,
  pointer: unknown,
): Readonly<{ x: number; y: number }> | null {
  const display = snapshotDisplayEvidence(displayInput),
    r = record(rectangle, ['left', 'top', 'width', 'height']),
    p = record(pointer, ['x', 'y']);
  if (!display || !r || !p) return null;
  const finite = (value: unknown): value is number =>
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= Number.MAX_SAFE_INTEGER &&
    !Object.is(value, -0);
  if (
    !finite(r.left) ||
    !finite(r.top) ||
    !finite(r.width) ||
    !finite(r.height) ||
    r.width <= 0 ||
    r.height <= 0 ||
    !finite(p.x) ||
    !finite(p.y)
  )
    return null;
  const right = r.left + r.width,
    bottom = r.top + r.height;
  if (
    !finite(right) ||
    !finite(bottom) ||
    p.x < r.left ||
    p.x >= right ||
    p.y < r.top ||
    p.y >= bottom
  )
    return null;
  const x = Math.floor(((p.x - r.left) * display.width) / r.width),
    y = Math.floor(((p.y - r.top) * display.height) / r.height);
  if (!integer(x, display.width - 1) || !integer(y, display.height - 1)) return null;
  return Object.freeze({ x, y });
}
