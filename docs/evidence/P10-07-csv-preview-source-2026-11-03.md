# P10-07 in-app captured fleet CSV source evidence

## Scope and base

Started2026-11-03 22:51:41 UTC, phase-10, verified authorized fonesi-Auto remote and
clean local52748fb20cbc5efc383ee50e45842fc4b21d220c/tree
`d12c5119f5c6340b355cec43b68fc896716a689d`, matching published
`766a675ff6aaa13bcf131fe1f697738ed2e53381`. Parent P10-06 exact hosted
CI41734027573/job126258436615 SUCCESS22:52 UTC with1820/1820 and source marker,
independently read by coordinator. Main and historical branches remain untouched.

Independent design CLEAR and coordinator adoption22:55 UTC on proposal SHA256
`63d9c25ebde2b0872476a649f2d55af8caa09bad971c291cf6950ba9bbd6f006` preceded
production edits. [Narrow contract](../phases/P10-CSV-PREVIEW-SOURCE-ENTRY.md).
Only a private-bound admitted captured health snapshot can produce a report; binding
is internal consistency, not independent sender authentication or revocation proof.

## Implementation and limits

Existing pure fleet-health module now supplies deterministic immutable CSV capture.
Thirteen fixed columns, one row per captured record, header-only known empty scope,
actual decimal integers and explicit NOT_PROVIDED_BY_SOURCE time flags. No fake
measurements or zeros. No raw serial, account, media, job, path, IP or secret data.
Only Device NNNN labels are admitted; Unicode/formula cases test the string primitive,
not an expanded production label/source policy. Formula protection prepends apostrophe
and intentionally changes representation. Lexical CSV preservation is tested, not
Excel auto-typing or large-number precision. Maximum256 records/256 raw UTF16 cell
units/262144 final escaped UTF8 bytes, whole refusal and no silent truncation.

Tracking reuses UiModal and existing geometry. Explicit click freezes all-loaded
registry scope/source/revisions/count; phone/network/account filters do not narrow
it. Meaningful source/selection/filter changes hide and discard capture before
cleanup; semantically equal newly allocated projections do not churn it. Stale open
and close callbacks cannot reopen or dismiss later intent. No background generation,
native save/download/clipboard/network/IPC/dependency/permission. Shell and V9 CSS
remain unchanged. Native export/XLSX/observation timestamps remain unavailable.

## Checks and remaining evidence

At22:59 UTC, focused37/37 PASS:9 new CSV/composition/UI lifecycle cases,18 retained
fleet-health integration cases and10 primary-page cases. New cases compose actual
FleetService → parsed response → health → serializer → actual Tracking/UiModal source;
validate schema/rows/lexical integers/empty-vs-unknown/redaction/immutability,
Unicode/CRLF/quotes/formula/malformed input, 256/257 records, raw256/257 cell limits,
maximum admitted final byte count, semantic identity/selection changes, pending,
errors, unavailability, stale handlers, cancel/Escape/backdrop/focus trap/restoration
and unmount listener cleanup. These source harnesses are not actual browser evidence.

Strict product compiler PASS; graph129 modules PASS; quality443 files PASS with540
pre-existing informational diagnostics, no warnings/errors. Exact map grew66042 to
66149 bytes for narrow import edges. Cap66048→66304 is covered by exact66304 admission
and66305 preparse rejection. One new registered test file; no production module or
build input added. Final source/demo compiler, both builds/manifest/quality/graph and
full frozen registered desktop aggregate are still pending. Independent implementation
review CLEAR23:01 UTC after reviewer64/64 targeted PASS and source diff check.
The strengthened maximal64731-byte case was rerun9/9 PASS. Publication/exact-head
CI remain pending.

Actual Electron/browser screenshots, visual parity, native save/file-failure/spreadsheet
reopening and physical/device tests are NOT_RUN. P1-06 remains UNMET. This is a partial
P10-07 source contribution, not full task/Phase10 acceptance or release readiness.

