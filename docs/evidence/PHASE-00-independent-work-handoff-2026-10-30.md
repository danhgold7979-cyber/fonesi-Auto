# Phase 0 independent-work handoff — 2026-10-30

**21:49 UTC; documentation handoff, not Phase acceptance.** The authorized
independent feasibility slice is complete with reviewed evidence. Further Auto
production coding is **BLOCKED at Phase 0**; detailed tasks accepted **0/10**,
all 12 original exit criteria unaccepted. Phase 1–11 production work NOT_STARTED.
No main merge, approved-baseline change or new experiment is implied.

## Verified results and their limits

| Slice | Exact retained result | What it does not prove |
|---|---|---|
| [Collector](P0-01-hardening-checkpoint-2026-10-30.md) | Exact `f53c975` run41091019200: Windows PowerShell5.1,18/18 synthetic cases,489 assertions;0 handle growth over52 probes; six source hashes match | Target-host HC-09/HC-13 remain open; hosted Windows is not the target machine |
| [Offline selectors](P0-04-offline-selector-2026-10-30.md) + [policy artifact](P0-08-policy-review-2026-10-30.md) |28+14=42/42 Python tests; latest separate collector/offline run41131016077 on `ba32bf7` has all3 jobs SUCCESS (collector, Linux offline, Windows offline) | Synthetic selector candidates cannot authorize clicks. Disabled-only policy consistency is not platform permission |
| [Telemetry](P0-06-hosted-telemetry-2026-10-30.md) | Exact `0c3cc7d`, run41114623415:11/11 Python,7/7 PowerShell producer regressions; six real sampling groups/all cleanup true; eight AVAILABLE metrics | GPU45 means valid engine-counter instances, not45 GPUs or utilization. Decode/VRAM/temperature NOT_PROBED; no target load/driver/localization/overhead acceptance |
| [SQLite](P0-09-sqlite-source-lab-2026-10-30.md) | Exact `b942eae`, run41119112530:13/13 schema tests;13/13 actual cases each on Node24.22.1 and Electron45.1.0, SQLite3.53.4;43 statements each; all owned cleanup true | Candidate engine feasibility only; no production binding/schema/migration/backup decision |
| [Secret stages1–3](G0-13-secret-restart-lab-2026-10-30.md) | Exact `ba32bf7`, run41131016175:12/12 Python+5/5 Node tests; actual create8/8, orderly same-profile restart8/8, tail-tamper10/10; all cleanup true | Nine false rotation hints are observations, not a rotation test. Missing/corrupt profile, OS-key revocation, cross-user/machine and production backup NOT_TESTED. Normal OS-managed DPAPI access is not confined to app directories |
| [Desktop navigation](G0-12-hosted-stack-lab-2026-10-30.md) | Exact `1994937`, run41113076545: source20/21, package20/21, **FAIL**; navigation denial and unchanged-document subconditions false in both; cleanup true | Neither privilege escape nor complete post-navigation containment was established. Do not rerun unchanged or call20/21 PASS |

Dated evidence pages retain exact full heads, artifacts, hashes and review limits.
Retained samples use LF; original downloaded hashes are recorded separately, not
claimed byte-identical. Reviewed retained samples contain no raw credentials, ciphertext, device identities
or private host/user paths. These are prior verified results, not tests rerun for this handoff.
Collector and prior lab source remain unchanged.

## Minimum next evidence / decisions

1. **Target-host owner/operator:** run the exact hardened collector for HC-13 and
   supply sanitized source-linked output. Historical report predates hardened
   `f53c975`; it cannot certify the current collector. Complete HC-09 read-only
   optional-feature/boot/accelerator evidence with required permission. Partial
   HypervisorPresent=true alongside contradictory CPU flags is not reconciled
   acceleration proof; actual emulator acceleration evidence is missing. No
   security/boot setting changes are authorized by this handoff.
2. **Authorized device lab:** two physical-device isolation plus approved AVD
   repeatability; real ADB+UI Automator+Vision smoke, selector action/read-back and
   dump-versus-instrumentation evidence. Resolve recorded scrcpy video failure;
   measure video-only/resource behavior. Existing reversible brightness evidence
   and hosted checks do not substitute for these gates.
