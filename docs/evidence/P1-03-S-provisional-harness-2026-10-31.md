# P1-03-S strict/compiler/import harness — 2026-10-31

Entry approved by coordinator at 01:39 UTC after reviewed P1-01-S publication:
`5eb71d68c0ea839ab00107030307b11717ebb1c6`. Entry was recorded in the amendment
and status before code. This is the narrow source subset, not full P1-03 or Phase 1
acceptance. No P1-11-S implementation or runtime service is included.

## Implemented

`foundation/tsconfig.json`, empty `src/contracts/module.ts`, development boundary,
hygiene/check/tool scripts and boundary/harness tests. Existing package, lock,
review snapshot and bootstrap checker are unchanged. Candidates remain Node 24.22.1,
npm 11.9.0 and TypeScript 7.0.2. No new dependency, installation, hosted workflow,
renderer, IPC, database, secret or device service.

[Workspace README](../../foundation/README.md) records the exact grammar and limits:
only type-only named sibling imports; flat source inventory; cycles and missing
targets rejected. Unsupported loaders, re-exports, encodings and directives fail
closed. Compiler checks semantics separately; limited reference hygiene is not a
hostile-JavaScript sandbox or complete runtime capability detector. Test/tooling
Node APIs cannot be imported by source. Full formatter/linter remains deferred.
TypeScript 7's existing unstable scanner API was verified against the installed,
integrity-locked package export/declarations, not assumed from an older compiler.

Inspected shipped scanner SHA256 values:
- JavaScript: `a5e29430a9414acc5e6f3ede98c255394801dcbb3626010075860c03e676a057`.
- Declarations: `48f61e0a9e00b97bc155790f0bdea12a18bb3e14eb5cbac81ec1bafbc42253e8`.

An attempted exact-tag upstream scanner path returned cache miss; no claim that
URL verified this API. The locked shipped source is the inspected primary artifact;
no package was added or replaced.

## Actual local evidence

Environment: Linux x64, Node 24.22.1, npm 11.9.0.
Command: `node foundation/scripts/check.mjs 11.9.0`.
Order: bootstrap → boundaries → strict compilation → limited hygiene → Node tests.

The initial 46-case suite had 45 PASS / 1 FAIL: a nested test subprocess inherited
Node's `NODE_TEST_CONTEXT` child marker, so independent TAP output was absent.
The assertion was retained; only that marker is removed in the fresh subprocess
environment. Subsequent 46/46 runs passed twice. Additional negative exit-code,
strict-flag, source-inventory and test-summary regressions were then added.
No failure was waived. [Exact Node runner source](https://raw.githubusercontent.com/nodejs/node/v24.22.1/lib/internal/test_runner/runner.js)
was read for test-runner context; no global environment/security setting changed.

Final local suite: **54/54 PASS, 0 failures, skips, cancellations or todos**.
All five stages passed. Independent reviewer ran the full command twice with the
same passing counts; owned fixture output was empty afterward.

Coverage includes valid strict compilation; unsafe assignment; unchecked index;
exact optional property; implicit return; unused local/parameter; Node/DOM global
and syntax rejection; positive import graph; forbidden forms/cycles/missing targets;
actual nonzero compiler/assertion/boundary/hygiene subprocess exits; and rejection
of skipped, empty, contradictory or duplicate summaries. A summary requires exactly
one count per field, positive test count equal to passes, and all other counts zero.

Independent review identified and closed three issues: unlisted source inventory,
inconsistent test summaries and fixture-parent ownership. Actual filesystem
fixtures now reject rogue source files/nested layouts. Parent/child realpaths and
symlink status are checked before cleanup. These checks do not claim resistance to
hostile concurrent filesystem replacement. Developer tools request a 30-second
timeout and 64 KiB capture limit; this is not arbitrary descendant-tree containment.

## Review, branch and remaining gates

Independent read-only review **CLEAR at 01:47 UTC**: full five-stage check passed
twice, 54/54 each; scanner hashes, links/whitespace and baseline checks passed.
No Windows, target-host, application packaging or runtime security test executed.

All writes paused for branch coordination, then resumed on `phase-01` at local
`cabbb05df18caf8d1e8b8d7b7b75a09dcd86c9ea`. Coordinator verified remote `phase-01`
at `5eb71d68c0ea839ab00107030307b11717ebb1c6`, and canonical `phase-00` at
`4d06c2fbf67f8ce36a05b695f90f493623e56e87`. Legacy `phase/00-feasibility` is frozen
historical transition history, including its earlier P1-01-S checkpoint; no rewrite
or deletion. Main remains unchanged. Future phase branches require authorization.

Original Phase 0 baseline SHA256 remains
`3882e2112129fdc0dcdc69104195cc95d8f90c933a210c9002cd16642873316c`; all 12 exits
remain unchecked. Navigation source/package 20/21 FAIL, ADR B/C limitations and
C-03/C-05/V9 requirements are unchanged. The source compiler currently checks an
empty module marker; P1-11-S validators still require parent entry approval.
This checkpoint neither accepts full P1-03/Phase 1 nor activates privileged services.

Final branch-documentation review CLEAR at 01:49 UTC: source unchanged from the
54/54 × 2 review; 81 local links, whitespace/diff and original baseline checks
passed. Root also independently reran all five stages with 54/54 PASS on phase-01.
This source subset is ready for publication; P1-11-S entry remains pending.
