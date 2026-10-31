# Provisional source-development exception 01 — Phase 1 subsets

**2026-10-31 01:18 UTC proposal; scoped approval recorded01:23 UTC below.**
Original draft authorized preparation only; the appended scoped approval governs execution.
This is a cross-phase source-development exception proposal, not Phase0 acceptance,
Phase1 opening, a security amendment or permission to activate services.

## 1. Authority, evidence and unchanged gates

New user direction in the same conversation:
> Rồi thực hiện code tiếp cho hoàn thiện đi. Mỗi 10s chạy kèm theo time hiện tại để t biết m có chạy ko nha.
> Auto thiếu gì nữa mà bị chặn chưa code
> rồi lệnh powshell chạy thu thập những cái m cần đi, để t chạy tạo thành zip gửi m cho m nắm rồi chuyển qua phase 1 code

Coordinator authorized preparing this narrow proposal, not code. The requested
host ZIP is still awaited; collection does not automatically accept Phase0.
The existing sequential rules remain default. Only a separately recorded explicit
approval of this exact exception can supersede their source-development entry
restriction for the listed subsets, never their acceptance/activation requirements.

**Historical branch instruction, superseded by the 01:47 UTC branch separation
update below:** the initial proposal kept `phase/00-feasibility` without branch
creation. Current provisional source belongs on `phase-01`; legacy history is
frozen. No main merge or release is authorized.
Reviewed proposal base: `6db312a4a201d694fe541fdbc4b66f854e6b7ac4`.
Original `PHASE-00-feasibility.md` SHA256:
`3882e2112129fdc0dcdc69104195cc95d8f90c933a210c9002cd16642873316c`.
Preserve its bytes, all12 unchecked exits,0/10 accepted tasks, physical evidence
and required acceptance report. Phase1 complete-task statuses stay NOT_STARTED
until explicitly tracked as partial provisional source; never mark a full task
PASS from subset tests. Original desktop source/package20/21 navigation **FAIL**,
ADR-0005 B BLOCKED and C unapproved remain unchanged. C-03, C-05 and full V9/manual
control requirements remain intact. No old experiment needs another run.

## 2. Exact permitted subsets, in order after approval

| Subset | Source deliverable | Explicitly not complete |
|---|---|---|
| P1-01-S | Clean independently designed package/module map, lock/dependency inventory, import rules and reproducible owned bootstrap | Full P1-01 target-Windows/support/architecture acceptance |
| P1-03-S | Strict compiler, Node built-in unit harness, import-boundary and limited source-hygiene checks with intentional failure fixtures | General-purpose lint/formatter selection, full Windows development-host evidence and full P1-03 acceptance |
| P1-11-S | Pure bounded status/error-envelope validators and rejection fixtures; no transport/privileged service | Full domain/entity schema, device/account identity/fencing, persistence and IPC security approval |

Finish each subset's tests/review/checkpoint before the next. No other P1 task is
included. Documentation may reserve future responsibilities, but no speculative
business schema, Electron app skeleton, V9 renderer integration or demo application.

### Intended paths and import direction

- `foundation/README.md`, `package.json`, lockfile, strict compiler configuration:
  private provisional workspace, no production entry point or distribution artifact.
- `foundation/src/contracts/`: types, fixed vocabulary and pure validators only.
  Production-source dependency direction is consumer -> contracts; contracts import
  only other pure contract modules, never tooling, tests or platform packages.
- `foundation/tests/`: positive/negative fixtures; fixtures cannot be imported by
  source. Node test APIs belong here only.
- `foundation/scripts/`: owned development checks/bootstrap diagnostics only. No
  production service exports; cannot be imported by contracts.
- `foundation/build/` and owned test outputs: generated/ignored; reject any cleanup
  target outside explicitly owned outputs. Do not touch existing caches/lab source.

Source cannot import Node builtins, Electron, filesystem/network/process modules,
DB/vault adapters, arbitrary package paths or dynamic module loaders. The check
must fail closed on unsupported import forms; include re-export, dynamic import,
require and path-traversal negatives, not just a reassuring regex demonstration.
Global runtime escape/process/network references are forbidden too. This is a
source hygiene/boundary control, not a sandbox or proof against hostile native code.
Tests/tooling may read/write owned repository outputs and invoke reviewed compiler/
test tools; that exception does not expose such authority to production source.

