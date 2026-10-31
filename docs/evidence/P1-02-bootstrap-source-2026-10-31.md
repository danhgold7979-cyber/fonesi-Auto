# P1-02 partial bootstrap source checkpoint — 2026-10-31

Coordinator approved the [bounded proposal](../phases/PHASE-01-P1-02-S-AUTHORITY-FREE-PROPOSAL.md)
at 02:08 UTC; entry was recorded before source. Branch `phase-01`. Canonical task
P1-02 remains incomplete; partial source is not a new task or percentage denominator.

## Actual deliverable

`desktop/` now contains actual main/lifecycle/profile/resource-policy modules, a
static UNAVAILABLE diagnostic fixture, strict configuration, exact dependency closure,
fail-fast development runner, build-integrity manifest and pure tests. No preload or
application IPC bridge/dispatcher, product UI, device/account/DB/vault/process service.
Normal owned Electron profile activity is acknowledged, not a zero-OS-effects claim.

Linux source checkpoint: Node 24.22.1, npm 11.9.0, TypeScript 7.0.2, esbuild 0.28.2;
Electron 45.1.0 package metadata only, **no binary installation/import/runtime launch**.
The minimal 61-entry recursive closure equals the previously reviewed lock entries.
17 locally applicable packages restored with lifecycle scripts disabled. Installed
metadata, exact never-executed hook strings, reviewed installer/script hashes and
esbuild binary hash verified before compiler/build execution.

## Sequencing defect, correction and preserved evidence

The first command batch ran a correct preflight rejection for inherited NODE_PATH,
but shell commands lacked an &&/fail-fast guard, so scripts-disabled npm restore
still ran. This was a sequencing defect, not a passed preflight. No lifecycle hook,
Electron binary/installer or application runtime executed. No host/global setting
was changed. The root was informed immediately.

Correction: per-command NODE_PATH removal only; explicit metadata/installed stage
verification; a development stage runner stops on either false result or exception.
Regression tests prove failed preflight prevents restore/build and failed installed
verification prevents build. Exact installed prepare/prepublish commands were also
reviewed and recorded as never executed instead of silently allowing unknown hooks.
The final complete command succeeds with no changed acceptance assertion.

## Tests and build integrity

Command: `env -u NODE_PATH node desktop/scripts/check.mjs`.
Actual result: **31/31 PASS**, no skips, cancellations or todos; metadata, installed
checks, strict compile, actual bundle build and source/output manifest validation PASS.

Tests cover exact assets and canonicalization distinction; secure preference flags;
permission/network/download/popup/webview/observed-navigation wiring; close/reopen,
duplicate lifecycle operations, factory failure and cleanup of every owned action;
fresh/missing/wrong/extra ownership markers; no application bridge/effect service in
reviewed source/bundle; and fail-fast stage ordering.

A fixed asset hash is validated before bundle writes. Build invalidates old success
before verification, then records source/output hashes only after successful writes.
Main checks its own output hashes; the future launcher must also verify current
source against the manifest. Regression tests use an owned copy to detect modified
bundle/source, absent/partial manifest, and an actual failed build that removes a
previous success marker. Partial leftover files cannot be promoted as verified.
Nonregular manifest files are rejected before reading; a directory-marker regression
checks this safely. Default native application menu removal is explicit before the
first window and source-order tested; actual Windows menu-null verification is still
required. These hashes are consistency checks, not a signed release or malicious-editor proof.

## Still NOT_RUN / not implemented

No actual Electron secure-setting/runtime inspection, source/package launch, original-
window transition observation, Windows Job cleanup or target-host test was performed.
The new trusted Windows launcher/probes/validator/workflow and official installer
invocation are not yet implemented. Existing Phase 0 workflows/labs are unchanged.
The proposal's runtime/network/offline safety contract remains required before launch.
Linux policy mocks prove wiring only, not native browser behavior or navigation denial.

Original Phase 0 baseline SHA256:
`3882e2112129fdc0dcdc69104195cc95d8f90c933a210c9002cd16642873316c`; all 12 exits
remain unchecked. Old source/package 20/21 navigation FAIL, ADR B/C limitations,
C-03/C-05/V9 and all activation/acceptance gates remain. Full manual/scheduled
authority is a software design obligation, not something the host ZIP can solve.

Independent source review CLEAR at 02:24 UTC: reviewer ran the complete desktop
check twice without restore, 31/31 PASS each; owned test output empty. Verified
regular-file manifest checks, explicit menu removal, exact 61-entry closure and
provenance. Reviewer did not import/install/launch Electron. Root owns publication
and the next already-scoped Windows implementation checkpoint.
