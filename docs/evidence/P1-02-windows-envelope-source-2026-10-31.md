# Partial P1-02: Windows verification source checkpoint

Date: 2026-10-31. Branch: `phase-01`. Scope is the already approved
[authority-free bootstrap proposal](../phases/PHASE-01-P1-02-S-AUTHORITY-FREE-PROPOSAL.md),
not a new task or Phase acceptance. The original Phase 0 plan and twelve exits,
original navigation 20/21 FAIL and ADR-0005 authority blockers remain unchanged.

## Concrete implementation

- Actual-main test entry with zero added preload/bridge; twenty named cases each
  for source and instrumented package, including separate original-window
  document.open/reload/about:blank observations. It does not claim navigation
  prevention or OS-token sandbox measurement.
- Unchanged hash-pinned suspended-start NativeProbe Job helper; child executable,
  argument and process-environment restrictions, fixed deadlines/capture caps and
  preservation of uncertain trees. Official Node executable SHA256 is pinned from
  its exact release checksums; see [source provenance](../../desktop/verification/README.md).
- Explicit reviewed official Electron installer only after metadata/build checks;
  preexisting dist/path/cache are refused so its checksum path cannot be skipped.
- Bounded owned package copy with exact file hashes and unchanged renamed exe,
  actual bootstrap crash negative and owned changed-asset negative, independent
  orderly quit versus process exit/Job retirement/directory cleanup evidence.
- Duplicate-aware raw-to-fixed schema validation, exclusive current-run output,
  and a separate [phase-01 workflow](../../.github/workflows/phase-01-desktop-foundation.yml)
  uploading only the validated fixed-field report. Old lab workflows are unchanged.

## Local evidence and review

- Full source metadata/typecheck/build/manifest/tests: **32/32 PASS** after adding
  the real `window-all-closed` closing-latch guard and executable callback regression.
  This prevents failure cleanup from initiating ordinary quit; it does not weaken
  the crash-negative unexpected-quit requirement.
- Python schema and output-writer suite: **33/33 PASS**, zero skipped tests.
- Node syntax and YAML parsing PASS; no Electron import/installer/runtime execution.
- Nine PowerShell marker regressions: **NOT_RUN** locally. They preserve exactly-one
  required markers and any-occurrence forbidden markers, including duplicate negatives.
- Independent reviewer cleared probe, supervisor/crash source and raw-to-fixed schema
  in bounded increments. Final CLI/workflow/documentation review **CLEAR at
  03:06 UTC**: independent 33/33 Python tests, YAML and staged/unstaged diff checks
  PASS. The rejected-parent report-write path was fixed before publication; no
  PowerShell or Electron execution occurred during review.

All actual Windows installer/profile/runtime/cleanup behavior is **NOT_RUN** until
an exact-head hosted run. No accepted-task numerator changes; full P1-02 and all
original activation/acceptance gates remain open. A hosted PASS would establish
only this authority-free, instrumented runner boundary—not production package,
manual device control, trusted human intent, confidentiality of future services,
C-03 unattended workflows, V9 parity or target-host compatibility.

## First hosted attempt and checkout correction — 03:09 UTC

Exact remote head `c66e7be06ef3cb35dd4359b138ad7f5a26e0b7f6`, run
[41162981945](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41162981945),
job 124424387792 stopped at `METADATA_FAILED` before restore/installer/runtime.
Actual setup reported Node 24.22.1 and npm 11.19.1; later tests/probes were skipped.

A local real Git checkout with `core.autocrlf=true` reproduced CRLF conversion of
both byte-hashed reference JSON files and the fixed HTML asset. The converted lock
failed the existing exact SHA256 check. Narrow LF attributes preserve these bytes
instead of normalizing or relaxing verification; old lab blobs are unchanged.
An actual checkout-index regression forces CRLF configuration and now verifies all
three original hashes. Source **32/32 PASS**, Python **34/34 PASS** including this
regression. This fixes a demonstrated prerequisite blocker; hosted confirmation
is still pending, not a claim that later Windows stages passed.

Independent checkout-fix review CLEAR at 03:12 UTC: 34/34 Python tests, workflow
YAML and diff checks PASS; all three protected inputs remain byte-identical to
original Git blobs and recorded hashes. No runtime performed during this review.

## Second hosted attempt and bounded diagnostics — 03:17 UTC

Exact remote head `1da5791b969288a165b9c87b103ce5ced20118e3`, run
[41163410248](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41163410248),
job 124425713752: actual Windows source/build **32/32 PASS**, Python **34/34 PASS**,
and PowerShell marker **9/9 PASS**. Syntax passed. The supervisor wrote a private
raw record, but the validator returned `FOUNDATION_VALIDATION_INVALID`; no artifact
was authorized for upload. A successful supervisor step is not runtime acceptance.
Installer/runtime cases and cleanup remain unverified from this attempt.

No specific producer/consumer mismatch is established from that generic rejection.
The next diagnostic patch emits only fixed allowlisted IO/parse/schema/process/
stdout/output stage codes, plus a supervisor failure enum only after duplicate-aware
parse and exact type/allowlist validation. No private raw payload or exception text
is emitted, and no existing condition is relaxed. Three additional diagnostic
privacy regressions bring the local Python suite to **37/37 PASS**; this is a
meaningfully instrumented retry, not a blind rerun or an inferred runtime success.

Independent diagnostic-only review CLEAR at 03:18 UTC: 37/37 Python tests and
diff check PASS; fixed allowlists/privacy and unchanged rejection rules verified.
The underlying Windows rejection remains unproven pending the next actual result.