### Validator contract to review before implementation

Input: already-parsed unknown JavaScript value; no IPC transport or JSON parser.
Accept only a non-array record whose prototype is exactly Object.prototype
(null-prototype records are rejected), with exact own keys and data properties; reject
accessors, symbols, extra keys, exotic prototypes and malformed fields. Do not invoke
getters while inspecting shape. Proxies/arbitrary same-process hostile JavaScript
are not a claimed security boundary; actual wire parsing stays out of scope.
Bounds describe accepted field/shape sizes, not a peak-resource guarantee for
arbitrarily huge already-parsed objects or proxy traps.

Provisional envelope v1: exact `version: 1`, `status: 'UNAVAILABLE'`,
`reason: 'NOT_IMPLEMENTED' | 'DEPENDENCY_BLOCKED' | 'UNSUPPORTED'`, and fixed bounded
`correlationId` (ASCII letters/digits/underscore/hyphen,1..64 characters). No free-text
error, paths, device/account identifiers, payload, result, success state or executable operation.
The correlationId is an identifier: format validation is not sanitization and cannot
detect embedded secrets/PII. Even accepted values are not automatically safe to log
or publish; validation results remain fixed-code/no echo.
A separate pure validation result uses fixed codes only (valid or invalid shape/
field/version); never echo rejected values or serialize arbitrary exceptions.
These are reviewable developmental limits, not accepted transport capacity limits.
Every envelope remains unavailable: no flag can enable an adapter or capability.

## 3. Candidate tooling and provenance

Use only the already reviewed candidate versions needed here:
- Node **24.22.1**, built-in `node:test`/assert; no new unit-test library.
- TypeScript **7.0.2**, Apache-2.0 label.
- `@types/node` **24.19.2**, MIT label, tooling/tests only; source compiler scope must
  exclude Node ambient types. Any required transitive/optional compiler packages
  must match reviewed origin/version/integrity entries, not float to latest.

Provenance: [existing exact lock](../../tools/phase-00/desktop-stack-lab/package-lock.json),
[dependency review](../../tools/phase-00/desktop-stack-lab/dependency-review.json),
[dated official-source record](../../tools/phase-00/desktop-stack-lab/README.md),
[actual hosted candidate evidence](../evidence/G0-12-hosted-stack-lab-2026-10-30.md).
Official registry URLs/integrities and license labels are retained there; this
proposal does not claim newest versions or production support. No Electron, React,
esbuild, DB or secret packages are needed for this subset. Do not import lab app
source or modify its lock. Review a minimal new lock closure against existing
verified metadata before executing any package script. Restore with lifecycle
scripts disabled and fixed trusted registry; unexpected resolution/install hook
blocks setup rather than triggering an unreviewed download. Record actual npm
version (prior local11.9.0/hosted11.19.1 are observed tools, not interchangeable
reproducibility claims); chosen lock writer must be recorded at implementation.

No existing reviewed general-purpose linter/formatter pin was found. Do not guess
one. Strict compilation, import restrictions and explicitly named whitespace/format
hygiene checks are a limited subset, not ESLint/formatter equivalence. Adding either
requires a separate source/license/version review and scope update. No automatic
installation/global SDK or target-host runtime change is authorized here.

## 4. Test contract and evidence

- Clean owned checkout/restore with exact candidate version checks and reviewed lock
  closure; wrong/missing runtime or mismatched lock fails nonzero without fallback.
- Strict compile passes valid source; intentionally unsafe type and unused-symbol
  fixtures fail as expected. Source compiler has no Node/DOM capability globals.
- Boundary positives permit pure imports; forbidden builtins/platform/test/tooling,
  cycles, traversal/re-export/dynamic-loader cases fail. Actual detector limitations
  must be recorded; unsupported syntax cannot silently pass.
- Deterministic unit positives cover every fixed reason; negatives cover null,
  arrays, exotic prototypes/accessors/extra keys, wrong types/version, unsupported
  status/reason, empty/oversized/non-ASCII correlation, and secret/path canaries.
  Inputs remain unmodified and invalid results reveal no input values.
- Harness intentional failing assertion returns nonzero; skipped tests not counted
  as passing. Repeat runs produce no shared-state leakage. No fixtures in source.
