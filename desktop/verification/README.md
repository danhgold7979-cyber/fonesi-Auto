# Runtime evidence contract (partial implementation)

This directory currently contains only a strict parser and synthetic tests. No
Windows probe, supervisor or workflow has executed; runtime remains **NOT_RUN**.
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
