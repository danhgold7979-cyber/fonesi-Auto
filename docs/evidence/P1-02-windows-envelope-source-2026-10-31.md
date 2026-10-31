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
