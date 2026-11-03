/** Private renderer transport. Native media and public admission remain v1. */
import { snapshotVideoMediaDelivery, type VideoMediaDelivery } from './video-media-contract.ts';
export type VideoPresentationState = 'VISIBLE' | 'HIDDEN';
export type VideoPresentationFence = Readonly<{
  version: 2;
  videoId: string;
  kind: 'PRESENTATION';
  epoch: number;
  state: VideoPresentationState;
  afterDeliveryId: number;
  afterPacketId: number;
  remainingMs: number;
}>;
export type VideoPresentationMedia = Readonly<{
  version: 2;
  videoId: string;
  kind: 'MEDIA';
  epoch: number;
  delivery: VideoMediaDelivery;
}>;
export type VideoPresentationRefusal = Readonly<{
  version: 2;
  videoId: string;
  kind: 'REFUSED';
  reason: 'BUSY' | 'QUOTA' | 'STALE_TARGET' | 'REJECTED';
}>;
export type VideoPresentationControl = Readonly<
  | {
      version: 2;
      videoId: string;
      kind: 'READY' | 'STOP' | 'DECODER_UNAVAILABLE' | 'DECODE_FAILED' | 'VISIBILITY_HINT';
    }
  | { version: 2; videoId: string; kind: 'PRESENTATION_ACK'; epoch: number }
  | { version: 2; videoId: string; kind: 'CONSUMED'; epoch: number; deliveryId: number }
  | {
      version: 2;
      videoId: string;
      kind: 'PAINTED';
      epoch: number;
      deliveryId: number;
      geometryId: number;
      configId: number;
      packetId: number;
      ptsUs: number;
      width: number;
      height: number;
    }
>;
const count = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0);
const positive = (v: unknown): v is number => count(v) && v > 0;
function record(raw: unknown): Record<string, unknown> | null {
  try {
    if (
      !raw ||
      typeof raw !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(raw))
    )
      return null;
    const d = Object.getOwnPropertyDescriptors(raw);
    if (
      Reflect.ownKeys(d).some(
        (k) => typeof k !== 'string' || !d[k]?.enumerable || !Object.hasOwn(d[k], 'value'),
      )
    )
      return null;
    const v = Object.fromEntries(Object.entries(d).map(([k, descriptor]) => [k, descriptor.value]));
    if (
      v.version !== 2 ||
      typeof v.videoId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v.videoId)
    )
      return null;
    return v;
  } catch {
    return null;
  }
}
const exact = (v: Record<string, unknown>, more: string[]) => {
  const keys = ['version', 'videoId', 'kind', ...more];
  return Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
};
export function snapshotVideoPresentationMessage(
  raw: unknown,
): VideoPresentationMedia | VideoPresentationFence | VideoPresentationRefusal | null {
  const v = record(raw);
  if (!v) return null;
  if (v.kind === 'MEDIA' && exact(v, ['epoch', 'delivery']) && positive(v.epoch)) {
    const delivery = snapshotVideoMediaDelivery(v.delivery);
    return delivery && delivery.videoId === v.videoId
      ? (Object.freeze({ ...v, delivery }) as VideoPresentationMedia)
      : null;
  }
  if (
    v.kind === 'PRESENTATION' &&
    exact(v, ['epoch', 'state', 'afterDeliveryId', 'afterPacketId', 'remainingMs']) &&
    positive(v.epoch) &&
    (v.state === 'VISIBLE' || v.state === 'HIDDEN') &&
    count(v.afterDeliveryId) &&
    count(v.afterPacketId) &&
    typeof v.remainingMs === 'number' &&
    Number.isFinite(v.remainingMs) &&
    v.remainingMs > 0 &&
    v.remainingMs <= 30000
  )
    return Object.freeze(v) as VideoPresentationFence;
  if (
    v.kind === 'REFUSED' &&
    exact(v, ['reason']) &&
    ['BUSY', 'QUOTA', 'STALE_TARGET', 'REJECTED'].includes(v.reason as string)
  )
    return Object.freeze(v) as VideoPresentationRefusal;
  return null;
}
export function snapshotVideoPresentationControl(raw: unknown): VideoPresentationControl | null {
  const v = record(raw);
  if (!v) return null;
  if (
    ['READY', 'STOP', 'DECODER_UNAVAILABLE', 'DECODE_FAILED', 'VISIBILITY_HINT'].includes(
      v.kind as string,
    ) &&
    exact(v, [])
  )
    return Object.freeze(v) as VideoPresentationControl;
  if (!positive(v.epoch)) return null;
  if (v.kind === 'PRESENTATION_ACK' && exact(v, ['epoch']))
    return Object.freeze(v) as VideoPresentationControl;
  if (v.kind === 'CONSUMED' && exact(v, ['epoch', 'deliveryId']) && positive(v.deliveryId))
    return Object.freeze(v) as VideoPresentationControl;
  if (
    v.kind === 'PAINTED' &&
    exact(v, [
      'epoch',
      'deliveryId',
      'geometryId',
      'configId',
      'packetId',
      'ptsUs',
      'width',
      'height',
    ]) &&
    ['deliveryId', 'geometryId', 'configId', 'packetId', 'width', 'height'].every((k) =>
      positive(v[k]),
    ) &&
    count(v.ptsUs) &&
    (v.width as number) <= 4096 &&
    (v.height as number) <= 4096 &&
    (v.width as number) * (v.height as number) <= 8_388_608
  )
    return Object.freeze(v) as VideoPresentationControl;
  return null;
}