- Tests/typecheck/check command exit codes must be asserted, not merely printed.
  Independent source/scope review, diff/links and original Phase0 hash/checklist
  comparison before publication. Record exact commands/versions/SHA/counts.

Local/hosted source tests prove only these subsets. No Electron/runtime packaging,
Windows compatibility, actual IPC, target-host, device, OCR, policy, vault, backup,
V9 parity or activation result is inferred. Root coordinates publication; no new
hosted workflow is included unless separately reviewed. User-requested progress
messages must report real work/time and cannot replace evidence.

## 5. Rework, rollback, activation and approval

Provisional source may need changes after target-host evidence, security decisions,
reviewed wire contracts or production toolchain selection. No stable API promise,
production schema commitment or Phase acceptance is created. Roll back only this
workspace/config/docs delta and explicitly owned generated outputs; preserve all
historical evidence, user files and existing caches. Unknown dependencies stop the
subset and return for review, not another unapproved experiment.

Before activation or full Phase1 acceptance, satisfy the original Phase0 exits,
explicit acceptance/merge and full Phase1 approval, plus unresolved navigation/IPC,
backup/recovery and host decisions. No production services, Electron launch/preload/
IPC bridge, runtime filesystem settings, DB/vault, child-process service, devices,
accounts or external effects are included. C-03 unattended behavior and V9 manual
controls are neither implemented nor waived by an unavailable-only source subset.

**Implementation entry point:** coordinator explicitly approves this document and
records scope/time/base in the decision register/playbook first. Then implement
P1-01-S only, beginning with the module map and minimal verified dependency closure;
review its checkpoint before P1-03-S and P1-11-S. A request to approve this proposal
is not an implementation grant. Current approval: **PENDING**.

## Documentation review — 2026-10-31 01:22 UTC

Independent read-only review CLEAR for coordinator approval consideration only.
Seven-document links/whitespace/diff checks PASS (74 local links); original baseline
SHA and all12 unchecked exits unchanged; source/tests/workflows untouched. Tooling
metadata matches existing reviewed lock records. No fresh runtime evidence or
implementation authority arises from documentation review. Approval remains PENDING.

## Scoped approval — 2026-10-31 01:23 UTC

Coordinator explicitly approved proposal commit `b7d0e1168e09e32830e0487a6356ae02259c2d49`
under the renewed user coding direction: exactly P1-01-S → P1-03-S → P1-11-S,
with parent review/approval of each next entry. **Current execution: P1-01-S only.**
Record module map/minimal verified dependency closure before harness/validator work.
Normal owned build/test tooling is permitted; no new hosted workflow or runtime
service. Branch remains phase/00-feasibility. This is provisional source authority,
not opening/accepting full Phase1, Phase0 acceptance, main merge or activation.
All exclusions, original baseline/12 exits, navigation FAIL, ADR B/C limitations
and C-03/C-05/V9 requirements remain unchanged. Root coordinates publication.

## P1-03-S entry — 2026-10-31 01:39 UTC

Root approved this next subset after reviewed P1-01-S publication remote5eb71d6,
tree5efb770c527ebb5a94abd14f1e6661d6b2a646f1. Implement strict compilation,
Node built-in harness, fail-closed limited import/source checks and explicitly
limited hygiene, with real negative exit-code fixtures. No full linter/formatter,
new dependency/runtime/CI workflow or other subset. P1-11-S still awaits next-entry
approval. User paused other repositories; this agent remains exclusively in Auto.
Original Phase0 baseline/12 exits/navigation FAIL and all activation gates retained.

## Branch separation update — 2026-10-31 01:47 UTC

Latest user direction requires one branch per Phase. Coordinator moved local work
to `phase-01` at `cabbb05`, preserving reviewed/dirty P1-03-S files. This supersedes
the earlier keep-phase/00-feasibility branch instruction only, not scope/security
or acceptance rules. Canonical convention: phase-00/phase-01/phase-NN; coordinator verified phase-00 at `4d06c2fbf67f8ce36a05b695f90f493623e56e87`
and phase-01 at `5eb71d68c0ea839ab00107030307b11717ebb1c6`. Legacy
phase/00-feasibility is a frozen historical transition branch retaining P1-01-S,
not an active publication destination; no rewrite/deletion. Full Phase1 not opened/accepted; P1-11-S awaits next
entry approval. See living git workflow for publication verification status.