## Admitted payload bound clarification — 23:01 UTC

The maximal current admitted schema is64731 UTF8 bytes:219-byte header plus256
252-byte rows using DISCONNECTED/PROVISIONAL and maximal safe registry/selection/
generation integers. The full-capacity test asserts this exact bound and257-record
refusal. The262144-byte final ceiling is defense-in-depth and unreachable under the
current schema; its over-ceiling refusal is not directly exercised. No binding forge
or expanded report-input API is introduced to manufacture such an input.

## Aggregate preparation correction — 23:03 UTC

First frozen aggregate23:01:39–23:02:33 failed batch14 with81/88; all16 frozen
changed-file hashes matched. Product/demo compilers, both builds, manifest, graph and
quality stages passed before the registered tests. Exact cause: seven quality-tool
fixture tests hit INVENTORY_LIMIT. Independent walk measured556 entries after adding
one CSV test, versus prior555; owned directory+file fixtures require558, with559
refused. The minimal cap557→558 and corrected boundary test title preserve the exact
next-entry refusal. Direct quality fixture13/13 PASS. Production modules unchanged.
This failed aggregate is not final passing evidence; coherent rerun is pending.

## Interrupted-session recovery and final source gate — 23:18 UTC

Recovery started on 2026-11-03 at 23:15:19 UTC. The authorized repository, remote and
phase-10 branch were rechecked. Public head remained
`766a675ff6aaa13bcf131fe1f697738ed2e53381`; the interrupted work had not moved the
branch. All 18 preserved working-file SHA256 values matched the final pre-interruption
freeze. The retained corrected aggregate reports `TESTS_PASS 1829/1829` and
`DESKTOP_SOURCE_CHECK_PASS`, superseding the pending rerun statements above without
erasing the earlier failed attempt.

A fresh independent read-only review found no blocking source issues and reran the
CSV/fleet/primary-page suites: **37/37 PASS**, zero failures or skips. The reviewer
confirmed the unchanged 18-file freeze and whitespace check.
A fresh complete aggregate was then run from the repository root on Linux, using
Node 24.22.1 and npm 11.9.0:

`env -u NODE_PATH -u NODE_OPTIONS -u ESBUILD_BINARY_PATH node desktop/scripts/check.mjs`

At 23:18 UTC it exited 0 with **1829/1829 PASS** and `DESKTOP_SOURCE_CHECK_PASS`.
This covers the actual registered source suite, product/demo strict compilers, both
builds, build manifests, module graph, quality and dependency checks. No source
files changed between the recovered freeze, independent review and fresh aggregate.
Only this evidence and the current status summary were reconciled afterward.
Publication and the new exact-head hosted source result remain pending at this
checkpoint. No browser/native/device or spreadsheet-application test was run.

## Publication and exact-head hosted source closure — 23:29 UTC

At 23:25 UTC the local worktree was clean at
`c8452e1c284f4d67c51942939ba709dd540c6a53`; all 18 publication-freeze hashes matched.
The public branch was still the P10-06 predecessor. Its already uploaded reviewed
tree was reused without altering source. Publication through the authenticated
connector created `3bd3b06589d5dfa75c0a755a85add3a75021e413` as a normal child of
`766a675ff6aaa13bcf131fe1f697738ed2e53381` and advanced only phase-10 with expected
head and force=false. Remote ref and tree were independently read back.

Both local and public CSV commits have exact tree
`74b86469d11c394fbd2b741ee02abf813f4f8eda`.
[Hosted source run 41739163781](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41739163781),
job 126276010462, completed SUCCESS at 23:29:11 UTC. Logs explicitly contain the
exact public SOURCE_HEAD, TESTS_PASS 1829/1829 and DESKTOP_SOURCE_CHECK_PASS.
This closes publication and hosted source verification only. It does not convert
NOT_RUN visual/native/device checks or P1-06 UNMET into acceptance.
