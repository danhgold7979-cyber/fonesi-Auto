import { createHash } from 'node:crypto';
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
test('failed fixed logon captures last error immediately and emits only finite categories', () => {
  assert.match(
    source,
    /if \(!LogonUserW\("LocalService", "NT AUTHORITY", null, 5, 0, out token\)\)\s*\{\s*int logonError = Marshal.GetLastWin32Error\(\);\s*status = LogonFailureStatus\(logonError\);\s*return Report\(status, before, false, false, false, false, false\);/,
  );
  const expected = new Map([
    [5, 'ACCESS_DENIED'],
    [1314, 'PRIVILEGE_NOT_HELD'],
    [1385, 'LOGON_TYPE_NOT_GRANTED'],
    [1326, 'LOGON_FAILURE'],
    [1327, 'ACCOUNT_RESTRICTION'],
  ]);
  const method = source.slice(
    source.indexOf('static string LogonFailureStatus'),
    source.indexOf('public static string Run'),
  );
  for (const [code, category] of expected) {
    assert.ok(source.includes('const int ERROR_' + category + ' = ' + code + ';'));
    assert.ok(
      method.includes('case ERROR_' + category + ': return "TOKEN_UNAVAILABLE_' + category + '";'),
    );
    assert.ok(STATUSES.includes('TOKEN_UNAVAILABLE_' + category));
  }
  assert.match(method, /default: return "TOKEN_UNAVAILABLE_OTHER";/);
  assert.equal((method.match(/case /g) || []).length, 5);
  assert.doesNotMatch(method, /ToString|FormatMessage|Console|throw|DllImport/);
  assert.equal((source.match(/LogonUserW\("LocalService"/g) || []).length, 1);
});

test('context wrapper binds exact diagnostic helper and selected campaign preserves native commands', () => {
  const wrapper = readFileSync(
    new URL('../verification/Test-VaultContext.ps1', import.meta.url),
    'utf8',
  );
  const hash = createHash('sha256')
    .update(readFileSync(new URL('../verification/VaultDpapiContext.cs', import.meta.url)))
    .digest('hex');
  assert.ok(wrapper.includes("-cne '" + hash + "'"));
  assert.equal((wrapper.match(/Get-FileHash \$helper/g) || []).length, 1);
  const full = readFileSync(
    new URL('../../.github/workflows/phase-01-full-persistence-manual.yml', import.meta.url),
    'utf8',
  );
  const ordinary = readFileSync(
    new URL('../../.github/workflows/phase-01-desktop-foundation.yml', import.meta.url),
    'utf8',
  );
  assert.ok(full.includes('branches: [phase-01]'));
  const paths = (text) => text.slice(text.indexOf('    paths:'), text.indexOf('permissions:'));
  assert.equal(paths(full), paths(ordinary));
  assert.ok(full.includes('s.countTestCases()==159'));
  assert.ok(ordinary.includes('s.countTestCases()==159'));
  assert.ok(
    full.includes(
      "github.event_name == 'workflow_dispatch' || (github.ref == 'refs/heads/phase-01' && contains(github.event.head_commit.message, '[vault-context]'))",
    ),
  );
  assert.ok(
    ordinary.includes(
      "github.event_name != 'push' || !contains(github.event.head_commit.message, '[vault-context]')",
    ),
  );
  assert.equal(
    (full.match(/& \.\/desktop\/verification\/Invoke-Persistence.ps1/g) || []).length,
    1,
  );
  assert.ok(full.includes('steps.persistence_validation.outputs.written'));
  assert.ok(full.includes('desktop/.persistence-runtime/validated.json'));
  // Every current-build database guard in this selected campaign must bind the
  // production schema. Audit/log versions and historical predecessor fixtures
  // are separate formats, not current database admission.
  const contract = readFileSync(new URL('../src/persistence-contract.ts', import.meta.url), 'utf8');
  const schema = Number(contract.match(/export const DATABASE_VERSION = (\d+);/)[1]);
  const controls = [
    ['persistence-control.cjs', 'result.schemaVersion', '!==', 1],
    ['vault-control.cjs', 'database.version', '!==', 1],
    ['persistence-launch-e2e-control.cjs', 'db.version', '!==', 1],
    ['persistence-maintenance-probe.cjs', 'db.version', '===', 1],
    ['persistence-maintenance-probe.cjs', 'restored.version', '===', 1],
    ['persistence-restore-probe.cjs', 'before.version', '===', 1],
  ];
  for (const [file, field, operator, count] of controls) {
    const text = readFileSync(new URL('../verification/' + file, import.meta.url), 'utf8');
    const pattern = new RegExp(field.replaceAll('.', '\\.') + ' ' + operator + ' (\\d+)', 'g');
    const values = [...text.matchAll(pattern)].map((match) => Number(match[1]));
    assert.deepEqual(values, Array(count).fill(schema), file + ':' + field);
    const stale = text.replace(
      field + ' ' + operator + ' ' + schema,
      field + ' ' + operator + ' ' + (schema - 1),
    );
    assert.notDeepEqual(
      [...stale.matchAll(pattern)].map((match) => Number(match[1])),
      values,
    );
  }
});
