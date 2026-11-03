// Fixed native interaction issuer. Import/inspection alone never resolves Electron or mints authority.
import { createRequire } from 'node:module';
import type {
  BrowserWindow,
  MessageBoxOptions,
  MessageBoxReturnValue,
  IpcMain,
  Dialog,
  WebContents,
} from 'electron';
import { inspectAssociationAdmission } from '../foundation-bridge.ts';
export type AssociationConfirmationRecord = Readonly<{
  handle: object;
  mode: 'CURRENT' | 'HISTORICAL';
  deviceId: string;
  projection: object;
  expectedDurableRevision: number;
  operatorSession: object;
  requestId: string;
  attestation: Readonly<{ heldHandset: true; cableCycle: true; sameHistoricalHandset: boolean }>;
  finalCurrent(): boolean;
}>;
const confirmations = new WeakMap<object, AssociationConfirmationRecord>();
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')?.get;
const addListener = EventTarget.prototype.addEventListener;
const removeListener = EventTarget.prototype.removeEventListener;
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
function contextSnapshot(input: unknown) {
  if (
    !input ||
    typeof input !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  )
    return null;
  const fields = [
    'handle',
    'mode',
    'deviceId',
    'projection',
    'expectedDurableRevision',
    'requestId',
    'deadlineUtc',
    'label',
  ] as const;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== fields.length) return null;
  const v: Record<string, unknown> = {};
  for (const key of fields) {
    const d = descriptors[key];
    if (!d || !Object.hasOwn(d, 'value') || !d.enumerable) return null;
    v[key] = d.value;
  }
  if (
    !v.handle ||
    typeof v.handle !== 'object' ||
    !v.projection ||
    typeof v.projection !== 'object' ||
    (v.mode !== 'CURRENT' && v.mode !== 'HISTORICAL') ||
    !uuid(v.deviceId) ||
    !uuid(v.requestId) ||
    !integer(v.expectedDurableRevision) ||
    !integer(v.deadlineUtc) ||
    v.deadlineUtc > 8640000000000000 ||
    typeof v.label !== 'string' ||
    v.label.length < 1 ||
    v.label.length > 128 ||
    Buffer.byteLength(v.label, 'utf8') > 512 ||
    Array.from(v.label).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || (code >= 127 && code <= 159);
    })
  )
    return null;
  return Object.freeze(v) as Readonly<{
    handle: object;
    mode: 'CURRENT' | 'HISTORICAL';
    deviceId: string;
    projection: object;
    expectedDurableRevision: number;
    requestId: string;
    deadlineUtc: number;
    label: string;
  }>;
}
export function inspectAssociationConfirmation(
  intent: unknown,
): AssociationConfirmationRecord | null {
  return intent !== null && typeof intent === 'object' ? (confirmations.get(intent) ?? null) : null;
}
export async function confirmAssociationInteraction(
  admission: unknown,
  input: unknown,
  signal: AbortSignal,
): Promise<object | null> {
  let revoked = false,
    listening = false,
    issued = false;
  const onAbort = () => {
    revoked = true;
  };
  try {
    const owner = inspectAssociationAdmission(admission),
      context = contextSnapshot(input);
    if (!owner || !context || !aborted || aborted.call(signal)) return null;
    addListener.call(signal, 'abort', onAbort, { once: true });
    listening = true;
    if (aborted.call(signal)) revoked = true;
    if (revoked || !owner.check() || !owner.finalCurrent() || Date.now() > context.deadlineUtc)
      return null;
    // Exact private lazy resolution; no configurable loader or injected native issuer.
    const electron = createRequire(__filename)('electron') as {
      ipcMain: IpcMain;
      BrowserWindow: { fromWebContents(contents: WebContents): BrowserWindow | null };
      dialog: Dialog;
    };
    const nativeIpc = electron.ipcMain,
      Window = electron.BrowserWindow,
      nativeDialog = electron.dialog;
    const fromWebContents = Window.fromWebContents;
    const showMessageBox: (
      window: BrowserWindow,
      options: MessageBoxOptions,
    ) => Promise<MessageBoxReturnValue> = nativeDialog.showMessageBox;
    const check = () =>
      !revoked &&
      owner.check() &&
      !owner.window.isDestroyed() &&
      nativeIpc === owner.ipcMain &&
      fromWebContents.call(Window, owner.window.webContents) === owner.window &&
      owner.window.webContents === owner.sender &&
      owner.finalCurrent();
    if (!check() || Date.now() > context.deadlineUtc) return null;
    const detail =
      'I am holding the handset whose cable I unplugged and reconnected during this ceremony. I confirm that the observed removal and return correspond to that handset. This is my physical association statement, not a cryptographic fingerprint or a machine-certified USB path. Association permits explicit metadata Read while this exact binding remains current; it does not execute input or automatically read the device.';
    const selected = `${context.label} [${context.deviceId}]`;
    const message =
      context.mode === 'CURRENT'
        ? `Associate this handset with the displayed current record ${selected}.`
        : `This is the same physical handset previously represented by the displayed historical record ${selected}. I am not selecting it merely because its serial or label looks similar.`;
    const result = await showMessageBox.call(nativeDialog, owner.window, {
      signal,
      type: 'question',
      title: 'Associate handset for this session',
      message,
      detail,
      buttons: ['Cancel', 'Confirm association'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (
      !check() ||
      Date.now() > context.deadlineUtc ||
      result.response !== 1 ||
      !owner.finalCurrent() ||
      revoked
    )
      return null;
    const intent = Object.freeze({});
    confirmations.set(
      intent,
      Object.freeze({
        handle: context.handle,
        mode: context.mode,
        deviceId: context.deviceId,
        projection: context.projection,
        expectedDurableRevision: context.expectedDurableRevision,
        operatorSession: owner.operatorSession,
        requestId: context.requestId,
        attestation: Object.freeze({
          heldHandset: true as const,
          cableCycle: true as const,
          sameHistoricalHandset: context.mode === 'HISTORICAL',
        }),
        finalCurrent: () => !revoked && owner.finalCurrent(),
      }),
    );
    issued = true;
    return intent;
  } catch {
    return null;
  } finally {
    // Keep the same listener after affirmation through lower COMMIT/drain. The facade aborts it on completion/revocation.
    if (listening && !issued) removeListener.call(signal, 'abort', onAbort);
  }
}
