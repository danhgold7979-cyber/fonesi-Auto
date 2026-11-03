import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import type { Admission } from './view-session.ts';
import type { HostResourceSampler } from './main/host-resource-sampler.ts';
import {
  HOST_RESOURCE_CHANNEL,
  parseHostResourceRequest,
  hostResourceResponse,
} from './host-resource-contract.ts';
export function installHostResourceBridge(
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>,
  admit: (event: IpcMainInvokeEvent) => Admission,
  sampler: HostResourceSampler,
) {
  let disposed = false;
  ipc.handle(HOST_RESOURCE_CHANNEL, async (event, raw: unknown, ...extra: unknown[]) => {
    let release: (() => void) | undefined;
    let requestId: string | null = null;
    try {
      if (disposed) return hostResourceResponse(null, 'CLOSED');
      const admission = admit(event);
      if (!admission.ok) return hostResourceResponse(null, 'SESSION_REVOKED');
      release = admission.release;
      const request = extra.length ? null : parseHostResourceRequest(raw);
      if (!request) return hostResourceResponse(null, 'INVALID');
      requestId = request.requestId;
      if (!admission.current() || disposed)
        return hostResourceResponse(requestId, 'SESSION_REVOKED');
      if (request.method === 'CANCEL')
        return hostResourceResponse(
          requestId,
          sampler.cancel(request.targetId, event.sender) ? 'CANCELLED' : 'UNAVAILABLE',
        );
      const wire = await sampler.sample(
        requestId,
        event.sender,
        () => !disposed && admission.operationCurrent(),
      );
      if (disposed || !admission.current())
        return hostResourceResponse(requestId, 'SESSION_REVOKED');
      return wire;
    } catch {
      return hostResourceResponse(requestId, 'UNAVAILABLE');
    } finally {
      release?.();
    }
  });
  return Object.freeze({
    dispose() {
      if (disposed) return;
      disposed = true;
      ipc.removeHandler(HOST_RESOURCE_CHANNEL);
      void sampler.close();
    },
  });
}
