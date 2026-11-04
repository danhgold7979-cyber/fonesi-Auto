// SYNTHETIC native-recognition seam only. Actual foundation/session and leaf code execute;
// this never loads Electron, opens a window/dialog, or supplies physical evidence.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
const require = createRequire(import.meta.url),
  { transformSync } = require('esbuild');
const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url));
export function syntheticAssociationFixture(
  dialog = async () => ({ response: 1, checkboxChecked: false }),
  sourceTransforms = new Map(),
) {
  const cache = new Map(),
    handlers = new Map();
  const ipc = {
    handle(name, fn) {
      handlers.set(name, fn);
    },
    removeHandler(name) {
      handlers.delete(name);
    },
  };
  const contents = new EventEmitter();
  contents.isDestroyed = () => false;
  contents.mainFrame = {
    origin: 'auto-foundation://app',
    url: 'auto-foundation://app/status.html',
  };
  const window = new EventEmitter();
  window.webContents = contents;
  window.isDestroyed = () => false;
  const native = {
    ipcMain: ipc,
    BrowserWindow: { fromWebContents: (value) => (value === contents ? window : null) },
    dialog: { showMessageBox: dialog },
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    let source = readFileSync(file, 'utf8');
    if (basename(file) === 'association-confirmation.ts') {
      const seam = "createRequire(__filename)('electron')";
      if (source.split(seam).length !== 2) throw Error('SYNTHETIC_SEAM_CHANGED');
      source = source.replace(seam, '__syntheticElectron');
    }
    // Test-owned exact substitutions for composed SYNTHETIC_NATIVE fixtures only.
    for (const [before, after] of sourceTransforms.get(
      relative(sourceRoot, file).split('\\').join('/'),
    ) ?? []) {
      if (source.split(before).length !== 2) throw Error('SYNTHETIC_COMPOSITION_SEAM_CHANGED');
      source = source.replace(before, after);
    }
    const code = transformSync(source, { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
    const module = { exports: {} };
    cache.set(file, module);
    const localRequire = (name) =>
      name.startsWith('.')
        ? load(resolve(dirname(file), name.replace(/\.js$/, '.ts')))
        : require(name);
    vm.runInThisContext(
      `(function(require,module,exports,__filename,__syntheticElectron){${code}\n})`,
      { filename: file },
    )(localRequire, module, module.exports, file, native);
    return module.exports;
  }
  const foundationModule = load(resolve(sourceRoot, 'foundation-bridge.ts'));
  const foundation = foundationModule.installFoundationBridge(ipc);
  const view = foundation.attach(window);
  contents.emit('did-start-navigation', { isMainFrame: true, url: contents.mainFrame.url });
  if (!view.arm()) throw Error('SYNTHETIC_VIEW');
  const event = { sender: contents, senderFrame: contents.mainFrame };
  const leaf = load(resolve(sourceRoot, 'main/association-confirmation.ts'));
  return {
    loadSource: (relative) => load(resolve(sourceRoot, relative)),
    foundation,
    foundationModule,
    leaf,
    ipc,
    native,
    window,
    contents,
    event,
    handlers,
    context: () => ({
      handle: Object.freeze({}),
      mode: 'CURRENT',
      deviceId: '10000000-0000-0000-0000-000000000001',
      projection: Object.freeze({}),
      expectedDurableRevision: 1,
      requestId: '10000000-0000-0000-0000-000000000002',
      deadlineUtc: Date.now() + 120000,
      label: 'Device 0001',
    }),
  };
}
