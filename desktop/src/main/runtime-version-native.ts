/** Current-launch resolver only; no helper construction during status inspection. */
import { lstatSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { RuntimeVersionCode } from '../runtime-version-contract.ts';
import type { PersistenceEntry } from './persistence-entry.ts';
import { assertPreparedPersistenceLease } from './persistence-entry.ts';
import {
  hostRead,
  hostPlain,
  hostRecord,
  hostUuid,
  readHostContext,
  assertHostPathBudget,
  HOST_ASSETS,
} from './adb-host-context.ts';
import { PLATFORM_TOOLS_CANDIDATE } from './platform-tools-candidate.ts';
export function inspectRuntimeVersionContext(
  entry: PersistenceEntry,
  desktopRoot: string,
  parentPid: number,
): Readonly<{ ok: true; launchRoot: string }> | Readonly<{ ok: false; code: RuntimeVersionCode }> {
  try {
    assertPreparedPersistenceLease(entry);
    const pointer = hostRecord(
      hostRead(join(dirname(entry.root), '.launcher-current.json'), 65536),
      ['version', 'launchId', 'ownerToken', 'storeId', 'dataRoot'],
    );
    if (
      pointer.version !== 1 ||
      !hostUuid(pointer.launchId) ||
      pointer.ownerToken !== entry.ownerToken ||
      pointer.storeId !== entry.storeId ||
      pointer.dataRoot !== entry.root
    )
      return Object.freeze({ ok: false, code: 'RECOVERY_REQUIRED' });
    const launchRoot = join(dirname(entry.root), 'launch-' + pointer.launchId);
    hostPlain(launchRoot, true);
    if (!hostUuid(hostRead(join(launchRoot, '.owner'), 36).toString('utf8')))
      return Object.freeze({ ok: false, code: 'RECOVERY_REQUIRED' });
    try {
      lstatSync(join(launchRoot, 'host-parent.json'));
    } catch (error) {
      const descriptor =
        error && typeof error === 'object'
          ? Object.getOwnPropertyDescriptor(error, 'code')
          : undefined;
      if (descriptor && Object.hasOwn(descriptor, 'value') && descriptor.value === 'ENOENT')
        return Object.freeze({ ok: false, code: 'RETAINED_HOST_DISABLED' });
      return Object.freeze({ ok: false, code: 'RECOVERY_REQUIRED' });
    }
    const context = readHostContext(entry, launchRoot, desktopRoot, parentPid);
    try {
      assertHostPathBudget(
        launchRoot,
        pointer.launchId,
        join(
          entry.root,
          'platform-tools-runtime',
          'runtimes',
          'runtime-' + PLATFORM_TOOLS_CANDIDATE.archive.sha256,
          'adb.exe',
        ),
        [...HOST_ASSETS.map((name) => join(desktopRoot, name)), context.receipt.parentImagePath],
      );
    } catch {
      return Object.freeze({ ok: false, code: 'UNSUPPORTED_PATH' });
    }
    assertPreparedPersistenceLease(entry);
    return Object.freeze({ ok: true, launchRoot });
  } catch {
    return Object.freeze({ ok: false, code: 'RECOVERY_REQUIRED' });
  }
}
