// Portable workflow policy tests. No Windows owner, candidate, model or device execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const workflow = readFileSync(
  new URL('../../.github/workflows/phase-04-vision.yml', import.meta.url),
  'utf8',
).replaceAll('\r\n', '\n');
const names = {
  compile: 'Compile vision owner and fixture without loading or executing them',
  validate: 'Validate mutually exclusive reviewed vision campaigns',
  managed: 'Explicit reviewed synthetic native ownership cases, never OCR runtime',
  materialize: 'Explicit reviewed fixed Windows materialization, never model inference',
  upload: 'Retain only validated materialization metadata, including failure reports',
};
const managedRequest =
  "(github.event_name == 'workflow_dispatch' && inputs.run_native_ownership == true) || (github.event_name == 'push' && contains(github.event.head_commit.message, '[vision-managed]'))";
const materializeRequest =
  "(github.event_name == 'workflow_dispatch' && inputs.run_materialization == true) || (github.event_name == 'push' && contains(github.event.head_commit.message, '[vision-materialize]'))";
const admitted = (request) =>
  `github.ref == 'refs/heads/phase-04' && (${request}) && steps.validate_vision_campaign.outcome == 'success'`;
const uploadCondition =
  "always() && steps.validate_vision_campaign.outcome == 'success' && steps.vision_materialization.outputs.attempted == 'true' && steps.vision_materialization.outputs.evidence_ready == 'true'";
const validation = [
  "foreach($value in @($env:VISION_MANAGED_REQUESTED,$env:VISION_MATERIALIZATION_REQUESTED,$env:VISION_PUSH)){if($value -cnotin @('true','false')){throw 'VISION_CAMPAIGN_FLAGS_REJECTED'}}",
  "if($env:VISION_MANAGED_REQUESTED -ceq 'true' -and $env:VISION_MATERIALIZATION_REQUESTED -ceq 'true'){throw 'VISION_CAMPAIGNS_MUTUALLY_EXCLUSIVE'}",
  "if(($env:VISION_MANAGED_REQUESTED -ceq 'true' -or $env:VISION_MATERIALIZATION_REQUESTED -ceq 'true') -and $env:VISION_REF -cne 'refs/heads/phase-04'){throw 'VISION_CAMPAIGN_BRANCH_REJECTED'}",
  "if($env:VISION_MATERIALIZATION_REQUESTED -ceq 'true' -and $env:VISION_PUSH -ceq 'true'){",
  "  if([Text.Encoding]::UTF8.GetByteCount($env:VISION_COMMIT_MESSAGE) -gt 65536){throw 'VISION_COMMIT_MESSAGE_LIMIT'}",
  "  if(-not $env:VISION_COMMIT_MESSAGE.Contains('[vision-materialize]')){throw 'VISION_MATERIALIZATION_MARKER_REJECTED'}",
  '}',
].join('\n');
const materialization = [
  '$version=(& npm --version).Trim()',
  'if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}',
  "if($version -cnotin @('11.9.0','11.19.1')){throw 'MATERIALIZATION_NPM_REJECTED'}",
  '$evidenceReady=0',
  "'attempted=true' | Out-File -FilePath $env:GITHUB_OUTPUT -Encoding utf8 -Append",
  '& desktop/verification/Invoke-VisionMaterialization.ps1 -ReviewedMaterialization -NpmVersion $version | ForEach-Object {',
  '  Write-Output $_',
  "  if($_ -is [string] -and $_ -ceq 'VISION_MATERIALIZATION_EVIDENCE_READY'){$evidenceReady++}",
  '}',
  '$materializationExit=$LASTEXITCODE',
  "if($evidenceReady -eq 1){'evidence_ready=true' | Out-File -FilePath $env:GITHUB_OUTPUT -Encoding utf8 -Append}",
  'if($materializationExit -ne 0){exit $materializationExit}',
  "if($evidenceReady -ne 1){throw 'MATERIALIZATION_EVIDENCE_UNAVAILABLE'}",
].join('\n');
const evidenceRoot = 'D:\\a\\_temp\\fonesi-p4-materialization-evidence-v1';
const filenames = [
  'materialization-report.json',
  'installed-inventory.json',
  'evidence-manifest.json',
];

