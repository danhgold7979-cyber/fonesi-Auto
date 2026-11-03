import { createDeviceDiagnosticEncoder, DIAGNOSTIC_REJECTION } from './device-diagnostics.ts';

export const DEVICE_DIAGNOSTIC_LIMITS = Object.freeze({ records: 512, bytes: 512 * 1024 });
export type DeviceDiagnosticSnapshot = Readonly<{
  records: readonly string[];
  bytes: number;
  dropped: number;
}>;
export type DeviceDiagnosticCollector = Readonly<{
  append(input: unknown): 'RECORDED' | 'REJECTED' | 'FULL' | 'CLOSED';
  snapshot(): DeviceDiagnosticSnapshot;
  close(): void;
}>;
const collectors = new WeakMap<object, () => boolean>();
export function isOpenDeviceDiagnosticCollector(
  value: unknown,
): value is DeviceDiagnosticCollector {
  return typeof value === 'object' && value !== null && collectors.get(value)?.() === true;
}
export function createDeviceDiagnosticCollector(): DeviceDiagnosticCollector {
  const encoder = createDeviceDiagnosticEncoder();
  const records: string[] = [];
  let bytes = 0,
    dropped = 0,
    closed = false;
  const drop = () => {
    dropped = Math.min(Number.MAX_SAFE_INTEGER, dropped + 1);
  };
  const collector: DeviceDiagnosticCollector = Object.freeze({
    append(input: unknown) {
      if (closed) return 'CLOSED';
      // Even rejected records never enter this buffer; raw input is never retained.
      const encoded = encoder.encode(input);
      if (closed) return 'CLOSED';
      if (encoded === DIAGNOSTIC_REJECTION) {
        drop();
        return 'REJECTED';
      }
      const size = Buffer.byteLength(encoded + '\n', 'utf8');
      if (
        records.length >= DEVICE_DIAGNOSTIC_LIMITS.records ||
        bytes + size > DEVICE_DIAGNOSTIC_LIMITS.bytes
      ) {
        drop();
        return 'FULL';
      }
      records.push(encoded);
      bytes += size;
      return 'RECORDED';
    },
    snapshot() {
      return Object.freeze({ records: Object.freeze([...records]), bytes, dropped });
    },
    close() {
      closed = true;
    },
  });
  collectors.set(collector, () => !closed);
  return collector;
}
