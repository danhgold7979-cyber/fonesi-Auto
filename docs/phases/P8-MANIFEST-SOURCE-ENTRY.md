# Phase 08 P8-01 — immutable manifest source entry

ADOPTED 2026-11-03 21:15 UTC after independent entry review CLEAR of
pre-adoption SHA256 `162b168503e60e8adeae4968bf2aad3235242d98d5496c32ae5de117dbfa3d43`.
Proposed at 21:12 UTC; source implementation begins only after this disposition.
The coordinator directed a Phase 08 independent lane after the prior Phase 05
checkpoint was not accessible in the current workspace. Existing work is preserved;
no data-loss conclusion or Phase 05 replacement is made. The user explicitly asked
to continue independent phases when blocked, with at most two active phases, and
to leave actions needing approval for the next day. This narrow entry uses the
software-first Amendment 02 exception; it does not accept predecessors or enable
any runtime/device operation. Main and existing history remain untouched.

## Verified base and task

Repository: danhgold7979-cyber/fonesi-Auto. Sole local branch `phase-08`, created
from public Phase 07 commit `3a7689e3c70435f673d53b21a2f713d5ac1a53ca`.
No Phase 08 branch existed on the remote at entry. The public Phase 07 source is a
development base, not accepted main or a complete scheduler. P1-06 remains UNMET;
P5 identity, P6 media, P7 queue/lease integration and all physical acceptance stay
unavailable. Only the independent immutable definition/version portion of P8-01
is proposed; P8-02..14 and the rest of P8-01 remain unimplemented.

Canonical requirements: master P8-01, PHASE-08-workflow-runtime.md P8-01,
03_DATA_AND_WORKFLOWS.md sections 3–4, T-08 and the unchanged V9 catalog. This is
not the generic effect/execution framework excluded by Amendment 03.

## Functional contract

Implement a dependency-free, effect-free TypeScript leaf that snapshots supplied
fixed-workflow declarations and retains exact historical versions. It does not
supply a runnable workflow, certify inputs, interpret app selectors or invoke an
adapter. No production definitions are automatically installed.

A closed `WorkflowManifestV1` contains schemaVersion=1, kind=FIXED_WORKFLOW_MANIFEST,
workflowId from existing fb-page-video / fb-page-photo / fb-page-reels, positive
safe integer definitionVersion, definitionState=UNVERIFIED, three supplied SHA-256
reference strings (policy, profile and input schema), and ordered steps. References
are declarations of required documents, not proof they exist or passed review.
Unknown workflows (including Story, Profile, Group, reactions or shares) refuse;
the wider V9 catalog is not removed or reclassified.

The fixed declaration sequence is RESOLVE_SCOPE, VERIFY_IDENTITY, VERIFY_POLICY,
VALIDATE_MEDIA, PREPARE_COMPOSER, FILL_CONTENT, PUBLISH, VERIFY_PUBLICATION,
PLAN_COMMENTS. Each step declares its fixed effect class and exact verification
requirement, a positive integer timeoutMs <= 2147483647 and retry=NEVER. These are
non-executing metadata limits, not approved runtime/performance budgets. Reject
missing, duplicate, unknown or reordered steps, changed effect classification,
missing verification and any retry permission. PLAN_COMMENTS describes only the
post-verification dependency; it does not implement P8-08 or authorize comments.

The exact step objects are `{id, effectClass, verification, timeoutMs, retry}`.
The source-owned literal mapping is:

| id | effectClass | verification |
|---|---|---|
| RESOLVE_SCOPE | READ_ONLY | EXACT_DEVICE_ACCOUNT_TARGET_REFERENCES |
| VERIFY_IDENTITY | READ_ONLY | CURRENT_ACCOUNT_AND_PAGE_IDENTITY |
| VERIFY_POLICY | READ_ONLY | ACTION_PERMISSION_AND_EXACT_CAPABILITY |
| VALIDATE_MEDIA | READ_ONLY | EXACT_MEDIA_HASH_KIND_AND_ORDER |
| PREPARE_COMPOSER | DEVICE_MUTATION | EXACT_COMPOSER_AND_ORDERED_ASSETS |
| FILL_CONTENT | DEVICE_MUTATION | EXACT_UNICODE_CAPTION_HASHTAGS |
| PUBLISH | EXTERNAL_EFFECT | PAGE_FEED_VIDEO_READBACK / PAGE_ORDERED_PHOTO_READBACK / PAGE_REEL_READBACK |
| VERIFY_PUBLICATION | READ_ONLY | same workflow-specific readback literal as PUBLISH |
| PLAN_COMMENTS | DECLARATION_ONLY | VERIFIED_POST_COMMENT_DEPENDENCY |

The readback literal is selected solely by the exact workflow ID, respectively
video, photo or reels. Every readback requires the same verified Page/account,
permitted created-post reference and exact content/caption. PHOTO additionally
requires exact asset count and order (one logical post per target); REEL cannot
be satisfied by a feed-video result. These literals describe requirements, not
an implemented verification oracle. Composer/media selection is a device mutation,
not mislabeled read-only; no command is emitted. PLAN_COMMENTS only preserves the
post-verification dependency and never queues/sends comments in this slice.

Use exact-key descriptor snapshots: reject accessors, extra/symbol keys, sparse or
exotic arrays/objects, invalid primitives and exceptions without reading getters
or leaking raw input. JavaScript Proxy traps are not sandboxed; synchronous
hostile in-process code is outside the data-validation guarantee. Copy and deeply
freeze all returned values. Never mutate/freeze caller input.

Snapshot a bounded supplied history (<=128 declarations, a serialization limit,
not a workflow/job capacity), rejecting duplicate ID/version keys. An add operation
returns ADDED, IDENTICAL, VERSION_CONFLICT or INVALID without changing prior input.
Identical declared content under the same ID/version is idempotent; any changed
reference, timeout or step under that version conflicts. New versions append;
old exact-version resolution remains unchanged. No latest-version substitution,
execution token, READY state, deletion, persistence or mutable global registry.

## Files and verification

Own desktop/src/workflow-manifest-contract.ts, its focused test file, exact module
map registration, graph-count assertion, build source-input registration, test inventory
and the quality traversal bound increment for the two new files; docs entry/evidence/status
links only. Existing graph/quality limits are extended exactly, never disabled.
No main/preload/renderer/IPC/native/DB/dependency changes. No UI or device tests.

Run actual Node tests for successful snapshots, immutability, malformed/hostile
input, fixed sequence/effects/verification, timeout/retry rejection, exact version
history, conflict and missing resolution; test that runtime source does not import
the module. Run repository graph, Biome, TypeScript, product/demo build/manifest
and the full desktop source runner. Review source independently before commit.
Publish only a coherent passing reviewed phase-08 checkpoint when authenticated;
never retry a credential-blocked push blindly. No merge or PR approval.

P8-01 canonical completion, durable job binding, capability/profile certification,
input payload semantics, production manifest installation and all integration/
Windows/device gates remain open. No implementation percentage is introduced.

## Reviewed hosted source verification extension — 2026-11-03 21:22 UTC

Independent review CLEAR permits one new `phase-08-workflow-source.yml` with only
manual or phase-08 push triggers and an exact phase-08 job guard. Existing pinned
checkout/setup-node actions, credentials persistence disabled, no package cache,
contents:read and 15-minute windows-2022 bound are retained. It runs only the
existing scripts-disabled desktop source/build/test runner and explicit unavailable
markers. No app, Electron observer, native campaign/helper, ADB/device job, private
input, artifact upload or API write is added. A focused source test pins the exact
workflow scope. The new workflow alone has an explicit LF .gitattributes rule,
preserving exact source-test bytes on Windows without changing historical YAML.
Final workflow/test bytes are independently reviewed before
publication. Hosted results remain NOT_RUN until an actual exact-head run exists.