3. **Vision/host testing:** labeled Vietnamese/English OCR accuracy, latency,
   memory/package and real physical pipeline; target-host telemetry/load/stream
   envelope and missing-counter behavior. Do not invent thresholds or support.
4. **Policy owner/reviewer:** obtain accessible current official terms and dated
   per-capability permission determination. Current Terms/collection terms were
   login/block-page unavailable; spam policy returned429. Historical newsroom
   sources are not current contractual clearance. Keep unsupported capabilities
   disabled; ownership/ADB/manual UI access is not automation authorization.
5. **Security/product decision owner:** retain ADR-0005 optionA blocker, or approve
   further separately scoped design review with explicit contract/UX consequences.
   No version swap, native fork or requirement weakening is implicit. Any later
   implementation needs an approved proof/test contract before code.
6. **Phase acceptance owner:** reconcile all original exits, dependent ADR/support
   and recovery decisions in P0-09/P0-10; only explicit acceptance and required
   merge/next-phase approval can open Phase1. No remaining independent experiment
   is authorized by this handoff merely to keep activity running.

## PROPOSED appendix — intent-only renderer candidate, not an amendment

[ADR-0005](../decisions/ADR-0005-renderer-navigation-containment-PROPOSED.md)
optionB remains BLOCKED: a monotonic main latch proves denial after observed
revocation only, not all document transitions or pre-observation races; frame/URL
identity is not originating-Document identity. Original20/21 failures remain.

A different candidate (C, research label only) treats **every renderer as
untrusted from inception**. It may submit bounded inert drafts, never approve,
execute or consume privileged authority. Only independently trusted main approval
of immutable plans and autonomous scheduler admission could create/consume exact
occurrence authority. This could avoid Document-token dependence for that narrow
admission property, not solve old navigation immutability.

Proof must cover unique occurrence/attempt identity, exact target/content/resource
snapshot, time/count/order, live approval revision/revocation, leases/fencing and
durable one-way admission/UNKNOWN reconciliation. Mere set membership in approved
actions permits duplicate or early execution and is insufficient. Mutable media
references, edits during approval, queued revocation, cancellation/retry/undo,
restore and cleanup must not mint replacement authority or replay effects.

The [exact Electron main-process dialog API](https://raw.githubusercontent.com/electron/electron/v45.1.0/docs/api/dialog.md)
offers native options/results, not secure attention or proof of authentic human
consent. A candidate must default/cancel to denial and bind confirmation across
awaits to one immutable revision. Same-user OS attackers are not defeated by this
mechanism. Keep isolation/sandbox/resource/sender restrictions; confidentiality,
read/export and display declassification require separate design.

Initial bounded schedule approval may preserve C-03 unattended execution; routine
per-job prompts would not. Interactive wall taps/Home/Back, APK/proxy mutation and
calendar controls cannot silently retain privileged renderer paths. An approved
interactive session allowing arbitrary next commands restores broad authority.
Independent per-command authority or disabled features would require explicit
product/V9 review, not a silent layout or workflow waiver.

UI loss may coexist with already approved scheduled effects. Choose explicitly
between continued approved work and safe pause after observed loss; neither can
promise pre-observation cancellation or retroactively undo an external effect.
Required future evidence includes same-window post-navigation arbitrary IPC,
asset substitution, concurrent approval edits, duplicate/early/stale replay,
revoked queued work and UNKNOWN/restore quarantine through a real centralized
synthetic sink. **No such experiment, security amendment or production code is
approved here.** Independent source/design review found the candidate conditional,
not a resolved C-05/V9-compatible architecture. Full gates remain BLOCKED.

## Handoff checks

21:51 UTC: documentation-only checks PASS (45 local links across both changed
documents, whitespace/diff, unchanged source/tests/workflows). Independent
read-only review CLEAR: summarized evidence cross-checked; all12 original exit
checkboxes remain unchecked; proposed-only security/UX limits retained.
No Windows/device/lab rerun for this handoff; prior evidence above retains its scope.
