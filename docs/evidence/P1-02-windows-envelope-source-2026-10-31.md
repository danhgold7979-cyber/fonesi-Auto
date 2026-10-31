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

At this original source checkpoint, all actual Windows installer/profile/runtime/
cleanup behavior was **NOT_RUN**; later exact-head results are recorded below. No accepted-task numerator changes; full P1-02 and all
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

## Third hosted attempt: exact rejected boundaries — 03:23 UTC

Exact remote head `e0f93e72626b561c0c5730d8daeab92ab6159013`, run
[41163846066](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41163846066),
job 124427028546: source **32/32**, Python **37/37**, and PowerShell **9/9** passed.
The sanitizer rejected `RUN_SOURCE_LINES`; its already-validated supervisor failure
was `DIRECTORY_CLEANUP_FAILED`. No artifact was uploaded and runtime acceptance is
not established. No raw stdout/private path was exposed for diagnosis.

The next bounded diagnostic records only total/unknown line counts and the first
eight fixed marker classes, never line content. Cleanup emits exact allowlisted
bound/ownership codes or fixed exception-type/native-code categories; arbitrary
messages/spelling are not echoed. A preexisting primary failure is retained when
cleanup also fails. Exact stdout acceptance, process controls and all resource
bounds are unchanged. No speculative shutdown change is made.

Local Python **39/39 PASS**. PowerShell diagnostic fixtures total **15**, comprising
nine previously run fixtures plus six new fixtures that remain **NOT_RUN** until
hosted execution. These diagnostics must establish the cause before remediation;
neither duplicate shutdown nor aggregate entry overflow is claimed as proven.

Independent diagnostic review CLEAR at 03:24 UTC: 39/39 Python tests PASS;
fixed literal/exception classification and all fifteen PowerShell fixture sources
reviewed, with six new fixtures still NOT_RUN. No underlying cause claim or gate change.

## Fourth hosted attempt: confirmed accumulation boundary — 03:31 UTC

Exact remote head `49369099823ca83bb837245f88eba4a638dba576`, run
[41164320223](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41164320223),
job 124428467490: source **32/32**, Python **39/39**, PowerShell **15/15** passed.
Cleanup reported `OWNED_COUNT_EXCEEDED`. Source stdout had four lines in fixed
classes `OTHER, READY, CLOSED, RESULT`, with exactly one OTHER; no duplicate close
marker was observed. Its content remains undisclosed/unidentified. Artifact upload
was correctly denied; no runtime acceptance is established.

Coordinator approved incremental disposal at 03:28 UTC, not an aggregate-cap
increase. Each fixed owned profile is fully validated and retired after its own
verified Job/capture and retained evidence; the tampered build is retired after its
negative, and package only after all uses. The unchanged per-tree limits remain
256 entries/depth16/8 MiB for profiles/build and 512 MiB for runtime copy. Final root
cleanup is marker-only: it refuses any leftover/rejected part, never falls back to
a weaker aggregate deletion. Wrong owner/name/case/profile marker, unretired Job
and count/byte/depth failures must preserve the rejected fixture.

The stdout classifier now distinguishes EMPTY/WHITESPACE/OTHER, while unexpected
lines still fail exact framing. No blanket strip/filter or shutdown change was
made. Local Python **40/40 PASS**; PowerShell fixture count is **25** (fifteen already
run plus ten new ownership/bounds fixtures currently NOT_RUN). Actual timing-fix
and startup framing outcomes require the next hosted attempt.

Independent incremental-disposal review CLEAR at 03:32 UTC: 40/40 Python, YAML
and diff checks PASS; all twenty-five PowerShell fixture sources reviewed. Ten new
fixtures and actual disposal timing remain NOT_RUN locally. Limits and strict
unexpected-line rejection are unchanged.

## Fifth hosted attempt and observed framing correction — 03:36 UTC

Exact remote head `e9bf0baebf16f292b962061a891b5599ce0080fd`, run
[41164904968](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41164904968),
job 124430251921: source **32/32**, Python **40/40**, PowerShell ownership/marker
**25/25** passed. No cleanup failure or supervisor failure enum was emitted.
Sanitization still stopped at source lines, now classified exactly
`EMPTY, READY, CLOSED, RESULT`, with zero unknown lines. Full sanitized runtime and
cleanup proof remains pending; absence of a failure log alone is not acceptance.

At 03:35 UTC the coordinator approved this narrowly observed transport correction:
after CRLF-to-LF handling, accept zero or **one exact leading empty line**, followed
by the same three required markers in exact order and the complete strict JSON
contract. Whitespace-only, nonempty, repeated, interleaved and extra trailing lines
remain rejected. No generic strip/filter, case relaxation, runtime predicate,
process/cleanup bound or original security gate changes. The underlying origin of
the observed empty line is not asserted from an unproven upstream hypothesis.

Local Python **42/42 PASS**, including positive LF/CRLF cases and the restricted
negative framing matrix. PowerShell fixtures remain twenty-five. Hosted confirmation
of the corrected framing and complete runtime result remains pending.

Independent actual framing patch review CLEAR at 03:37 UTC: 42/42 Python tests
and diff check PASS; bare-CR/BOM and duplicate JSON with accepted prefix also reject.
No other acceptance or cleanup condition changed.

## Sixth hosted attempt: valid failed runtime evidence — 03:52 UTC

