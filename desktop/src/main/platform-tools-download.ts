import { request, Agent } from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { PLATFORM_TOOLS_CANDIDATE } from './platform-tools-candidate.ts';
// One fixed GET; no redirect, retry, global-agent mutation or caller URL.
export function createPlatformToolsDownload(transport: typeof request = request) {
  return (signal: AbortSignal): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(Error('DOWNLOAD_FAILED'));
        return;
      }
      const agent = new Agent({ keepAlive: false, maxSockets: 1 });
      let req: ClientRequest | undefined, res: IncomingMessage | undefined;
      let requestClosed = false,
        responseClosed = true,
        ended = false,
        failed = false,
        settled = false,
        used = 0;
      const bytes = Buffer.alloc(PLATFORM_TOOLS_CANDIDATE.archive.bytes);
      const finish = () => {
        if (settled || !requestClosed || !responseClosed) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        agent.destroy();
        if (failed || !ended || used !== PLATFORM_TOOLS_CANDIDATE.archive.bytes)
          reject(Error('DOWNLOAD_FAILED'));
        else resolve(bytes);
      };
      const abort = () => {
        failed = true;
        res?.destroy();
        req?.destroy();
        finish();
      };
      const timer = setTimeout(abort, 120000);
      signal.addEventListener('abort', abort, { once: true });
      try {
        req = transport(
          {
            protocol: 'https:',
            hostname: 'dl.google.com',
            port: 443,
            path: '/android/repository/platform-tools_r37.0.1-win.zip',
            method: 'GET',
            agent,
            rejectUnauthorized: true,
            headers: { 'Accept-Encoding': 'identity' },
          },
          (response) => {
            res = response;
            responseClosed = false;
            response.on('close', () => {
              responseClosed = true;
              finish();
            });
            response.on('error', abort);
            response.on('aborted', abort);
            response.on('end', () => {
              ended = true;
              finish();
            });
            response.on('data', (chunk: Buffer) => {
              if (failed) return;
              if (
                !Buffer.isBuffer(chunk) ||
                used + chunk.length > PLATFORM_TOOLS_CANDIDATE.archive.bytes
              ) {
                abort();
                return;
              }
              chunk.copy(bytes, used);
              used += chunk.length;
            });
            if (
              response.statusCode !== 200 ||
              response.headers['content-length'] !==
                String(PLATFORM_TOOLS_CANDIDATE.archive.bytes) ||
              (response.headers['content-encoding'] !== undefined &&
                response.headers['content-encoding'] !== 'identity') ||
              failed
            )
              abort();
          },
        );
        req.on('close', () => {
          requestClosed = true;
          finish();
        });
        req.on('error', abort);
        if (signal.aborted || failed) abort();
        else req.end();
      } catch {
        failed = true;
        if (req) abort();
        else {
          requestClosed = true;
          finish();
        }
      }
    });
}
