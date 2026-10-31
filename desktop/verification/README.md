# Runtime evidence contract and hosted results

This directory contains a strict parser, synthetic tests and the reviewed runtime
probe source. Historical CI6 reported 19/20; CI7 passed corrected zero-bridge
source/package 20/20. The current ADR-0006 public bridge changes the required set
to 25 cases and passed both modes on Windows run 41168294925. Earlier NOT_RUN sections below
describe their historical pre-execution checkpoints.
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

The original 20 named cases described the zero-bridge smoke boundary; current
public-bridge verification requires its explicitly revised 25 named cases. The four
transition observations are facts, not all-true acceptance requirements. Runtime
failure before a complete result must not manufacture this document; the future
supervisor needs separately reviewed fixed failure evidence. This was the initial validator-only checkpoint. The later `validate_hosted.py`
adds the installer/directory-cleanup/crash-negative contract and exclusive-output
CLI described below.

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

## Historical probe-only implementation checkpoint

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

## Historical pre-CI Windows execution-envelope review

The new `WindowsBoundary.psm1`, `OwnedFiles.psm1`, `Invoke-Foundation.ps1`,
`install-electron.mjs` and `crash-probe.cjs` are not yet approved for execution.
They reuse the unchanged suspended-start Job helper, with 120s installer / 30s
probe deadlines plus 10s cleanup and 32,768-character caps per stream. The wrapper
marks cleanup unconfirmed before every call; timeout, capture failure/truncation or
unverified retirement preserves owned trees. Process-local environment inheritance
is narrowed and restored in `finally`; machine/user settings are never changed.
No hostile concurrent filesystem-editor/race protection is claimed.

