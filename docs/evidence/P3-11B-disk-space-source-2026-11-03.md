# P3-11.B bounded disk-space source evidence

Session began 2026-11-03 22:33 UTC. Repository `danhgold7979-cyber/fonesi-Auto`,
branch `phase-03`, exact predecessor `3b2ed1746cea2ff111d251d1c2699b420ce53d2b`,
tree `c9c6ddab68d85aa3d78c59c2269640d5e21c1870`. Existing history/main preserved.
[Entry](../phases/P3-DISK-SPACE-SOURCE-ENTRY.md) independently CLEAR at 22:36 UTC;
final source/privacy review CLEAR after the deadline correction below. Local
implementation/verification checkpoint ended 22:48 UTC, 15 minutes after the
observed session start; publication/hosted verification continues separately.

## Delivered bounded behavior

The existing explicit CPU/RAM read now samples available/total bytes on the volume
of the already-opened main-owned application data directory. Main supplies only
`persistence.root` after its existing lease guard, rechecks ownership at publication,
and supplies null when persistence is absent. The worker checks directory identity,
uses BigInt statfs products and publishes no private path, drive label or raw error.
Zero available is a real value. Missing ownership, failed probes and invalid counters
remain null with distinct fixed reasons, preserving independently valid CPU/RAM.

The bundled host wire is deliberately v2; strict request/response/sample validation
rejects obsolete/mixed versions, extra selectors and invalid metric pairs. Fixed
SAMPLE/CANCEL, one worker, admission-relative deadline, actual exit retirement and
conservative captured freshness remain. Main's existing synchronous ownership reads
are not claimed hard-latency bounded; late results cannot gain fresh lifetime.
The V9 performance slot labels APP_DATA_VOLUME, retains original sample times,
removes the duplicate free-space placeholder, and explicitly leaves disk I/O
UNAVAILABLE. No monitoring loop, stream control, disk enumeration/reservation,
new dependency, device effect, secret collection or binary release was added.

## Local verification

Environment: disposable Linux x64, Node 24.22.1, npm 11.9.0. Inherited NODE_PATH is
removed for each approved tool invocation only; no host/global setting was changed.

- Baseline `env -u NODE_PATH node desktop/scripts/check.mjs --restore`: PASS
  **1887/1887**, DESKTOP_SOURCE_CHECK_PASS. Scripts-disabled restore and the runner's
  signature/provenance/advisory, quality, strict, graph, build and manifest gates ran.
- `env -u NODE_PATH node --test --test-reporter=tap desktop/tests/host-resource.test.mjs`:
  final focused **26/26 PASS**, zero fail/cancel/skip/todo. Includes genuine zero,
  invalid/overflow BigInt, actual test-owned filesystem read, absent/file/symlink,
  v1/mixed/path rejection, fixed worker binding, privacy, owner loss, delayed
  admission/final fences, cancellation and actual retirement. CLI misuse fails
  before creating a test directory. Linux filesystem observation is not Windows proof.
- Actual renderer/UiShell focused suites: **86/86 PASS**, zero fail/cancel/skip/todo,
  including five new renderer cases for disk zero/null/reasons, source/scope,
  original timestamps, stale arrival/expiry, repeated Read, cancel/close/reopen,
  late response rejection and unmount. Strict TypeScript and scoped quality PASS.
- First aggregate stopped at batch 13: **115/122 PASS, 7 FAIL** in the quality
  harness because the new qualifier file increased the finite walk from 563 to
  564 entries. The exact bound was raised from 565 to 566, retaining one owned
  directory/file fixture pair and explicit refusal at entry 567; no unlimited
  inventory or test suppression. Independent boundary review CLEAR and focused
  quality tests **13/13 PASS**. Final frozen rerun at 22:48 UTC:
  `env -u NODE_PATH node desktop/scripts/check.mjs`, **1903/1903 PASS**,
  DESKTOP_SOURCE_CHECK_PASS. Quality, strict/module, production build/manifest and
  all fixed test batches passed; reviewed core hashes unchanged.

