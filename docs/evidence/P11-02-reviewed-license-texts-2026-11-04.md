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
