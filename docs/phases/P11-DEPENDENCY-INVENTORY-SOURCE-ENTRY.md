# Phase 11 P11-02 — reviewed npm inventory source entry

ADOPTED 2026-11-03 22:02 UTC following independent entry review CLEAR of
proposal SHA256 `c589c91ac20e9126a315dce763b862b58e175aa44fae9be9041a284e08b2d6b5`.
Proposed22:01 UTC; inherited baseline settles before source edits.
This is bounded software development under Amendment02 and the user's continued
independent-coding direction, not Phase11 acceptance or release authorization.

## Base, phase disposition and dependencies

New local `phase-11` starts from verified public Phase09
`9befe4dcd936fc7b399af0e77190bb0e9a94e47d`, tree
`0f18da509e79c01a81d280e67cec54d4fe39c923`, created 2026-11-03 21:59 UTC.
That documentation-only checkpoint closes exact public source `8d44f256` Windows
CI41724885138 PASS1802/1802, independently audited; it does not accept Phase09.
Phase09 development is parked with registry/journal, identity, policy, visual and
pilot evidence still missing. Phase10 source selection found no available permitted
metric source/definition/freshness contracts, so its dependent implementation is
not started. No phase is accepted, waived or merged by this transition.
Phase07 and Phase11 are the only active implementation lanes; previous branches
and main remain preserved.

P11-02 explicitly requires dependency inventory and machine-readable supply-chain
evidence. Existing `package-lock.json` and `dependency-review.json` contain a reviewed
80-package npm lock closure (57 optional entries), and `verify-dependencies.mjs`
already validates its origin/integrity/license metadata and prior review provenance.
Existing package admission separately verifies actual runtime/notices. No deterministic
standalone npm inventory exporter/check exists. This is the independent tooling slice;
P11-01 signing/installer policy and full P11-02 runtime/model closure remain blocked.

## Narrow implementation contract

Add `desktop/scripts/dependency-inventory.mjs` with a bounded pure JSON projection
and an admitted fixed-file CLI. CLI calls the existing `verify(false, npmVersion)`
before exporting. It accepts only `--json <reviewed-npm-version>` or
`--check <reviewed-npm-version>`, with no input/output-path argument, child process,
network, runtime import, package execution or filesystem mutation.

Project JSON format is explicitly `FONESI_AUTO_NPM_LOCK_INVENTORY`, schema1, scoped
to `DESKTOP_NPM_LOCK_RESOLUTION_ONLY`. It is not called CycloneDX/SPDX or a complete
application SBOM. Include SHA256 digests of exact manifest/lock/review inputs, fixed
relative source paths, project name/version, package count and each resolved lock
entry once in canonical path order. Record npm name/version, lock path, reviewed
registry artifact URL, sha512 integrity, declared license, dev/optional flags and
OS/CPU restrictions. Preserve optional entries, including other host platforms;
absence of restrictions is not a platform certification. Dependency requirements
may be recorded as declared ranges, never presented as a resolved dependency graph.

The pure projector accepts bounded JSON text, rejects inconsistent manifest/lock/
review, malformed names/paths/versions/integrities/origins/license metadata and
invalid platform flags; no raw caller error/input is echoed. Fixed source keys and
finite input/package/output bounds prevent silent truncation. Unknown/unreviewed
metadata cannot be repaired by default values. Missing optional flags mean false
as in the actual lock format; not-installed does not mean absent from resolution.

Output states that lock resolution is not installed/shipped inventory, current
signature/advisory verification, legal/license clearance or full runtime/model
coverage. Existing license text/notices and package admission are unchanged.
No timestamps, machine paths, account/device data or secrets belong in the output.
A deterministic checked-in `desktop/dependency-inventory.json` is evidence, not
an executable asset. `--check` regenerates and requires exact bytes, failing closed
on missing/stale inventory. `--json` prints only the bounded JSON for authorized
local generation; neither mode writes a file. Failure prints a fixed diagnostic.

## Integration, tests and evidence

Register the checker in the existing source runner, focused tests in its sorted
fixed inventory, and script/inventory in the build input manifest. Increase finite
quality traversal only by actual added entries. No application modules, renderer,
preload, IPC, DB, package format, launch path, dependencies or permissions change.
A phase11-only read-only source CI may reuse pinned checkout/Node actions,
Windows2022, credentials/cache disabled, finite timeout, scripts-disabled restore
and unchanged source runner. No artifact upload, installer, signing or runtime run.

Tests: exact80/57 corpus; one entry per lock path; deterministic bytes and digests;
scoped and nested package names; optional/platform constraints; metadata mismatches;
bounds and malformed JSON; invalid registry/integrity/version/license/path values;
no mutation; exact stale/missing checker behavior and fixed CLI arguments; source
runner/workflow guards. Run focused tests, actual full quality/strict/build/manifest
and complete fixed source suite. Independent implementation review precedes commit
and publication, followed by exact-head hosted source CI. Keep actual failures.

Hardware/user Windows, runtime/model completeness, signing/legal review, installer,
release tag/publication and all inherited acceptance gates are NOT_RUN/UNMET as
applicable. No release percentage or task acceptance is inferred from this slice.

## Adopted reviewed-text continuation — 2026-11-03 23:58 UTC

