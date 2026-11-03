# P2-08 / P2-13 / P2-09 — internal input and capture software checkpoint

**SOURCE CHECKPOINT PASS — source-only, 2026-11-01 03:14 UTC; canonical tasks IN_PROGRESS.** This continues the coordinator's bounded
pure-input/capture implementation direction while native server/device admission remains
unavailable. It does not accept any canonical Phase2 task or bypass its physical tests.
See the [canonical plan](../phases/PHASE-02-adb-device-fleet.md) and
[software-first entry](../phases/PHASE-02-SOFTWARE-FIRST-ENTRY-PROPOSAL.md).

## Input interface and effect boundary

The actor retains exact version1 metadata requests and adds version2 internal input
requests, with the same distinct command/correlation UUIDs, device/binding/generation,
serial, owner and deadline. The operation is a closed typed union: TAP, SWIPE, KEY,
HOME, BACK, TEXT. There is no generic shell, arbitrary keycode or renderer argv input.
TAP/SWIPE require exact display evidence; other operations may carry null display.
Display evidence binds device identity, display0, dimensions, rotation, orientation
epoch, observation/expiry times, evidence UUID and explicit supplied provenance.
An epoch change invalidates a queued point even if the screen rotates back to the
same dimensions. Viewport mapping rejects points outside the displayed image rather
than clamping letterbox clicks onto the phone.

`currentDisplay` is an injected main-only actor dependency, unavailable by default.
It is checked at queue admission, immediately before dispatch and before accepting
observed results, together with existing owner/current-binding/deadline checks.
Metadata and input share the same per-device lane and global reservation domain.
Transport retirement and exit0 alone do not prove a physical effect: the existing
observation callback must provide a positive check under current admission. Tests
supply synthetic callbacks; no production callback or live adapter is added.

TEXT always returns `UNICODE_UNAVAILABLE` before dispatch. No IME, clipboard, input
normalization, lossy ASCII substitution or `adb shell input text` fallback is present.
The pure equality helper does not establish physical Unicode round-trip support.
Input arguments are fixed-token plans, not permission to invoke a process.

## Capture boundary

The pure validators inspect supplied image/hierarchy bytes and current display
facts. They do not execute ADB, create capture files, implement atomic artifact
promotion, establish a trusted capture provenance, or claim a device screenshot.
Actual disk-full/atomic-storage and physical screenshot/rotation/disconnect evidence
remain pending integration. Defensive parsing limits are not a certified fleet or
product capacity. PNG support is explicitly RGB/RGBA8, noninterlaced with checked
CRC, bounded decompression and filter reconstruction; other formats reject. The XML
subset checks quoted attributes, tags, root rotation, depth/count and fixed attributes.
All entities, including ordinary predefined/numeric escapes, are unsupported and reject:
this is not certification that arbitrary normal device hierarchy XML is accepted.
No entity or external resource is resolved.

## Evidence and limitations

- Focused author actor tests: 20/20 PASS, including existing metadata safety and new
  queue/active rotation, unavailable Unicode/display, revocation and unconfirmed exit0.
- Input17/capture8/actor19/composition2: author46/46 focused PASS before the final
  reentrancy regression; final affected actor20/20 and strict full TypeScript PASS. Independent affected
  input/capture/actor44/44 PASS; no duplicate full aggregate.
- Sole author full desktop checkpoint before that final narrow delta: **677/677 + DESKTOP_SOURCE_CHECK_PASS** at03:14UTC.
  Full graph checks passed; the final added regression makes expected hosted total678.
  No second unchanged local aggregate was run. Unchanged foundation109/Python185 reuse
  exact preceding Windows CI41267669556; they were not redundantly rerun locally.
- Reviewer caught the completion-duration double-budget bug before publication; fixed
  dispatch/observe phase split is covered by a causal completed-swipe positive and
  actual-expiry negative. No live swipe ran. Current evidence/epoch classification is
  conservative, including source and exact timestamp identity; synthetic provenance
  never becomes validated physical provenance.
- The final reentrancy regression retires the registry binding from a display callback
  at queue admission, final dispatch, post-retirement and final observation. The actor
  now rechecks the current binding after those callbacks, then its internal owner fence;
  an old display cannot dispatch/release a success after disconnection.
- Windows source-only checkpoint for this new slice is pending publication; the prior
  version-only development result is a separate accepted bounded result.
- Native input, Unicode and captures: NOT_RUN. Production binary adapter remains
  `BINARY_UNAVAILABLE`; actual version-only development evidence is tracked separately.
- P1-06 cross-user UNMET, physical-device/AVD gates and formal accepted count0 unchanged.

## Exact Windows software checkpoint — 03:20 UTC

[CI41268527588](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41268527588),
public `f4aa5950539484b44a9717109c2127044cdaa4e4`, tree
`2c798fff556c4ba6111afb930455a175d70f8973`, completed both jobs SUCCESS.
Independent source-job124736299800 log inspection confirms desktop678/678,
foundation109/109 and Python185/185 with no skips and the explicit production-unavailable
boundary. This closes the new source checkpoint's pending Windows check, not native
input/capture or canonical-task acceptance. No duplicate version artifact audit was
performed; the previously reviewed version sample remains the bounded version evidence.