function step(source, name) {
  const matches = source
    .split(/(?=^ {6}- )/m)
    .filter((block) => block.startsWith(`      - name: ${name}\n`));
  assert.equal(matches.length, 1, `one fixed step: ${name}`);
  return matches[0];
}
function field(block, key) {
  const matches = [...block.matchAll(new RegExp(`^        ${key}: (.+)$`, 'gm'))];
  assert.equal(matches.length, 1, `one ${key}`);
  return matches[0][1];
}
function run(block) {
  assert.equal((block.match(/^ {8}run: \|$/gm) ?? []).length, 1);
  return block
    .split('        run: |\n')[1]
    .trimEnd()
    .replace(/^ {10}/gm, '');
}
function envExpression(block, key) {
  const match = block.match(new RegExp(`^          ${key}: \\$\\{\\{ (.+) \\}\\}$`, 'm'));
  assert.ok(match, key);
  return match[1];
}
function contract(source) {
  const compile = step(source, names.compile);
  const validate = step(source, names.validate);
  const managed = step(source, names.managed);
  const materialize = step(source, names.materialize);
  const upload = step(source, names.upload);
  assert.match(source, /branches: \[phase-04\]/);
  assert.match(source, /permissions:\n {2}contents: read\njobs:/);
  assert.match(source, /runs-on: windows-2022\n {4}timeout-minutes: 15/);
  assert.equal((source.match(/default: false/g) ?? []).length, 2);
  for (const input of ['run_native_ownership', 'run_materialization']) {
    assert.match(
      source,
      new RegExp(
        `      ${input}:\\n        description: [^\\n]+\\n        required: false\\n        type: boolean\\n        default: false\\n`,
      ),
    );
  }
  const positions = Object.values(names).map((name) => source.indexOf(`      - name: ${name}\n`));
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
  );
  assert.equal(field(validate, 'id'), 'validate_vision_campaign');
  assert.equal(envExpression(validate, 'VISION_MANAGED_REQUESTED'), managedRequest);
  assert.equal(envExpression(validate, 'VISION_MATERIALIZATION_REQUESTED'), materializeRequest);
  assert.equal(envExpression(validate, 'VISION_PUSH'), "github.event_name == 'push'");
  assert.equal(envExpression(validate, 'VISION_REF'), 'github.ref');
  assert.equal(
    envExpression(validate, 'VISION_COMMIT_MESSAGE'),
    'github.event.head_commit.message',
  );
  assert.equal(run(validate), validation);
  assert.equal(field(managed, 'if'), admitted(managedRequest));
  assert.equal(field(materialize, 'if'), admitted(materializeRequest));
  assert.equal(field(materialize, 'id'), 'vision_materialization');
  assert.equal(run(materialize), materialization);
  assert.equal(field(upload, 'if'), uploadCondition);
  assert.equal(
    field(upload, 'uses'),
    'actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f',
  );
  assert.match(upload, / {10}name: phase-04-materialization-evidence-v1\n/);
  assert.match(upload, / {10}if-no-files-found: error\n {10}retention-days: 14\n$/);
  assert.deepEqual(
    upload
      .split('          path: |\n')[1]
      .split('          if-no-files-found:')[0]
      .trimEnd()
      .split('\n')
      .map((line) => line.trim()),
    filenames.map((name) => `${evidenceRoot}\\${name}`),
  );
  assert.doesNotMatch(
    source,
    /continue-on-error:|RuntimeRoot|-Mode Runtime|pip install|\bmodel_path\b/,
  );
  assert.doesNotMatch(run(validate), /\$\{\{|Invoke-Expression|ScriptBlock|Start-Process/);
  assert.doesNotMatch(compile, / {8}if:/);
}

// Evaluate the actual closed expressions, including GitHub's case-insensitive
// string equality/contains behavior. This is not a general Actions interpreter.
function expression(value, context) {
  return runInNewContext(
    value.replace(/([a-z_][a-z0-9_.]*) == ('[^']*'|true|false)/g, 'equal($1, $2)'),
    {
      ...context,
      equal: (left, right) =>
        typeof left === 'string' && typeof right === 'string'
          ? left.toLowerCase() === right.toLowerCase()
          : left === right,
      contains: (text, token) => text.toLowerCase().includes(token.toLowerCase()),
      always: () => true,
    },
    { timeout: 100 },
  );
}
function scenario({
  ref = 'refs/heads/phase-04',
  event = 'push',
  managed = false,
  materialize = false,
  message = '',
  prior = true,
} = {}) {
  const context = {
    github: { ref, event_name: event, event: { head_commit: { message } } },
    inputs: { run_native_ownership: managed, run_materialization: materialize },
    steps: { validate_vision_campaign: { outcome: 'success' } },
  };
  const validate = step(workflow, names.validate);
  const managedRequested = expression(envExpression(validate, 'VISION_MANAGED_REQUESTED'), context);
  const materializeRequested = expression(
    envExpression(validate, 'VISION_MATERIALIZATION_REQUESTED'),
    context,
  );
  // The exact PowerShell validator is frozen above; this portable model exercises
  // its finite event/ref/UTF8/ordinal boundaries, without invoking any owner.
  const accepted =
    prior &&
    !(managedRequested && materializeRequested) &&
    (!(managedRequested || materializeRequested) || ref === 'refs/heads/phase-04') &&
    (!materializeRequested ||
      event !== 'push' ||
      (Buffer.byteLength(message, 'utf8') <= 65536 && message.includes('[vision-materialize]')));
  context.steps.validate_vision_campaign.outcome = accepted ? 'success' : 'failure';
  return {
    managed: prior && expression(field(step(workflow, names.managed), 'if'), context),
    materialize: prior && expression(field(step(workflow, names.materialize), 'if'), context),
  };
}

test('materialization campaign has a closed false-default workflow and fixed metadata contract', () => {
  contract(workflow);
});
test('ordinary Compile and original Managed bodies remain unchanged', () => {
  assert.equal(
    run(step(workflow, names.compile)),
    [
      '& desktop/verification/Invoke-VisionQualification.ps1 -Mode Compile',
      'if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}',
      "Write-Output 'WINDOWS_NATIVE_OWNERSHIP_NOT_RUN'",
      "Write-Output 'WINDOWS_OCR_RUNTIME_NOT_MATERIALIZED'",
      "Write-Output 'WINDOWS_OCR_MODEL_NOT_RUN'",
      "Write-Output 'VI_REQUIRED_UNAVAILABLE'",
      "Write-Output 'DEVICE_HARDWARE_NOT_RUN'",
    ].join('\n'),
  );
  assert.equal(
    run(step(workflow, names.managed)),
    [
      '& desktop/verification/Invoke-VisionQualification.ps1 -Mode Managed',
      'if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}',
    ].join('\n'),
  );
});
test('ordinary pushes and false or absent manual flags cannot materialize or run Managed', () => {
  for (const event of ['push', 'workflow_dispatch', 'pull_request', 'schedule']) {
    for (const value of [false, undefined]) {
      assert.deepEqual(scenario({ event, managed: value, materialize: value }), {
        managed: false,
        materialize: false,
      });
    }
  }
});
test('one exact opt-in selects only its reviewed campaign', () => {
  for (const event of ['push', 'workflow_dispatch']) {
    assert.deepEqual(scenario({ event, managed: true, message: 'reviewed [vision-managed]' }), {
      managed: true,
      materialize: false,
    });
    assert.deepEqual(
      scenario({ event, materialize: true, message: 'reviewed [vision-materialize]' }),
      { managed: false, materialize: true },
    );
  }
  assert.deepEqual(scenario({ message: '[VISION-MANAGED]' }), {
    managed: true,
    materialize: false,
  });
});
test('dual flags or dual push markers fail before either optional campaign', () => {
  for (const ref of ['refs/heads/phase-04', 'refs/heads/main', 'refs/heads/PHASE-04']) {
    for (const event of ['push', 'workflow_dispatch']) {
      assert.deepEqual(
        scenario({
          ref,
          event,
          managed: true,
          materialize: true,
          message: '[vision-managed] [vision-materialize]',
        }),
        { managed: false, materialize: false },
      );
    }
  }
});
test('optional campaigns refuse wrong refs, unrecognized events and prior check failure', () => {
  for (const ref of [
    'refs/heads/main',
    'refs/heads/phase-040',
    'refs/tags/phase-04',
    'refs/heads/PHASE-04',
  ]) {
    for (const event of ['push', 'workflow_dispatch']) {
      assert.deepEqual(
        scenario({ ref, event, materialize: true, message: '[vision-materialize]' }),
        { managed: false, materialize: false },
      );
      assert.deepEqual(scenario({ ref, event, managed: true, message: '[vision-managed]' }), {
        managed: false,
        materialize: false,
      });
    }
  }
  for (const event of ['pull_request', 'schedule']) {
    assert.deepEqual(scenario({ event, materialize: true, message: '[vision-materialize]' }), {
      managed: false,
      materialize: false,
    });
  }
  assert.deepEqual(scenario({ message: '[vision-materialize]', prior: false }), {
    managed: false,
    materialize: false,
  });
  assert.deepEqual(scenario({ message: '[vision-managed]', prior: false }), {
    managed: false,
    materialize: false,
  });
});
test('push marker is ordinal, bounded UTF8, and never replaced by manual inputs', () => {
  for (const message of [
    '[VISION-MATERIALIZE]',
    '[vision-Materialize]',
    '[vision-materialization]',
    'vision-materialize',
    '[vision-materialize ]',
    '[vision_materialize]',
  ]) {
    assert.deepEqual(scenario({ message, materialize: true }), {
      managed: false,
      materialize: false,
    });
  }
  const marker = '[vision-materialize]';
  assert.equal(scenario({ message: 'x'.repeat(65536 - marker.length) + marker }).materialize, true);
  assert.equal(
    scenario({ message: 'x'.repeat(65537 - marker.length) + marker }).materialize,
    false,
  );
  assert.equal(scenario({ message: 'é'.repeat(32759) + marker }).materialize, false);
  assert.equal(scenario({ event: 'workflow_dispatch', message: marker }).materialize, false);
  assert.equal(
    scenario({ event: 'workflow_dispatch', materialize: true, message: 'unrelated' }).materialize,
    true,
  );
});
test('failed validation cannot be bypassed by a matching optional predicate', () => {
  for (const outcome of ['failure', 'skipped', 'cancelled', '']) {
    const context = {
      github: {
        ref: 'refs/heads/phase-04',
        event_name: 'workflow_dispatch',
        event: { head_commit: { message: '' } },
      },
      inputs: { run_native_ownership: true, run_materialization: true },
      steps: { validate_vision_campaign: { outcome } },
    };
    assert.equal(expression(field(step(workflow, names.managed), 'if'), context), false);
    assert.equal(expression(field(step(workflow, names.materialize), 'if'), context), false);
  }
});
test('artifact gate needs an actual attempt and exactly validated exported evidence even after failure', () => {
  const predicate = field(step(workflow, names.upload), 'if');
  for (const outcome of ['success', 'failure', 'skipped', 'cancelled']) {
    for (const attempted of ['', 'false', 'true']) {
      for (const evidence_ready of ['', 'false', 'true']) {
        const context = {
          steps: {
            validate_vision_campaign: { outcome },
            vision_materialization: { outcome: 'failure', outputs: { attempted, evidence_ready } },
          },
        };
        assert.equal(
          expression(predicate, context),
          outcome === 'success' && attempted === 'true' && evidence_ready === 'true',
        );
      }
    }
  }
});
test('npm observation precedes attempt and marker observation precedes readiness output', () => {
  const body = run(step(workflow, names.materialize));
  assert.equal(body, materialization);
  assert(body.indexOf('(& npm --version)') < body.indexOf('MATERIALIZATION_NPM_REJECTED'));
  assert(body.indexOf('MATERIALIZATION_NPM_REJECTED') < body.indexOf("'attempted=true'"));
  assert(
    body.indexOf("'VISION_MATERIALIZATION_EVIDENCE_READY'") < body.indexOf("'evidence_ready=true'"),
  );
  assert(body.indexOf("'evidence_ready=true'") < body.indexOf('if($materializationExit -ne 0)'));
  assert.doesNotMatch(body, /-RuntimeRoot|Join-Path|Copy-Item|Get-ChildItem|Tee-Object|\+=/);
});
test('policy mutation checks reject broad triggers, defaults, guard bypasses and command changes', () => {
  for (const [before, after] of [
    ['default: false', 'default: true'],
    ['contents: read', 'contents: write'],
    ['timeout-minutes: 15', 'timeout-minutes: 30'],
    ['&& inputs.run_materialization == true', '|| inputs.run_materialization == true'],
    [
      "steps.validate_vision_campaign.outcome == 'success'",
      "steps.validate_vision_campaign.outcome != 'failure'",
    ],
    ["-cnotin @('true','false')", "-notin @('true','false')"],
    [
      " -and $env:VISION_MATERIALIZATION_REQUESTED -ceq 'true'",
      " -or $env:VISION_MATERIALIZATION_REQUESTED -ceq 'true'",
    ],
    [".Contains('[vision-materialize]')", ".Contains('[vision-Materialize]')"],
    ['-gt 65536', '-gt 131072'],
    ["@('11.9.0','11.19.1')", "@('11.9.0','11.19.1','latest')"],
    ['-NpmVersion $version', '-NpmVersion 11.9.0'],
    [
      '-ReviewedMaterialization -NpmVersion',
      '-ReviewedMaterialization -RuntimeRoot $env:TEMP -NpmVersion',
    ],
    ['$evidenceReady -eq 1', '$evidenceReady -ge 1'],
    [
      "$_ -ceq 'VISION_MATERIALIZATION_EVIDENCE_READY'",
      "$_ -match 'VISION_MATERIALIZATION_EVIDENCE_READY'",
    ],
  ]) {
    const changed = workflow.replace(before, after);
    assert.notEqual(changed, workflow, before);
    assert.throws(() => contract(changed), before);
  }
});
test('artifact mutations cannot widen paths, accept missing evidence or lengthen retention', () => {
  for (const [before, after] of [
    ['b7c566a772e6b6bfb58ed0dc250532a479d7789f', 'v4'],
    ['retention-days: 14', 'retention-days: 90'],
    ['if-no-files-found: error', 'if-no-files-found: ignore'],
    [`${evidenceRoot}\\installed-inventory.json`, `${evidenceRoot}\\*`],
    [
      `${evidenceRoot}\\materialization-report.json`,
      'D:\\a\\_temp\\fonesi-p4-windows-acquisition-v1\\reports\\materialization-report.json',
    ],
    [" && steps.vision_materialization.outputs.evidence_ready == 'true'", ''],
    [" && steps.vision_materialization.outputs.attempted == 'true'", ''],
    ['if: always()', 'if: success()'],
  ]) {
    const changed = workflow.replace(before, after);
    assert.notEqual(changed, workflow, before);
    assert.throws(() => contract(changed), before);
  }
});