Independent design review CLEAR; coordinator delegates safe source entry after
CLEAR under the existing continued-independent-work direction. Base is exact
local/public `ea5f9b4a0da28ea01f81072af0dee122188ae7fc`, whose Windows source
CI41729768650/job126243762570 completed SUCCESS with1846/1846 tests and
DESKTOP_SOURCE_CHECK_PASS. This separately extends the earlier inventory-only
scope; existing shipping notices, package admission and dependency pins stay unchanged.

Add only development evidence tooling `desktop/scripts/reviewed-license-evidence.mjs`,
focused tests, `desktop/reviewed-license-evidence.json` and
`desktop/reviewed-license-notices.txt`, plus source/build/test registration. Collect
exactly existing fixed LICENSE files for react, react-dom, scheduler,
@js-temporal/polyfill and jsbi. Existing package-admission constants remain the
hash authority, with Temporal/jsbi also agreeing with dependency-review reviewedFiles.
Do not infer legal obligations, source-repository attribution or whole installed
package identity from the text. All80 lock entries remain represented:5 collected
and75 NOT_COLLECTED_BY_THIS_TOOL (not missing, unsupported or prohibited).

Fixed CLI --json/--notice/--check <reviewed-npm-version> calls existing inventory
admission, accepts no caller path and has no write/network/subprocess/dependency
execution. Pure rendering validates the original manifest/lock/review projection
and five exact ordered byte inputs. Reject missing/duplicate/reordered inputs,
changed hashes, empty/oversized/nonregular files, symlink components and malformed
UTF-8. Bound descriptor reads to32KiB per license with pre/post identity checks;
preserve BOM and exact text line endings rather than trimming/normalizing. Bound
metadata/artifact reads and output. Check mode requires exact JSON and notice bytes.
This is a fixed owned-checkout tool, not a hostile concurrent-editor security boundary.

Test deterministic80/5/75 coverage, text bytes and hashes, invalid metadata,
missing/changed/oversized/nonregular/symlink/UTF-8 inputs, stale/missing artifacts,
fixed CLI arguments and unchanged runtime/package consumers. Independent implementation
review, full source aggregate, phase-11-only publication and exact-head hosted source
verification remain mandatory. Serialize aggregate/build with Phase03's owner.
Only Phase03 and Phase11 are active source lanes; Phase10 is source-frozen at
public2f4fa167 with exact hosted1836/1836 PASS. No main or other phase changes.

This slice is not complete third-party notices, installed/shipped inventory, full
SBOM, redistribution approval, legal clearance or release acceptance. Bundled
runtimes/models, signing/installer, user Windows/physical hardware, policy and
P1-06 UNMET remain open and unchanged.

## Adopted tool-text extension — 2026-11-04 00:21 UTC

Coordinator's delegated source entry follows independent provenance/design CLEAR,
report SHA256 `a81958f944f0562d1f62025b976e77abe89c38dc59ae9fef94f38a0d7a6bb02b`.
Local base `7cd6b97548036791d50d25d8cf8ea71cbb26008b` and public
`5e79d66757d22c6c50ae721045ac7011c7d48357` share tree
`ba788cad66cfbb7c810053ba5540e8121b581931`; predecessor Windows source checks
passed1868/1868. Both histories remain preserved, main untouched.

Extend only the existing development evidence tool with seven exact texts from
already-pinned @biomejs/biome2.6.4, esbuild0.28.2 and typescript7.0.2 artifacts.
Independent read-only archive rehash matches existing lock/review/inventory SHA512;
all seven member bytes equal recorded and installed files. Record sanitized exact
artifact URL/integrity/version/member/SHA256/size evidence, pinned by immutable
serialized source and exact CLI equality. Archive research is not rerun by the CLI.
No downloaded code is executed, dependencies installed or runtime pins changed.

Schema2 represents an array of texts per lock package and separates80 package rows,
8 collected package rows,12 collected texts and72 NOT_COLLECTED_BY_THIS_TOOL rows.
Retain original five pins, all three Biome texts without selecting a license option,
and TypeScript's nested vscode-jsonrpc license as an artifact member, not a new
package. Only the fixed48860-byte TypeScript NOTICE receives a65536-byte read bound;
other text bounds stay32768 and outputs262144. Preserve exact CRLF bytes with a
narrow `desktop/reviewed-license-notices.txt -text` Git attribute; verify staged blob
and published-tree bytes, not worktree alone. Existing evidence remains in Git history.

Preserve own-data descriptor validation and one copied Buffer snapshot for decoding,
hashing and counts; bounded nonlink regular reads, fixed errors, fixed read-only
CLI and stale-artifact checks remain. Add multi-text/count, exact mapping, mismatched
pins/metadata/provenance, per-file negative and newline-preservation regressions.
Build inputs include only the new fixed provenance source/artifact; quality traversal
increases only by measured entries. Independent implementation review and final
frozen full aggregate, serialized with Phase03, precede clean commit, phase-11-only
publication and exact-head hosted source CI. No runtime/package consumer is added.

Only Phase03 and Phase11 remain active; Phase10 is frozen. Full P11-02, complete
notices/SBOM, redistribution/legal clearance, signatures/attestations, whole installed
package identity, signing/installer/release and hardware acceptance are not established.
P1-06 UNMET and all original acceptance gates remain unchanged.

Lane update — 2026-11-04 00:26 UTC: peer/coordinator confirmation replaces the
paused Phase03 lane with Phase05; only Phase05 and Phase11 are active. Earlier
00:21 lane wording remains historical. No Phase11 source scope or acceptance changes.
