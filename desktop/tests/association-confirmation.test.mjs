import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { syntheticAssociationFixture } from './fixtures/association-confirmation.mjs';

test('synthetic recognition: genuine foundation ordinary admission binds dialog and callback-free postrelease witness', async () => {
  let calls = 0;
  const f = syntheticAssociationFixture(async (window, options) => {
    calls++;
    assert.equal(window, f.window);
    assert.deepEqual(options.buttons, ['Cancel', 'Confirm association']);
    assert.equal(options.defaultId, 0);
    assert.equal(options.cancelId, 0);
    assert.equal(options.signal, c.signal);
    assert.match(options.detail, /permits explicit metadata Read/);
    return { response: 1 };
  });
  const admitted = f.foundation.admitAssociation(f.event);
  assert.equal(admitted.ok, true);
  const c = new AbortController(),
    context = f.context();
  const intent = await f.leaf.confirmAssociationInteraction(
    admitted.associationAdmission,
    context,
    c.signal,
  );
  assert.ok(intent);
  assert.equal(calls, 1);
  admitted.release();
  const record = f.leaf.inspectAssociationConfirmation(intent);
  assert.equal(record.handle, context.handle);
  assert.equal(record.projection, context.projection);
  assert.equal(record.finalCurrent(), true);
  assert.ok(Object.isFrozen(record));
  assert.deepEqual(Reflect.ownKeys(record.operatorSession), []);
  assert.ok(Object.isFrozen(record.operatorSession));
  f.window.isDestroyed = () => {
    throw Error('FINAL_MUST_NOT_CALL_ELECTRON');
  };
  assert.equal(record.finalCurrent(), true);
  c.abort();
  assert.equal(record.finalCurrent(), false);
  f.foundation.dispose();
});
test('synthetic recognition: unknown admissions/intents, malformed context and structural signals never invoke dialog', async () => {
  let calls = 0;
  const f = syntheticAssociationFixture(async () => {
    calls++;
    return { response: 1 };
  });
  const a = f.foundation.admitAssociation(f.event),
    c = new AbortController();
  assert.equal(f.foundationModule.inspectAssociationAdmission({}), null);
  assert.equal(f.leaf.inspectAssociationConfirmation({}), null);
  assert.equal(await f.leaf.confirmAssociationInteraction({}, f.context(), c.signal), null);
  let getters = 0;
  const bad = { ...f.context() };
  Object.defineProperty(bad, 'label', {
    get() {
      getters++;
      return 'SECRET';
    },
    enumerable: true,
  });
  for (const ctx of [
    bad,
    { ...f.context(), extra: true },
    { ...f.context(), label: 'secret\n' },
    { ...f.context(), label: 'x'.repeat(129) },
    { ...f.context(), requestId: f.context().requestId + '\n' },
    { ...f.context(), deadlineUtc: 0 },
  ])
    assert.equal(
      await f.leaf.confirmAssociationInteraction(a.associationAdmission, ctx, c.signal),
      null,
    );
  assert.equal(
    await f.leaf.confirmAssociationInteraction(a.associationAdmission, f.context(), {
      get aborted() {
        getters++;
        return false;
      },
    }),
    null,
  );
  assert.equal(getters, 0);
  assert.equal(calls, 0);
  a.release();
  f.foundation.dispose();
});
test('synthetic recognition: actual singleton/window identity mandatory and native cancellation does not mint', async () => {
  for (const mutation of [
    (f) => (f.native.ipcMain = {}),
    (f) => (f.native.BrowserWindow.fromWebContents = () => ({})),
    (f) => (f.native.dialog.showMessageBox = async () => ({ response: 0 })),
  ]) {
    const f = syntheticAssociationFixture();
    const a = f.foundation.admitAssociation(f.event);
    mutation(f);
    assert.equal(
      await f.leaf.confirmAssociationInteraction(
        a.associationAdmission,
        f.context(),
        new AbortController().signal,
      ),
      null,
    );
    a.release();
    f.foundation.dispose();
  }
});
test('synthetic recognition: late affirmative after abort/navigation/dispose cannot mint; promise remains pending until native settles', async () => {
  for (const revoke of [
    (_f, c) => c.abort(),
    (f) => f.contents.emit('will-navigate'),
    (f) => f.foundation.dispose(),
  ]) {
    let finish;
    const f = syntheticAssociationFixture(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const a = f.foundation.admitAssociation(f.event),
      c = new AbortController();
    let settled = false;
    const pending = f.leaf
      .confirmAssociationInteraction(a.associationAdmission, f.context(), c.signal)
      .then((x) => {
        settled = true;
        return x;
      });
    revoke(f, c);
    await Promise.resolve();
    assert.equal(settled, false);
    finish({ response: 1 });
    assert.equal(await pending, null);
    a.release();
    f.foundation.dispose();
  }
});
test('synthetic recognition: historical wording and postaffirmation session revocation stay effective', async () => {
  const f = syntheticAssociationFixture(async (_w, o) => {
    assert.match(o.message, /same physical handset previously/);
    assert.match(o.message, /not selecting it merely/);
    return { response: 1 };
  });
  const a = f.foundation.admitAssociation(f.event);
  const intent = await f.leaf.confirmAssociationInteraction(
    a.associationAdmission,
    { ...f.context(), mode: 'HISTORICAL' },
    new AbortController().signal,
  );
  assert.ok(intent);
  const r = f.leaf.inspectAssociationConfirmation(intent);
  assert.equal(r.attestation.sameHistoricalHandset, true);
  a.release();
  f.contents.emit('will-navigate');
  assert.equal(r.finalCurrent(), false);
  f.foundation.dispose();
});
test('foundation association admission shares seven ordinary slots and cannot use cleanup ninth-slot authority', () => {
  const f = syntheticAssociationFixture();
  const all = Array.from({ length: 7 }, () => f.foundation.admitAssociation(f.event));
  assert.ok(all.every((x) => x.ok));
  assert.equal(f.foundation.admitPreferences(f.event).code, 'BUSY');
  const stop = f.foundation.admitCleanup(f.event);
  assert.equal(stop.ok, true);
  assert.equal(f.foundation.admitAssociation(f.event).code, 'BUSY');
  for (const a of all) a.release();
  stop.release();
  assert.equal(
    f.foundation.admitAssociation({ ...f.event, senderFrame: { ...f.contents.mainFrame } }).code,
    'UNTRUSTED_SENDER',
  );
  f.foundation.dispose();
});
test('production lazy leaf has one fixed require and no injected issuer registration or eager native import', async () => {
  const leaf = await import('../src/main/association-confirmation.ts');
  assert.equal(leaf.inspectAssociationConfirmation({}), null);
  const source = readFileSync(
    new URL('../src/main/association-confirmation.ts', import.meta.url),
    'utf8',
  );
  assert.equal(source.split("createRequire(__filename)('electron')").length, 2);
  assert.match(source, /addListener.call\(signal/);
  assert.match(source, /listening && !issued/);
  assert.doesNotMatch(source, /export function (?:register|mint)/);
});
