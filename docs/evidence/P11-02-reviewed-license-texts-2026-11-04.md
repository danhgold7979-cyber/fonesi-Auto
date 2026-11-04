# P11-02 fixed reviewed license texts — development evidence

## Scope, review and provenance

Work began 2026-11-03 23:56 UTC on clean `phase-11` at exact local/public
`ea5f9b4a0da28ea01f81072af0dee122188ae7fc`. Independent design review CLEAR
preceded the [adopted 23:58 UTC source entry](../phases/P11-DEPENDENCY-INVENTORY-SOURCE-ENTRY.md#adopted-reviewed-text-continuation--2026-11-03-2358-utc).
This is continued partial P11-02 software evidence, not task/phase acceptance.
Only Phase03 and Phase11 are active source lanes; Phase10 is source-frozen.

The existing package-admission constants already pin five available npm LICENSE
files; Temporal/jsbi also match dependency-review reviewedFiles. The new tool
reads these exact files, not package code. No network/download or dependency
installation was needed in the local continuation. The source origin recorded is
the reviewed npm lock artifact URL; no upstream repository attribution is inferred.

| Fixed package | Exact source bytes | Existing SHA256 |
|---|---:|---|
| @js-temporal/polyfill | 750 | ffc4aee7f1279fc0494ff2b27f6829e6b4d16c20aa93aa008c3bd8d8af176387 |
| jsbi | 10174 | 9568a2b155e66ac3e0ba1fd80b52b827b9460e6cf6f233125e7cbca8e206ddc3 |
| react | 1088 | da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93 |
| react-dom | 1088 | da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93 |
| scheduler | 1088 | da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93 |

## Delivered contract

- `desktop/reviewed-license-evidence.json` maps every80 reviewed lock instance in
  canonical order, with5 COLLECTED_REVIEWED_TEXT and75 NOT_COLLECTED_BY_THIS_TOOL.
  The latter status does not say files are missing, prohibited or unsupported.
- `desktop/reviewed-license-notices.txt` preserves all five complete original texts
  byte-for-byte within explicit framing. JSON binds the full notice artifact and
  exact text bytes with SHA256, byte counts and existing pin-source references.
- `desktop/scripts/reviewed-license-evidence.mjs` invokes existing inventory
  admission, checks captured metadata agrees, then reads only fixed license paths.
  The pure renderer is not independent trust admission. Lock identity is not
  verification of all installed package contents.
- Descriptor reads allocate at most the fixed limit plus one byte, with lstat,
  fstat and post-read identity/size checks. Root-relative parent/leaf links,
  directories, empty/oversized files, malformed UTF-8 and changed digests fail.
  UTF-8 decoding retains BOM and line endings; changed BOM bytes fail pinned hashes.
  This owned-checkout tool is not a malicious concurrent-editor security boundary.
- Fixed `--json`, `--notice`, `--check` modes take only the reviewed npm version.
  Output/check are deterministic; CLI has no path option, writes, subprocess,
  network or package execution. Check requires exact JSON and notice bytes.
- Source checker/build input/test inventories include only the new evidence work.
  Quality traversal rises557→559 entries and442→444 source files. Runtime,
  package admission/payload, dependencies/pins, permissions, UI and IPC are unchanged.

From the repository root in the disposable Linux environment:

```sh
env -u NODE_PATH node desktop/scripts/reviewed-license-evidence.mjs --json 11.9.0
env -u NODE_PATH node desktop/scripts/reviewed-license-evidence.mjs --notice 11.9.0
env -u NODE_PATH node desktop/scripts/reviewed-license-evidence.mjs --check 11.9.0
env -u NODE_PATH node --test --test-reporter=tap desktop/tests/reviewed-license-evidence.test.mjs
env -u NODE_PATH node desktop/scripts/quality-tool.mjs --inventory 11.9.0
env -u NODE_PATH node desktop/scripts/check.mjs
```

Generation prints to stdout; the author writes the reviewed artifacts separately.
Windows source CI uses its actual reviewed npm11.19.1 without inherited overrides.
No runtime flag or dependency check is bypassed.

## Actual evidence

Environment: disposable Linux x64, Node24.22.1, npm11.9.0; existing hash-admitted
build dependencies. Source tests use only owned fixtures. No user computer/device,
Electron runtime, native workflow or installer was used.

- Focused tests PASS22/22, zero skipped/cancelled/todo; independently repeated.
- Exact fixed checker PASS; independently repeated.
- Quality PASS444 files with no errors/warnings (existing informational suggestions
  remain informational; no configuration relaxation).
- Independent implementation review and revised-source re-review CLEAR on
  2026-11-04 at00:04 UTC (initial pre-fix review at00:02), all source,
  artifacts and four registrations reviewed. No material findings.
- Reviewer initial inherited-override run failed19/21 with OVERRIDE_REJECTED;
  documented child-only override-free rerun passed21/21. Retain this environmental
  failure rather than presenting it as a source pass.
- First aggregate PASS1867/1867 with DESKTOP_SOURCE_CHECK_PASS before the
  accessor regression addition. Final frozen aggregate PASS1868/1868 and
  DESKTOP_SOURCE_CHECK_PASS, exit0, at00:05UTC. All eight frozen source/artifact/
  registration hashes matched after the run. Exact source publication/hosted result
  is verified in the closure below.
- Coordinator inspection reproduced an exported-pure-renderer defect: an accessor
  could provide different bytes for decode versus hash. Fixed with exact own-data
  property admission and one copied byte snapshot used for text/digest/count.
  Getter/path/symbol regressions now reject without invoking getters. The fixed
  CLI used plain own-data inputs throughout; artifact bytes are unchanged.

Reviewed SHA256:

- Script: `b11a16acbf2826b0804bffea647e318569e3c5dd27ea7093f17364a6ebd02042`.
- Tests: `4ee7d088dd2ffe0eb33780fb4bf9c77dce7062c823667ab154a4ea3a0dc72ebe`.
- JSON: `0019408dd92d6e281046e13c9381f548794401b63fa9e8a2447b47887513b1dc`.
- Notice: `b289e5d9b25d9ced9715f03475422bb81c25bd2f6747646f0934940ab83dbaa8`.

The final aggregate ran metadata/installed admission, both deterministic evidence
checks, module graph, quality, strict product/demo typechecks, product/demo builds,
build manifest and the complete fixed test inventory. Local signatures/advisories
were NOT_RUN in this no-restore continuation; hosted CI performs its own restore
and registry checks. Foundation/Python standalone suites were NOT_RUN here.
`git diff --check` PASS. Local work through the verified aggregate took nine minutes
from23:56UTC; publication monitoring is reported separately.

## Verified source publication — 2026-11-04 00:12 UTC

Reviewed local source commit `5aa817c04ac908c6dd3c20ca1de62388aaa2df31` and public
[`7425aca3fa4082e6aa201a9e9804176bac1f4915`](https://github.com/danhgold7979-cyber/fonesi-Auto/commit/7425aca3fa4082e6aa201a9e9804176bac1f4915)
share exact tree `7cccd71dcdf6fdbce50001ae5fab74a17279421b`. Public parent remains
`ea5f9b4a0da28ea01f81072af0dee122188ae7fc`. Normal git push failed before mutation
because HTTPS authentication was unavailable; no credentials were acquired.
Authorized connector publication created the same reviewed tree and a new commit
on that public parent, then updated only phase-11 with expected-head and force=false.
Independent ref/commit read-back and fetched Git objects confirmed tree identity;
local and public commit histories are preserved, with different commit metadata.

[Exact-source Windows CI41744614733](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41744614733)
completed SUCCESS. Job126294366120 binds SOURCE_HEAD to public7425aca3 and records
TESTS_PASS1868/1868 and DESKTOP_SOURCE_CHECK_PASS at00:12:00UTC. Pinned
windows-2022 / Node24.22.1 / npm11.19.1 source verification includes scripts-disabled
restore, signature/advisory checks and full aggregate. No native workflow,
installer, device or release acceptance was run. This closure changes documentation
only; it does not alter the tested source/artifact bytes or widen their claims.

## Limitations and rollback

Not complete third-party notices, installed-host/shipped-product inventory,
CycloneDX/SPDX/full SBOM, redistribution approval, legal clearance or release
acceptance. Bundled runtimes/models, additional notices and license obligations
are outside this slice. Package admission and its existing shipping notices stay
separate and unchanged. Digests identify bytes and projection inputs, not all
admission dependencies or legal conclusions. No current vulnerability/signature
attestation is inferred merely from these artifacts.

P11-01 signing/installer policy, complete P11-02 scope and P11-03–10 remain open;
Phase11 technical acceptance remains0/10, P1-06 cross-user remains UNMET.
User Windows, physical-device, installation, recovery, load/security and release
acceptance tests are NOT_RUN. No merge/main/tag/release action is authorized here.
Rollback is a reviewed forward source change removing this evidence-only checker
and artifacts, never alteration of existing package admission or Git history.

## Seven-tool-text continuation — 2026-11-04 00:19 UTC onward

The preceding five-text/schema1 result is historical and retained in Git. The
[00:21 UTC adopted extension](../phases/P11-DEPENDENCY-INVENTORY-SOURCE-ENTRY.md#adopted-tool-text-extension--2026-11-04-0021-utc)
adds seven exact texts from three existing pinned registry artifacts. Independent
provenance/design review CLEAR preceded production edits. Original research record
SHA256 `ca61cc0894a4190aa12b64640b88a6803fdb304eb74caca9443a41707baad6f2` and
independent design report `a81958f944f0562d1f62025b976e77abe89c38dc59ae9fef94f38a0d7a6bb02b`
are distinct from the sanitized committed provenance serialization.

Independent cached archive rehash matched exact lock/review/inventory SHA512 for
Biome2.6.4 (115389 bytes/19 members), esbuild0.28.2 (34207/7) and TypeScript7.0.2
(365612/416). All442 names were unique/canonical; archive entries were regular
files/directories, with no links/special members. Seven selected member bytes match
research and installed files exactly. The case-insensitive legal-filename scan found
these seven names; it does not establish absence of inline notices elsewhere.
Public registry downloads were read only, with no downloaded code execution.

[Sanitized provenance](../../desktop/reviewed-tool-license-provenance.json) binds
exact names/versions/URLs/integrities and seven member hashes/sizes to the fixed
immutable source string in `desktop/scripts/reviewed-tool-license-pins.mjs`.
Routine CLI checks that exact provenance file and installed text bytes; it does not
redownload or rehash archives. No runtime/package-admission/dependency pin changed.

Schema2 replaces singular licenseText with licenseTexts arrays, with empty arrays
for uncollected rows. The denominator remains80 lock rows:8 collected package rows,
12 fixed texts and72 NOT_COLLECTED_BY_THIS_TOOL rows. TypeScript's nested
vscode-jsonrpc license adds no independently resolved package. All Biome Apache/MIT
and Rome texts are retained, without choosing a license option or legal conclusion.
Original five text hashes and admission constants remain unchanged.

Only TypeScript NOTICE.txt receives a65536-byte cap for its48860 exact bytes;
all other license reads retain32768 and total outputs262144. The original bounded
regular/nonlink reader, fixed error/modes, own-data descriptors and copied Buffer
snapshot remain. Provenance is bounded16384 bytes, checked exactly. New build
inputs are fixed provenance source/artifact only. Actual quality inventory measured
558 entries and445 source files; cap560 retains exactly two additional entries
for the existing owned quality fixture directory/file pair. Prior559 covered557
base entries plus the same fixture pair; no blanket limit increase applies.

TypeScript LICENSE retains55 CRLF pairs and NOTICE436, plus upstream trailing
spaces. The consolidated artifact retains491 CRLF pairs. A single scoped Git
`-text` attribute prevents normalization. Unscoped `git diff --check` reports these
authentic upstream bytes as whitespace errors; they are intentionally preserved,
not fixed or presented as a clean whole-tree whitespace pass. Authored source/docs
must separately pass `git diff --check -- . ':!desktop/reviewed-license-notices.txt'`.
Exact worktree/staged/published notice blob equality is required for publication.

Focused local tests initially passed27/27 with no skips/cancellations/todos, covering
new mappings/counts, all seven changed/oversized/accessor inputs, pinned tuple drift,
CRLF representation and caller buffer mutation; previous reader/CLI/admission
regressions remain. Provenance missing/extra/reordered/size-drift negatives were then
added to the CLI fixture. Independent implementation review, final frozen aggregate,
staged-byte verification and exact hosted source outcome are recorded below when
actually available, not inferred from this initial focused pass.

### Reviewed extension verification

Independent implementation review CLEAR on2026-11-04 at00:26 UTC, report SHA256
`b8b62fa00de296dd1abd3c8de5e6dec84e8694d59e415f10e6ac2be3b0949427`.
Author and independent final focused checks PASS27/27, fixed checker PASS.
Sanitized provenance SHA256 is
`57b881902802a9650358930dd2a812bde7c889839098af19545cb0543d666caf` (3595 bytes).
JSON evidence SHA256 is
`7f2d1d5b56cd2c675de0203282c5ef29c6a4d19d3c16f7060063aa74eb4e1b31` (43467 bytes).
Notice SHA256 is
`e29d9c899322c8c281b8704a81b8a372472f52aa54826fafe288426104281027` (90921 bytes).
Actual staged Git blob `3df8e02a135f07747c9c5acc594926bf805b9ba0` equals worktree
notice bytes, including491 CRLF pairs. Unscoped whitespace check exits2 with491
notice-only findings; authored-file check excluding that one exact artifact exits0.

At00:26 UTC peer/coordinator confirmed Phase03 paused and Phase05 active alongside
Phase11. Aggregate ownership is serialized with that peer; earlier lane records
remain historical. This changes no source scope, dependency gate or acceptance.

First full aggregate (00:29:11–00:30:09 UTC) FAILED at batch13 with101/108
and seven quality-fixture failures. A too-tight558-entry cap had incorrectly removed
the existing two-entry fixture allowance. Corrected to measured558+2=560, with the
existing boundary test still rejecting the third added entry561; updated its stale
title. This is a bounded source correction, not a skipped test or relaxed fixture.
The initial review's558-cap recommendation is superseded by this actual test result.

Coordinator correction source/docs review CLEAR at00:31:40 UTC, record SHA256
`89a2e38d6651b0d12d55fa4d104a68f9e55eba558f90d8e7e264c4f6f1d57cc8`.
Focused quality PASS13/13 confirms the preserved fixture allowance and overflow
rejection. Final frozen aggregate ran00:31:01–00:32:25 UTC and PASSED1873/1873
with DESKTOP_SOURCE_CHECK_PASS, exit0. All ten frozen source/attribute/artifact
hashes matched afterward. This includes metadata/installed admission, inventory
and reviewed-text checks, module graph,445-file quality, strict product/demo
typechecks, product/demo builds, build manifest and the complete fixed source suite.
Local restore/signature/advisory, foundation/Python standalone, native/device/user
Windows/installer and release acceptance checks were NOT_RUN in this continuation.
Hosted source publication/checks remain pending at this local checkpoint.
