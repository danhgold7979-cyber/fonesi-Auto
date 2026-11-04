import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { CASES, STATUSES, parse } = require('../verification/vault-context-contract.cjs');
const source = readFileSync(
  new URL('../verification/VaultDpapiContext.cs', import.meta.url),
  'utf8',
);
test('cross-context fixed schema cannot count unavailable identity/provider as denial', () => {
  const value = { version: 1, status: 'PASS', ...Object.fromEntries(CASES.map((x) => [x, true])) };
  assert.equal(parse(JSON.stringify(value)).passed, true);
  for (const key of CASES) {
    assert.throws(() => parse(JSON.stringify({ ...value, [key]: false })));
  }
  for (const status of STATUSES.filter((x) => x !== 'PASS'))
    assert.equal(parse(JSON.stringify({ ...value, status })).passed, false);
  assert.throws(() => parse(JSON.stringify({ ...value, sid: 'private' })));
  assert.throws(() =>
    parse(
      JSON.stringify(value).replace(
        '"ownerBlobDenied":true',
        '"ownerBlobDenied":false,"ownerBlobDenied":true',
      ),
    ),
  );
  assert.throws(() => parse(JSON.stringify({ ...value, status: 'raw exception' })));
});
test('verification helper has only fixed service logon and user-scoped bounded DPAPI, no account/privilege fallback', () => {
  assert.match(source, /LogonUserW\("LocalService", "NT AUTHORITY", null, 5, 0, out token\)/);
  assert.match(source, /distinct = EffectiveSid\(\) == "S-1-5-19" && original != "S-1-5-19"/);
  assert.match(source, /ownerDpapiBlob.Length > 4096/);
  assert.match(source, /const uint CRYPTPROTECT_UI_FORBIDDEN = 1;/);
  assert.doesNotMatch(
    source,
    /AdjustTokenPrivileges|CreateService|NetUserAdd|SetNamedSecurityInfo|LoadUserProfile|DuplicateToken|CreateProcess|LOGON_NEW_CREDENTIALS|CRYPTPROTECT_LOCAL_MACHINE|Console\.|System\.IO/,
  );
  assert.equal((source.match(/DllImport\(/g) || []).length, 14);
  assert.ok(source.indexOf('before = owner != null') < source.indexOf('LogonUserW("LocalService"'));
  assert.ok(
    source.indexOf('foreign = Equal(canary, foreignPlain)') <
      source.indexOf('foreignOwner = Dpapi(blob, false)'),
  );
  assert.match(source, /if \(!RevertToSelf\(\)\) Stop\(\);/);
  assert.ok(
    source.indexOf('if (!reverted) Stop();') < source.indexOf('ownerAfter = Dpapi(blob, false)'),
  );
  assert.match(source, /TerminateProcess\(GetCurrentProcess\(\), 76\);\s*Environment.Exit\(76\);/);
  assert.match(source, /if \(token != null\) token.Dispose\(\);/);
});