Retained intermediate results: existing host 15 PASS before new cases; host 24 then 25
PASS during development; UI's first quality call rejected inherited NODE_PATH,
correct child-only invocation passed. New qualifier cleanup initially triggered
noUnsafeFinally; corrected without a suppression, quality 449 files PASS with 484
informational diagnostics (not claimed zero). Independent review found/reproduced
one deadline defect: a 2s ownership check scheduled worker termination at 5s. The fixed
sampler schedules only remaining budget; new test and independent 1/1 regression
prove first timer 1000ms and termination requested at admission + 3000ms, with lane
held until actual exit. No failures are reclassified as passing.

## Hosted verification contract and limits

The existing Phase02–03 source workflow now invokes `check-host-disk.mjs` only on
phase-03 after the aggregate. It verifies the production build manifest and uses
its exact bundled worker with a fixed test factory, in a fresh CI-owned directory.
Four scenarios: observed disk/total comparison, no owned root, missing directory,
and cancel/drain. Available bytes may change between reads; no false cross-read
free-space equality is required. Only fixed result markers leave the harness.
A 15s watchdog fails explicitly, owned cleanup is nonrecursive and actual retirement
is required. Windows Node 24.22.1/x64 only, no runtime pin changes.

Hosted exact-head result was pending at the publication-preparation checkpoint.
The later verified result is recorded below. It does not establish Electron worker
or actual production persistence ownership integration: `HOST_DISK_ELECTRON_RUNTIME_NOT_RUN` is explicit. No user computer or
phone is used. Existing native/video failures are separate and are not rerun here.

Equal-viewport Dark/Light screenshots: **NOT_RUN**. The existing owned
Invoke-Ui.ps1/Electron/persistence workflow was inspected; this environment lacks
PowerShell, the Electron executable and DISPLAY. No manual Electron launch,
no-sandbox fallback or visual-parity claim was made. Screenshots and Electron
runtime qualification remain open requirements, not silently waived.

## Criterion disposition

Partial disk-space implementation, not whole P3-11.B or P3-11 acceptance. Independent
criterion review keeps the fixed B cell uncredited because no supported disk-I/O
adapter is implemented. The fixed 100-cell ledger remains N71/S5/I24: source 29/100,
integrated 24/100; task acceptance 0/19. No denominator changes, invented completion,
benchmark/capacity claim, P1-06 clearance or Phase/hardware/legal acceptance.


## Exact-head hosted closure observed 2026-11-03 22:58 UTC

Published non-force commit `2b5085939184ccd0b6c4088186f5993904572f3d`,
tree `eac36ebf3e3340206125cb85503ea6047315bc45`, sole parent
`3b2ed1746cea2ff111d251d1c2699b420ce53d2b`; public ref and clean local branch match.
[Windows source run 41734597404](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41734597404)
completed SUCCESS at 22:57:49 UTC, job 126260403841. Actual log: desktop
**1903/1903**, foundation **109/109**, Python **383/383**, production and synthetic
qualifier builds PASS. Windows 2022 image win22/20261026.347.1, Node 24.22.1,
npm 11.19.1 and Python 3.12.10 were observed, not assumed equivalent to local Linux.

Actual bundled-worker scenarios **4/4 PASS** at 22:56:14–16 UTC: owned directory
available/total read, absent root, missing root and cancel/drain. Final owned
directory retirement PASS. `HOST_DISK_ELECTRON_RUNTIME_NOT_RUN`,
`DEVICE_HARDWARE_NOT_RUN` and `P106_CROSS_USER_UNMET_NOT_RERUN` remain explicit;
all optional native/device/runtime jobs were skipped rather than credited.

Separate [legacy PR desktop-stack run 41734605727](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41734605727)
failed at its bounded launch with RUNTIME_OR_CONTAINMENT_FAILED, runtime exit 1,
installer/runtime cleanup true. It checked synthetic merge
`1aea9bbd17b758229191c8e0c0bbf47fdd2550fc`, not the source job's exact commit.
No legacy repair/rerun occurred and no all-checks-green claim is made. Collector,
SQLite, telemetry and secret legacy runs succeeded. This closure is batched with
later meaningful source work, not published as a separate status-only change.
