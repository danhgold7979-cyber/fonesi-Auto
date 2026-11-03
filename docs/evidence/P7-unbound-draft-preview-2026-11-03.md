# P7 unbound draft preview — source evidence

## Recovered base and actual production corpus

Work began 2026-11-03 21:11 UTC from published `phase-07`
`3a7689e3c70435f673d53b21a2f713d5ac1a53ca`, tree
`5c5d138b0384d67e47dd9b917dd4fb3b38a64dd3`, in an isolated checkout.
Existing main and other phase histories were preserved. The unavailable Phase6
worktree was not reconstructed or overwritten. Its absence in this executor is
not a determination that its source no longer exists elsewhere.

[Scheduler run 41493281269](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41493281269)
completed successfully on this exact published head. Artifact 13164873387,
`schedule-production-campaign`, is a 3108-byte ZIP with SHA256
`e0b80190ad8a2bc7545828da9528d9d62b6925ee0bcae813edef5b433b4fd5dc`.
The exact closed JSON is retained as
[P7-production-campaign-41493281269.json](P7-production-campaign-41493281269.json),
SHA256 `c12704965826d5e026458de14b95ca97ce664cdb50df629b80034a193ba196e3`.

Independent read-only artifact audit CLEAR on 2026-11-03 verifies:
- Source HEAD/tree match; 19 source hashes match exact Git blobs. The twentieth,
  the workflow, matches the Windows CRLF checkout of its exact Git blob. Its EOL
  is not fixed by .gitattributes. There is no unexplained source mismatch.
- All three results pass the repository's strict `validateProduction`: UTC,
  America/Los_Angeles and Asia/Tokyo with host offset minutes 0, 480 and -540.
- Exact win32/x64 Electron 45.1.0, Node 24.22.1, V8
  15.6.75.19-electron.0, ICU 78.2, CLDR 48.0, tz 2026e and Unicode 17.0 witnesses;
  override absence and distinct production/candidate profiles are retained.
- All six production/candidate corpora have the same ten cases, 4284 assertions
  each, and semantic digest
  `3323159f15b7d5affb618dd5947876578accfce7e06fa2df54290a0841f0bec3`.
- Each receipt has exit 0, CONFIRMED retirement and complete capture. Exact source
  emits the public campaign only after the three fresh owned runs and campaign
  root have retired and cleaned up. Runtime/bundle hashes are custodial report
  evidence, not independently rebuilt binaries in this recovery audit.

This closes the actual production-corpus review prerequisite at the old published
head. It does not establish a future changed-source native run, UI wiring, saved
schedule, device exclusion or Phase acceptance. The unrelated historical Phase0
stack run 41493292291 remains FAIL and is not waived.

## Narrow source change

[Reviewed entry](../phases/P7-UNBOUND-DRAFT-SOURCE-ENTRY.md) adds
`evaluateUnboundScheduleGapPreview` to the existing gap contract, with a closed
`UNBOUND_DRAFT` scope and distinct `UNBOUND_SCHEDULE_GAP_ADVISORY` result.
Its draft ID/revision identifies local unsaved editing intent only. No placeholder
principal/device/schedule identity, storage, permissions or execution claims.
The old bound-scope API retains its request/result/error semantics; both exports
use the same actual civil-to-zone-to-gap calculation, with one warning body.
No imports, dependencies, inventory entries, IPC, main, preload or UI change.

Existing 12 gap tests and eight new unbound tests cover separate scope/result
kinds, injected identity denial, closed schema/prototype/symbol/descriptor/proxy
refusal, scalar and revision bounds, caller mutation, recursive output freezing,
legacy compatibility, 29/30-minute and midnight spacing, real DST gaps/overlaps,
truncated coverage/next, exact resolver failures and runtime refusal precedence.

## Executed checks and remaining gates

Linux authoring runtime: Node 24.22.1, npm 11.9.0. Dependencies restored by the
existing scripts-disabled/signature/advisory-checked runner; no Electron launch.

- PASS: baseline `env -u NODE_PATH node desktop/scripts/check.mjs --restore`,
  1753/1753 and DESKTOP_SOURCE_CHECK_PASS before source edits.
- PASS: `env -u NODE_PATH node --test --test-reporter=tap
  tests/schedule-gap-contract.test.mjs` from desktop, 20/20 after edits.
- PASS: git diff --check.
- PASS: final `env -u NODE_PATH node desktop/scripts/check.mjs`, 1761/1761
  and DESKTOP_SOURCE_CHECK_PASS, including graph, quality, strict TypeScript,
  normal/demo builds, manifest and all registered tests.
- CLEAR: independent implementation review of exact gap source SHA256
  `8aef915edcc5356321af8541b93120cbc5de79c8b0dc1d02692b366d7c842963`
  and test SHA256
  `c2323e3d4ed2a661cca1e2d5a7c3f10a7adead9587a495553e1d0f871cb141be`.
  Independent focused rerun also passed 20/20.
- NOT_RUN: new API in actual Windows runtime, V9/main/preload integration and
  device tests. Existing native artifact above belongs only to its recorded head.

One initial test-writing command used the repository-relative path from desktop
and failed before altering the test file; the subsequent legacy-only run passed
12/12. The corrected test-writing invocation then produced the 20/20 result above.
The independent recovered-artifact harness initially had 29 PASS / 6 FAIL because
of inherited forbidden override environment; the documented NODE_PATH-cleared
retry passed 35/35. These are retained preparation/environment outcomes, not
silently converted into clean first-attempt test passes.

No new ledger cell or task credit: source/integrated remains 6/47, formal
acceptance 0/13. The new API resolves one prerequisite for a separately reviewed
V9 bridge; it is not P7-03.B, P7-04.B or durable P7-11 completion.

Source checkpoint completed 2026-11-03 21:18 UTC, about seven minutes after the
recorded implementation scope start. Narrow source task PASS; full Phase7 remains
unaccepted. Publication and exact changed-head hosted results must be verified
separately before claiming a remote checkpoint or new Windows result.
