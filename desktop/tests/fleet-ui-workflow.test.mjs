import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const raw = readFileSync(
  new URL('../../.github/workflows/phase-02-software.yml', import.meta.url),
  'utf8',
);
const condition =
  "(github.event_name == 'workflow_dispatch' && inputs.run_fleet_ui) || (github.event_name == 'push' && github.ref == 'refs/heads/phase-02' && contains(github.event.head_commit.message, '[fleet-ui]'))";
function validate(input) {
  const source = input.replace(/\r\n/g, '\n');
  assert.match(
    source,
    /run_fleet_ui:\n {8}description: [^\n]+\n {8}required: false\n {8}type: boolean\n {8}default: false/,
  );
  const parts = source.split('  owned-fleet-ui-development:\n');
  assert.equal(parts.length, 2);
  const job = parts[1].split(/\n {2}[a-z0-9-]+:\n/)[0];
  assert.ok(job.startsWith(`    needs: windows-software-only\n    if: ${condition}\n`));
  assert.doesNotMatch(
    job,
    /Invoke-Foundation|Invoke-Persistence|PlatformTools|fetch_platform_tools|check\.mjs/,
  );
  assert.match(job, /node desktop\/scripts\/verify-dependencies\.mjs --metadata \$npmVersion/);
  assert.match(job, /ci --ignore-scripts --no-audit --no-fund/);
  assert.match(job, /node desktop\/scripts\/verify-dependencies\.mjs --installed \$npmVersion/);
  assert.match(job, /node desktop\/scripts\/build\.mjs \$npmVersion/);
  assert.equal((job.match(/& \.\/desktop\/verification\/Invoke-FleetUi\.ps1/g) ?? []).length, 1);
  assert.match(job, /if: always\(\) && steps\.fleet_validation\.outputs\.written == 'true'/);
  assert.match(job, /if: always\(\) && steps\.fleet_validation\.outputs\.images == 'true'/);
  assert.match(job, /FLEET_UI_SCREENSHOTS_BOUND/);
  assert.match(job, /fleet-light\.png\n {12}desktop\/\.fleet-ui-runtime\/fleet-dark\.png/);
}
test('schema4 fleet UI requires exact manual or phase02 marker opt-in and preserves publication gates', () => {
  validate(raw);
  validate(raw.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'));
  for (const changed of [
    raw.replace(condition, 'true'),
    raw.replace(condition, condition.replace("github.event_name == 'workflow_dispatch' && ", '')),
    raw.replace("github.ref == 'refs/heads/phase-02' && ", ''),
    raw.replace("github.event_name == 'push' && ", ''),
    raw.replace("contains(github.event.head_commit.message, '[fleet-ui]')", 'true'),
    raw.replace('default: false', 'default: true').replace(/default: false/g, 'default: true'),
    raw.replace(
      "steps.fleet_validation.outputs.images == 'true'",
      "steps.fleet_validation.outputs.written == 'true'",
    ),
  ])
    assert.throws(() => validate(changed));
});
