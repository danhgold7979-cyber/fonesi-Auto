# Phase 09 P9-10 — unconditional denial source entry

ADOPTED 2026-11-03 21:40 UTC after independent entry review CLEAR of
pre-adoption SHA256 `0e5b386b4fb50c6da6e44b93f9f2ac2779a35cfb0288a294f03ae3d16d741748`.
Proposed at 21:39 UTC; source changes start only after the inherited baseline settles.
The coordinator directed continued independent Phase09 work while Phase07 is the
other active lane, preserving Phase08. The user's standing direction permits
switching to independent source work when dependencies block and limits concurrent
phases to two. This is development entry under Amendment02, not predecessor or
Phase acceptance, policy approval, pilot authorization or a reduced release.

## Verified base and canonical scope

Worktree branch `phase-09` was created from public Phase08
`76efe43d071c8fa4566dc1abcc6f229052f56b35`, tree
`dedae6f56607805f9a1d6b6af73881233909d2da`, at 2026-11-03 21:37:52 UTC.
That checkpoint has actual Windows source CI PASS1781/1781; it contains only a
partial non-executing P8-01 manifest history. Phase08 remains acceptance0/14.
Phase09 was absent from the public branch search; Phase08/main remain untouched.

Canonical P9-10 requires unsupported Profile/Group/Like/Love/Share entries to stay
disabled with reasons. This slice implements only independent source-owned denial
metadata for the actual V9 Facebook catalog. P9-01..09 depend on physical profiles,
identity, permissions and the missing runtime/journal; no replacements are invented.
Full P9-10 UI/IPC/schedule/import bypass enforcement also needs those real services.
P9-11/12, all pilot effects and Phase09 acceptance remain unavailable.

## Exact independent contract

One dependency-free `facebook-denial-contract.ts` exports
`facebookWorkflowDenial(workflowId: unknown)`. It accepts only an exact primitive
catalog ID; it never accepts permission, identity, certification, readiness, saved
schedule or override inputs. Every output is a frozen closed record:

- `kind: FACEBOOK_WORKFLOW_DENIAL`
- `state: DISABLED`
- `allowed: false`
- `workflowId`: the exact recognized ID or null, never raw unknown input
- `reason`: a fixed closed reason code
- `detail`: fixed source-owned explanation, not a caller or current-policy claim

Exact recognized IDs and reasons:

| Catalog IDs | Reason and required meaning |
|---|---|
| fb-page-video, fb-page-photo, fb-page-reels | PAGE_PERMISSION_AND_CERTIFICATION_MISSING: each separate action needs permission plus complete technical certification; catalog/manifest existence grants nothing |
| fb-story | STORY_SEPARATE_PERMISSION_AND_CERTIFICATION_MISSING: Story cannot inherit Page/video/Reels approval |
| fb-group-video, fb-group-photo | GROUP_OUTSIDE_PILOT_SCOPE: excluded from the accepted pilot; separate future permission and certification required |
| fb-profile-video, fb-profile-photo, fb-profile-reels | PROFILE_OUTSIDE_PILOT_SCOPE: excluded from the accepted pilot; separate future permission and certification required |
| fb-comment-links | COMMENT_SCOPE_AND_CERTIFICATION_MISSING: separately permitted verified owned/administered scope is required; arbitrary links do not establish permission |
| fb-reaction-links | REACTION_AND_SHARE_OUTSIDE_PILOT_SCOPE: explicitly Like, Love and Share; bulk fake engagement remains excluded |
| Any other input | UNKNOWN_WORKFLOW: no default allow, string coercion, prefix matching or fallback |

Results are informational denial descriptors, not a P8 capability registry,
verification oracle or an authoritative runtime dispatch fence. They grant nothing.
Unknown objects/accessors/proxies are not inspected or coerced. Returned data is
immutable, no caller state is changed, and no runtime import consumes the new leaf.
The actual existing 11 Facebook catalog IDs are checked for exact coverage; the
other 10 workflow labels and all nine networks stay unchanged.

## Files and tests

Own the new source and focused test; exact source module map, build source list,
sorted test inventory, finite graph assertion/cap and exact quality traversal
increment. No dependency, main/preload/renderer/IPC/DB/native or demo modifications.
Canonical docs receive only a linked narrow-entry note, accurate evidence/status
and preserved inherited phase results.

Test all 11 IDs, each distinct reason, always-false authority, exact closed output,
malformed/unknown/non-Facebook IDs, no coercion/getter invocation, output freezing,
source catalog coverage and absence of runtime consumers. Synthetic input claiming
READY/permission can only receive UNKNOWN_WORKFLOW; no grant object is interpreted.
Run actual graph, quality, strict types, product/demo builds, manifest integrity and
full fixed source test inventory. Preserve failed attempts and exact test totals.
Independent review precedes commit/publication.

A separate read-only source CI on phase-09 may use the existing pinned checkout and
Node setup actions, no persisted credentials/cache, Windows2022 and the unchanged
scripts-disabled full source runner. Exact branch guard, finite15-minute timeout,
contents:read, no artifact upload/native/application/device work and explicit
unavailable markers are source-tested and reviewed. Existing workflows unchanged;
only the new YAML gets exact LF handling.

## Deferred rendering and acceptance

A standard-sandbox Chromium visual probe in this disposable environment failed
socket() with Operation not permitted; a single reviewed environment retry failed
the same way. No security bypass was attempted. Renderer reason integration is
therefore deferred rather than presented without required before/after parity.
No V9 labels, steps, status badges, layout, navigation or selection behavior change.

This is a partial P9-10 source contribution, not service/API bypass proof or visible
UI integration. Phase09 technical acceptance remains0/12, with no implementation
percentage invented. P1-06 remains UNMET. Future renderer integration needs exact
same-viewport screenshots; runtime enforcement needs actual identity/registry/queue/
journal boundaries and causal zero-dispatch tests. All physical/policy gates remain.
