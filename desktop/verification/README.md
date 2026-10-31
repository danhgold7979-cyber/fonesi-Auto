# Runtime evidence contract (partial implementation)

This directory contains a strict parser, synthetic tests and the reviewed runtime
probe source. No Windows probe, supervisor or workflow has executed; runtime
remains **NOT_RUN**.
Run without writing bytecode:

```sh
PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s desktop/verification -p 'test_*.py' -v
```

`validate_runtime.validate(bytes)` rejects duplicate keys before normalization,
unknown fields, unknown or missing named cases, non-Boolean case/observation
values, wrong mode/version, nonfinite numbers and contradictory process status.
It returns a derived `passed` Boolean separately from shape validity. False cases,
timeout, nonzero exit, truncated streams or unverified cleanup never pass. An
`orderly_quit` case is independent of native Job retirement: successful forced
retirement cannot establish orderly application shutdown. This parser cannot
prove the producer observed any fact; the future reviewed probe must supply that
evidence. The old navigation result is always `FAIL_RETAINED`, not replaced by the
new no-authority observations.

The 20 named cases describe the proposed source/package smoke boundary. The four
transition observations are facts, not all-true acceptance requirements. Runtime
failure before a complete result must not manufacture this document; the future
supervisor needs separately reviewed fixed failure evidence. This is not yet a
complete installer/directory-cleanup/crash-negative report contract or upload CLI.

Version provenance is actual prior Electron execution, not a host-Node assumption:
[G0-12 retained evidence](../../docs/evidence/G0-12-hosted-stack-lab-2026-10-30.md)
records run [41107363359](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41107363359),
job 124240617390, with Electron 45.1.0, Chromium 156.0.8078.49 and embedded
Node 24.22.1. New source/package launches must measure these again.

The parser accepts at most 65,536 UTF-8 bytes. `read_bounded` reads at most 65,537
bytes before validation; its caller must first select a trusted owned regular file
(no symlink/reparse), and must not open a FIFO/device. No general filesystem-safe
reader, signature/authenticity guarantee, peak-memory guarantee or hostile local
editor isolation is claimed. All output fields are fixed codes, versions, bounded integer schema/exit values and
Booleans; no raw input/errors/paths/URLs are returned on invalid input.

Local checkpoint on 2026-10-31: **16/16 synthetic parser tests PASS**. Tests cover
otherwise valid documents with duplicate root/case/cleanup fields (including
false-to-true masking), native signed-Int32 exit bounds, and null-only exit codes
for timeout/launch/access-denied outcomes. This count is not Windows evidence.

Independent read-only review CLEAR at 02:43 UTC on 2026-10-31: 16/16 tests
rerun PASS; raw duplicate/status/privacy boundaries verified. No runtime executed.

## Probe implementation in progress — not executed

`runtime-probe.cjs` is a test-only entry that requires the unchanged verified
`build/main.cjs`, observes its actual first window, and later requests ordinary
`app.quit()`. It does not add a preload, bridge, dispatcher, or replacement main.
A separate native-window close/reopen exercise uses the real compiled lifecycle
and policy modules while the application's original window remains open. This is
module/native integration evidence, not a claim that product multi-window UX is
implemented. Instrumented package entry and executable-byte identity still require
the upcoming reviewed supervisor; neither is currently executed.

The probe measures effective WebPreferences, not an OS sandbox token. The pinned
internal `getLastWebPreferences` binding exists in exact Electron 45.1.0
[source](https://github.com/electron/electron/blob/v45.1.0/shell/browser/api/electron_api_web_contents.cc#L5440-L5442),
returning its stored last preferences at lines 4480–4485. It is absent from the
public TypeScript declarations, so this is a version-specific test dependency,
not a production API/support promise. Renderer no-Node/name checks supplement,
not replace, complete source/bundle no-IPC/preload audits.

Network negatives keep the real webRequest policy installed, use an offline
owned-session safety envelope, and require the specific observed
`ERR_BLOCKED_BY_CLIENT` failure; ordinary offline/CSP errors cannot pass.
Original-window document.open, reload and about:blank each have separate Boolean
observations. No navigation prevention, document identity, replay recovery or old
gate success is inferred. Initial probe syntax checks pass; every actual runtime
case remains **NOT_RUN** until the complete execution envelope is reviewed.

Probe-only independent source review CLEAR at 02:48 UTC on 2026-10-31: syntax,
exact 20-case schema agreement and diff checks PASS. Both navigation-denial event
paths are observed without changing the policy; the isolated-world check requires
a successful positive control. Supervisor, package integrity and negative-failure
evidence remain pending review. No Electron execution occurred.
