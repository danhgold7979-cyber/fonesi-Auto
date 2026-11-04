import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import workflowFixture from '../verification/workflow-fixture.cjs';
const { workflowEncodings } = workflowFixture;
const raw = readFileSync(
  new URL('../../.github/workflows/phase-02-software.yml', import.meta.url),
  'utf8',
);
const historicalCondition =
  "(github.event_name == 'workflow_dispatch' && inputs.run_fleet_ui) || (github.event_name == 'push' && github.ref == 'refs/heads/phase-02' && contains(github.event.head_commit.message, '[fleet-ui]'))";
const condition = `false && (${historicalCondition})`;
function validate(input) {
  const source = input.replace(/\r\n/g, '\n');
  assert.match(
    source,
    /run_fleet_ui:\n {8}description: [^\n]+\n {8}required: false\n {8}type: boolean\n {8}default: false/,
  );
  const parts = source.split('  owned-fleet-ui-development:\n');
  assert.equal(parts.length, 2);
  const job = parts[1].split(/\n {2}[a-z0-9-]+:\n/)[0];
  assert.ok(
    job.startsWith(
      `    needs: windows-software-only\n    # Historical schema4 UI envelope is suspended until an exact schema5 campaign is reviewed.\n    if: ${condition}\n`,
    ),
  );
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
test('historical schema4 fleet UI stays suspended with original opt-in and publication gates retained', () => {
  for (const source of workflowEncodings(raw)) {
    validate(source);
    assert.deepEqual(workflowEncodings(source), workflowEncodings(raw));
    for (const changed of [
      source.replace(condition, historicalCondition),
      source.replace(condition, 'true'),
      source.replace(
        condition,
        condition.replace("github.event_name == 'workflow_dispatch' && ", ''),
      ),
      source.replace(condition, condition.replace("github.ref == 'refs/heads/phase-02' && ", '')),
      source.replace(condition, condition.replace("github.event_name == 'push' && ", '')),
      source.replace("contains(github.event.head_commit.message, '[fleet-ui]')", 'true'),
      source.replace('default: false', 'default: true').replace(/default: false/g, 'default: true'),
      source.replace(
        "steps.fleet_validation.outputs.images == 'true'",
        "steps.fleet_validation.outputs.written == 'true'",
      ),
    ]) {
      assert.notEqual(changed, source);
      assert.throws(() => validate(changed));
    }
  }
});
