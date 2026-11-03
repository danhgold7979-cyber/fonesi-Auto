# P11-02 npm lock inventory — bounded source evidence

## Scope and base

The [adopted entry](../phases/P11-DEPENDENCY-INVENTORY-SOURCE-ENTRY.md)
authorizes only deterministic tooling for the existing reviewed npm lock closure.
Branch `phase-11` starts from public Phase09
`9befe4dcd936fc7b399af0e77190bb0e9a94e47d`, tree
`0f18da509e79c01a81d280e67cec54d4fe39c923`. Phase07 is the other active lane.
Main and all prior phase history remain unchanged. This is partial P11-02 software
evidence, not full-task or Phase11 acceptance (0/10), signing or release authority.

Continuation began 2026-11-03 22:09 UTC with existing uncommitted implementation
preserved. The recovered baseline log reports PASS1802/1802 and
DESKTOP_SOURCE_CHECK_PASS; no original start time is invented for that earlier work.

## Delivered behavior

- `desktop/dependency-inventory.json` records all 80 resolved lock instances,
  including 57 optional entries across host platforms. Every entry has its exact
  lock path, derived npm name, version, registry artifact, sha512 integrity,
  declared license, development/optional flags and explicit OS/CPU constraints.
- Fixed format `FONESI_AUTO_NPM_LOCK_INVENTORY`, schema1, scope
  `DESKTOP_NPM_LOCK_RESOLUTION_ONLY`. Exact-byte SHA256 digests bind the current
  package manifest, lock and dependency review. Sorted declared requirements are
  ranges, not fabricated resolved graph edges. No machine paths or timestamps.
- The pure JSON projector enforces finite input/output/package bounds and rejects
  mismatched metadata, malformed paths/versions/integrities/licenses/origins/flags.
  The CLI accepts only `--json <reviewed-npm-version>` or
  `--check <reviewed-npm-version>` with no caller paths. It has no write, network,
  subprocess or application runtime consumer.
- Six fixed JSON inputs, including the existing verifier's three support inputs,
  are bounded/type-checked before existing `verify(false, npmVersion)` admission.
  The captured primary input bytes are projected only after admission succeeds.
  Input hashes do not claim to cover every existing admission dependency.
- Exact-byte check rejects missing, stale, BOM-prefixed, malformed UTF-8 and oversized
  inventory. Inherited admission checks are unchanged. This remains tooling for a
  fixed owned checkout, not protection against a malicious editor or concurrent
  hostile filesystem mutation.
- Source runner and build input manifest include the inventory checker/evidence;
  test inventory includes its focused file. Quality traversal increases only by
  the two new source/test files (555 to 557 entries, 440 to 442 source files).
  No application module, UI, IPC, package payload, dependency pin or permission changes.

From the repository root in the disposable Linux source environment:

```sh
env -u NODE_PATH node desktop/scripts/dependency-inventory.mjs --check 11.9.0
env -u NODE_PATH node desktop/scripts/dependency-inventory.mjs --json 11.9.0
env -u NODE_PATH node --test --test-reporter=tap desktop/tests/dependency-inventory.test.mjs
env -u NODE_PATH node desktop/scripts/check.mjs
```

`--json` prints to stdout; generation does not write the checked-in file. On the
reviewed Windows environment with no inherited NODE_PATH, omit the `env` prefix
and supply its reviewed npm version. Never enable another override to run checks.

## Actual validation and retained failures

Environment: disposable Linux x64, Node24.22.1, npm11.9.0, existing hash-admitted
dependencies. No install/lifecycle script or Electron/device runtime was executed.

| Check | Result |
|---|---|
| Focused final source tests | PASS44/44, zero fail/skipped/cancelled/todo |
| Fixed inventory checker | PASS, independently rerun by reviewer |
| First complete source aggregate | PASS1845/1845 before the final test/preflight additions |
| Final frozen source aggregate | PASS1846/1846 and DESKTOP_SOURCE_CHECK_PASS, exit0 |
| Whitespace | `git diff --check` PASS |
| Foundation/Python standalone | NOT_RUN in this continuation; prior evidence remains historical |
| Current local registry signatures/advisories | NOT_RUN in this continuation; local aggregate used existing installed dependencies |

The full source runner checks metadata/installed admission, exact inventory,
module graph, quality/format, strict product/demo types, product/demo builds,
build manifest and all fixed test batches. Hosted source CI separately performs
scripts-disabled restore plus registry signature and advisory checks.

Retained development failures: the initial recovered focused run was38/39 because
an overbroad static guard rejected literal npm lock paths; the corrected guard
checks runtime imports instead. A direct continuation run was40/43 because the
inherited NODE_PATH was correctly denied. The documented child-only override-free
invocation then exposed a formatting-sensitive test assertion (42/43); it was
corrected. New fixture callback names initially caused16 quality warnings and were
fixed without changing quality configuration. A first independent review found
unbounded verifier reads before CLI preflight; six fixed input checks and canary
regressions now prove oversized/directory inputs reject before verifier execution.
All earlier failures remain failures of their original bytes/environment.

## Independent review and exact source

Independent implementation re-review CLEAR at22:14 UTC after the preflight fix.
Reviewer reran the fixed checker and whitespace check; no remaining material
findings and no independent full-suite claim. Reviewed SHA256:

- Script: `496b99b11e0564abc5565a72aee9276c201f39668702323e0fe5cbd9e2abbdad`.
- Tests: `0e6831c1a5f16dcc33975ba64428a75508e72417d0c7e274dfb4b76df53d04ca`.
- Inventory: `07966026d10d570e62207d8e67bfe438e144fa752980237de3ec211f456c539f`.
- Workflow: `d3ef7e6b87ab8a663ec601eb41d05f309a972e0b298ea71d3ffb5fe769167bc3`.

Publication and exact-head hosted result remain PENDING at this preparation point.
The new workflow is restricted to phase-11, read-only, pinned checkout/Node actions,
Windows2022, 15-minute timeout, no credential persistence/cache/artifact publication.
It runs only the existing source checker and explicit unavailable-scope markers.

## Remaining gates

This is not CycloneDX/SPDX, installed-host or shipped-product inventory, complete
runtime/model SBOM, current vulnerability/signature attestation, legal/license
clearance, signed installer or release acceptance. Existing notices and actual
package admission remain separate. P11-01 signing/installer decisions and full
P11-02 bundled runtime/model/license coverage stay open. User Windows, physical
devices, installation/recovery/load/security acceptance and release are NOT_RUN;
P1-06 cross-user proof remains UNMET. No phase is accepted or merged.