Before Add-Type, the frozen helper must hash to
`b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89`.
Before launch, the selected Node executable must be the setup-node tool-cache
24.22.1/x64 executable and hash to
`d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5`.
Provenance: official [Node 24.22.1 SHA256 list](https://nodejs.org/dist/v24.22.1/SHASUMS256.txt),
`win-x64/node.exe`, fetched directly on 2026-10-31 at 02:55 UTC (the browser fetch
was unavailable; bounded HTTPS fetch succeeded). This is the executable hash, not
an assumed archive hash or the host Node version.

The installer refuses preexisting dist/path.txt/cache, because Electron install.js
can otherwise skip archive verification. It verifies the exact locked metadata and
reviewed scripts plus current build input/output manifest before explicitly running
the official installer with bundled checksums. Unknown old outputs are preserved,
not deleted or blessed. The instrumented package copies every verified distribution
file with hash comparisons, preserves license notices, renames only its owned exe
without changing bytes, and loads the same main bundle through the test entry.
The crash negative uses actual render-process-gone cleanup; the tampered-asset
negative modifies only a verified owned build copy. Neither is runtime evidence yet.


## Initial runnable checkpoint and later local regressions — 2026-10-31

Current local source/build check: **36/36 PASS**, including the real bootstrap
failure-latch regression. Current Python schema/writer/checkout/diagnostic suite: **42/42 PASS**.
Node syntax checks and scoped workflow YAML parsing PASS. Nine PowerShell marker
regressions, official installer, source/package launches, renderer crash and
changed-asset negatives are **NOT_RUN** here. There is no local PowerShell 5.1 or
Electron execution claim.

`validate_hosted.py` checks outer and successful inner JSON duplicates before
normalization, exact output markers/order, all 20 named cases per mode, actual
versions/modes, integrity/ownership flags and both typed negatives. It strips raw
payloads from public output, including incomplete failure logs. It reads at most
65,537 bytes from a regular owned input, refuses existing output, writes a fixed
schema of at most 64 KiB exclusively, and only then emits its completion marker.
The workflow uploads exactly that invocation's sanitized output, not raw logs or
profiles; missing/invalid evidence fails without an upload marker. A valid failed
report remains failed and may be retained for diagnosis.

The original navigation result remains FAIL_RETAINED. Passing this hosted-only
boundary would not close full P1-02, manual/scheduled authority, V9/product UI,
Phase 0 host/device/policy evidence, or any full Phase acceptance.

Final independent CLI/workflow/documentation review CLEAR at 03:06 UTC on
2026-10-31: 33/33 Python tests, YAML and staged/unstaged diff checks PASS. The
report writer refuses an unverified/rejected parent and revalidates before writing.
No PowerShell/Electron execution occurred; hosted outcomes remain NOT_RUN.

Windows checkout correction: narrow LF attributes preserve the exact reference
JSON and asset hashes under core.autocrlf=true/core.eol=crlf. The new actual Git
checkout regression fails on the old policy and passes on the corrected policy.
No hash normalization or expected-hash replacement is used. First hosted attempt
stopped at metadata verification; later runtime stages remain unverified.

CI2 passed Windows source32/Python34/PowerShell9 but rejected the private raw
report before artifact upload. Fixed allowlisted validation stage diagnostics now
locate that rejection without echoing payloads or relaxing any predicate. Actual
runtime/cleanup outcomes are not inferred from the supervisor step exit status.

CI3 localized rejection to source stdout shape plus directory cleanup failure.
Bounded fixed marker counts/order and exact allowlisted cleanup categories are
added without changing acceptance or bounds. Fifteen PS regression fixtures are
now present; only the original nine have run on Windows so far. Private raw lines
remain excluded, and a cleanup failure no longer overwrites an earlier failure.

CI4 proved cleanup hit the unchanged entry-count cap while retaining multiple
completed profiles. Fixed owned parts are now disposed incrementally after their
verified Job/capture and evidence measurement; package only after all uses. The
final root accepts only its marker, never a recursive fallback over rejected parts.
No resource cap increased. Twenty-five PS fixtures are present; fifteen ran before
this fix, ten new ownership/bounds fixtures remain NOT_RUN. First stdout OTHER is
further classified as empty/whitespace/unknown, but still rejected until identified.

Observed CI5 transport correction, approved 03:35 UTC: permit zero or one exact
leading empty line after CRLF normalization, then require the same exact READY,
CLOSED, RESULT sequence and strict inner schema. Nonempty/whitespace-only, repeated,
interleaved or extra trailing lines still fail. No generic whitespace filtering or
runtime/cleanup/security predicate changes; the empty line origin is not asserted.

CI6 finally produced strict sanitized failure evidence: source/package each 19/20,
only secure_preferences false; all negative/process/directory cleanup conditions
true. Exact Electron source proves saved preferences omit devTools and preload.
Corrected measurements combine audited explicit configuration with bounded actual
DevTools open-denial observation and supported empty session preload inventory.
They do not infer false/absence from omitted keys, do not add a preload, and do not
claim OS-token or unbounded future behavior proof. Four pure/source regressions
bring source/build tests to 36/36; corrected runtime measurements remain NOT_RUN.

## Current hosted result — 2026-10-31 03:58 UTC

CI7 at exact head `85c190ea5ea969955d48afa3776c0c3dc3fcfa13` passed source/build
36/36, Python 42/42 and PowerShell 25/25, then source/package 20/20 each. Crash
and tamper negatives, all process retirement and owned-directory cleanup passed.
Earlier nine/fifteen-case and NOT_RUN notes above describe historical checkpoints.
[Full evidence](../../docs/evidence/P1-02-windows-envelope-source-2026-10-31.md)
retains every failed attempt and the original navigation FAIL. This is instrumented
hosted bootstrap evidence only, not full P1-02, V9, service or target-host acceptance.

## Public bridge contract revision — pending hosted execution

The ADR-0006 application now owns one manifest-bound sandboxed preload. Current
runtime schema requires 25 exact cases, including public health/settings and actual
handler denials; historical CI7's zero-preload/zero-bridge case set is not accepted
as this revision. Source/build 50 and Python 43 tests pass; adapted source/package runtime 25/25 PASS on run 41168294925.
[Source/evidence and instrumentation limits](../../docs/evidence/P1-02-public-bridge-source-2026-10-31.md).

## P1-04 envelope revision (2026-10-31)

Current source/package schema requires 29 exact cases, plus six degraded-app cases,
ten fixed store-fixture modes and 30 PowerShell ownership regressions. Python 46 and
five bounded scanner regressions passed locally; actual Windows execution is pending.
Application log/crash artifact bytes and IDs remain private. Only fixed booleans,
counts, process outcomes and existing exact versions may enter the sanitized report.
The renderer crash is seeded with a synthetic canary; any detected leak fails,
retains fixed detection evidence and never authorizes raw upload. Retired owned
raw profile/log subtrees may be deleted by the bounded cleanup; this is not a
raw-dump preservation guarantee. Prior 20/25-case historical
runs remain as dated evidence, not retroactive P1-04 verification. See
[current source evidence](../../docs/evidence/P1-04-logging-source-2026-10-31.md).

Hosted follow-through: run 41178227952 on exact `fcb1366b` passed this revision's
133 desktop / 109 foundation / 46 Python / 30 PowerShell checks and all 29×2 runtime,
six degraded-app and ten store-mode predicates. All cleanup passed. Native crash
artifact counts were 0, so no general dump-confidentiality claim follows. The
NOT_RUN paragraph above is historical to the source-review checkpoint; consult
current source evidence for the exact retained JSON/hash and acceptance limits.

## P1-05 production-launcher and persistence matrix

`Invoke-Persistence.ps1` now prepares strict version 3 evidence for source/package
key recovery, actual main readiness, COMMIT crash recovery, typed SQLite contention,
maintenance/retention and copied-profile restore. Each dependent stage follows
verified process retirement; private captures are never uploaded. Historical v1/v2
reports retain their original narrower meanings.

`Invoke-PersistenceLauncherE2E.ps1` runs an exclusive, four-substitution audited
copy of the real developer launcher for first creation and same-root reopen.
Dialog answers and quit-after-READY are verification instrumentation, not genuine
native widget clicks. Its outer deadline applies only to the test. Production
interactive lifetime remains unbounded. The separate launcher report requires
strict validation and a fresh output marker before upload. These new native paths
are NOT_RUN until exact-head hosted execution; see
[P1-05 evidence](../../docs/evidence/P1-05-persistence-source-2026-10-31.md).

## P1-08 complete V9 interface (first native PASS; visual corrections pending)

`Invoke-Ui.ps1` is the separate owned Windows source/package/reference verification
entry. It never invokes the unresolved P1-06 cross-user helper. Production loads the
actual main/preload/React/CSS and existing admitted preferences; the unchanged V9 HTML
runs only in an isolated exact-hash reference session. Reference demo data are not
production data. No file-picker/download/external reference effects are exercised.

`validate_ui.py` validates fixed results and binds the exact32 PNG inventory, dimensions
and hashes (4MiB each/64MiB total). `UI_VALIDATION_WRITTEN` permits fixed JSON upload;
`UI_SCREENSHOTS_BOUND` separately permits the complete image set. Raw captures/profiles,
private paths and arbitrary partial PNGs are never publication inputs. The owned
`.ui-runtime` is ignored. See [source/evidence](../../docs/evidence/P1-08-v9-ui-source-2026-10-31.md)
for current test counts and native/visual limitations; a complete capture is not by itself task acceptance.