Exact remote head `1a802090f02e6ac46b4d4cd5521bda18cc5c57cc`, run
[41165225014](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41165225014),
job 124431225250 produced sanitized artifact 13029226716. ZIP SHA256:
`bd4c7aa03a6ee0ce6e4dbe93a8006652fecf72665b200d63b1dc8f7144e63b98` (970 bytes).
The retained JSON is 4,005 bytes, SHA256
`930b8a360ad3d23e9735acf4dfbd9871ec3dd1c386cd295f87790e7e24f2933d`.

Both source/package report **19/20**, with only `secure_preferences=false`.
Installer, build/binary/copy verification, every process/capture cleanup and final
directory cleanup are true; typed crash and changed-asset negatives are correct.
Both original windows changed to about:blank with no observed denial; old navigation
FAIL remains. This is a truthful failed result, not full runtime or task acceptance.

Exact Electron 45.1.0 [SaveLastPreferences](https://github.com/electron/electron/blob/v45.1.0/shell/browser/web_contents_preferences.cc)
does not serialize devTools or preload; its getter returns that saved subset.
The former `devTools === false` check was therefore a measurement error, and the
reported no-preload success based on field absence was not meaningful proof.
[OpenDevTools](https://github.com/electron/electron/blob/v45.1.0/shell/browser/api/electron_api_web_contents.cc)
uses a separate native enable flag. The correction keeps all eight actual saved
security flags exact, then combines explicit audited false configuration with an
actual open attempt, a bounded 250 ms no-open event/state observation and no DevTools
WebContents. This is bounded behavior plus configuration evidence, not a proof
that no future event can ever occur or an OS sandbox-token measurement.

No-preload evidence now combines the actual audited constructor/build manifest,
no preload property in its compiled preference factory, and the supported pinned
`session.getPreloadScripts()` empty runtime inventory. No test preload is added;
this is scoped configuration/session evidence, not a generic absence proof from
missing fields/globals. The package hash-verifies the same pure measurement helper.
Fixed per-key TRUE/FALSE/MISSING diagnostics contain no raw preference values.

Local source/build **36/36 PASS**, including actual constructor/bundle audit and
executable negative predicates for DevTools enabled/opened/event/missing state and
configured/registered preload. Python **42/42 PASS**; syntax/diff PASS. Corrected
measurements still require hosted execution; no application security configuration,
resource bound, old gate or acceptance numerator changed.

Independent actual measurement patch review CLEAR at 03:55 UTC: source/build
36/36, Python 42/42 and diff check PASS. Actual constructor/factory and package
probe/helper identity verified. README status now distinguishes executed CI6 failure
from corrected measurements still NOT_RUN. No full task or phase acceptance follows.

## Seventh hosted attempt: bootstrap slice PASS — 03:58 UTC

Exact remote head `85c190ea5ea969955d48afa3776c0c3dc3fcfa13`, source tree
`47773fe61c0896464674711725dce5570d4221fb`,
[run 41166487558](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41166487558),
job 124435062956 completed SUCCESS. Windows source/build **36/36**, Python **42/42**
and PowerShell **25/25 PASS**; actual source and instrumented package each **20/20**.

Artifact 13029149206 is the schema-validated fixed-field report only. Downloaded
ZIP: 959 bytes, SHA256 `08834c47485d5e04d034c9df573ced4fff1c0ac1313bc0d0b386074521ed42e4`.
Original JSON: 4,002 bytes, SHA256
`9d0cb0cff793a9b49bad4444d142499bce62f16a88a50fe085487272d1aebb62`.
ZIP digest, exact single entry and bounded size were checked before duplicate-aware
JSON parsing. This hash identifies downloaded evidence; no raw private report is retained publicly.

- Actual Electron 45.1.0 / embedded Node 24.22.1 / Chromium 156.0.8078.49 in both modes.
- Source/package exit 0 with actual orderly-quit case true, all Job cleanup true,
  no truncated captures; each owned profile measured 1,231,398 bytes.
- Crash: expected NONZERO_EXIT 1, armed/observed/bootstrapFailed true,
  unexpectedQuit false; owned bytes 1,231,392.
- Changed asset: expected NONZERO_EXIT 1, changed/bootstrapFailed true,
  unexpectedReady false; owned bytes 557,458.
- Installer official marker, build verification, binary hash, runtime copy and
  directory cleanup all true; package 374,133,205 bytes; failure null, passed true.
- Both about:blank observations still changed URL, with no denial observed.
  `oldNavigationGate=FAIL_RETAINED`; no immutable-document proof is claimed.

Independent artifact review CLEAR at 03:58 UTC: duplicate-aware original-byte parse,
strict fixed-schema reconstruction/equality and privacy review passed. Reviewer did
not relaunch runtime or independently redownload ZIP. No raw logs, host/user paths,
credentials or arbitrary preference values occur in the reviewed fixed report.

This closes only the authorized authority-free bootstrap/lifecycle slice. Full
P1-02 still requires reviewed React/preload/versioned health IPC boundaries, sender/
payload/fuzz denials and prerequisite contract/tooling closure. Full V9 integration,
settings persistence and privileged services remain their canonical tasks. Neither
this result nor a new authority design erases old G0-12 failures or accepts Phase 0,
target-host support, full Phase 1 or main merge. The original 12 exits stay unchecked.
