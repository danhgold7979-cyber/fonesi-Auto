# P8-01 immutable workflow manifests — source evidence

## Scope and base

Independent source entry: [reviewed contract](../phases/P8-MANIFEST-SOURCE-ENTRY.md).
Canonical task P8-01 remains partial; Phase 08 acceptance is 0/14. No workflow is
runnable and no prerequisite phase is accepted by this checkpoint.

Verified repository: danhgold7979-cyber/fonesi-Auto, branch `phase-08` from public
Phase 07 commit `3a7689e3c70435f673d53b21a2f713d5ac1a53ca`, tree
`5c5d138b0384d67e47dd9b917dd4fb3b38a64dd3`. Git reflog records branch creation
2026-11-03 21:10:45 UTC. Entry proposed 21:12; independent design CLEAR and source
adoption 21:15 UTC. This is a predecessor-development base, not accepted main.
Phase 05 work was not accessible in this workspace and was not overwritten or
reconstructed; its absence here does not establish data loss.

## Implemented behavior

- Closed, descriptor-safe immutable snapshots for supplied declarations of the
  three existing Page video/photo/reels workflow IDs. Readiness stays UNVERIFIED.
- Fixed step order, effect classification and exact Page/media-kind readback
  requirements; photo/album count/order and Reel-versus-feed distinction retained.
- Required policy/profile/input-schema hashes are unverified document references,
  never certificates. Missing, malformed, extra, accessor or privilege fields fail.
- Versioned history preserves old exact identities. Identical additions are
  idempotent; same-version changed bytes conflict; no latest-version fallback.
- A finite history serialization bound never evicts definitions. Caller data is
  neither mutated nor frozen; all returned nested data is copied and frozen.
- Retry metadata is NEVER. Composer/input mutations and publication are declared,
  not executed. Comment planning is only a verified-post dependency declaration.
- Exact graph/build/test registration, finite traversal increments and isolated
  read-only source CI; no main/preload/renderer/IPC/DB/device wiring.

## Local checks

Environment: disposable Linux execution workspace, Node 24.22.1, npm 11.9.0,
repository-pinned TypeScript 7.0.2, Biome 2.6.4 and esbuild 0.28.2. NODE_PATH is
removed only for each test child as prescribed by the existing repository guide.
Dependencies restored with npm lifecycle scripts disabled; no Electron install or
application launch. Restored exact metadata, signatures/provenance and advisory
checks passed through the baseline source runner.

| Check | Actual command / result |
|---|---|
| Baseline full source | `env -u NODE_PATH node desktop/scripts/check.mjs --restore`: PASS 1753/1753 and DESKTOP_SOURCE_CHECK_PASS before source edits |
| Focused new module + source-CI guard | `env -u NODE_PATH node --test --test-reporter=tap desktop/tests/workflow-manifest-contract.test.mjs`: PASS 28/28, no skips/cancellations/todos |
| Independent graph suite | Clean-environment `node --test desktop/tests/module-graph.test.mjs`: PASS 27/27 |
| Final source before CI guard | `env -u NODE_PATH node desktop/scripts/check.mjs`: PASS 1780/1780 and DESKTOP_SOURCE_CHECK_PASS |
| Final complete source + CI guard | `env -u NODE_PATH node desktop/scripts/check.mjs`: PASS 1781/1781 and DESKTOP_SOURCE_CHECK_PASS; final frozen runner exited 0 |
| Pure foundation | Scripts-disabled locked restore then `env -u NODE_PATH node scripts/check.mjs 11.9.0` from foundation: bootstrap/boundaries/strict types/hygiene PASS, tests 109/109, zero excluded |
| Portable Python regression | `python -B` unittest discovery of desktop/verification test_*.py with exact expected count 375 and no-skips guard: PASS 375/375, 10.162 seconds |
| Whitespace | `git diff --check`: PASS |

Source runner includes exact module graph, full Biome corpus, strict product/demo
TypeScript, product/demo builds, build-manifest integrity and the entire fixed test
inventory. The new leaf has no incoming runtime source imports. Build-source
registration is integrity accounting, not application activation.

### Preserved corrections and failed attempts

Initial graph verification failed INVENTORY_LIMIT because its traversal cap had
not yet included the one new source file. Exactly 129→130 walk entries and
126→127 registered modules resolve this; no checker was bypassed.

The first post-implementation aggregate stopped at QUALITY: one new test used an
assignment-returning forEach callback. Replacing that test-only loop with for-of
cleared the lint error. Existing informational style suggestions were retained.
The failed QUALITY run did not execute later test/build stages and is not counted
as a test PASS. The subsequent full source aggregate passed as stated above.

The first CI-guard aggregate also stopped at QUALITY because the new source test
used adjacent literal spaces in indentation regexes. A first correction left one
such regex; its aggregate again stopped at QUALITY. Exact space quantifiers now
replace those spellings, and the direct focused quality check passes. Runtime
source is unchanged; all failed attempts remain failures, not executed test passes.

An independent direct graph-test attempt with inherited NODE_PATH failed one
metadata check. The documented clean-environment command passed unchanged source
27/27. This is not a reason to weaken dependency override rejection.

## Independent review and exact source identities

Design review CLEAR binds pre-adoption entry SHA256
`162b168503e60e8adeae4968bf2aad3235242d98d5496c32ae5de117dbfa3d43`.
Implementation review CLEAR covers the pure snapshot/version semantics, fixed
verification mapping, negative tests and exact graph/build registration. Final
CI extension and final test-byte review are also CLEAR.

- Source SHA256: `46423a287487176943ecab8fc396c29da495d492feb2f293a3747384a474b0ed`.
- Test SHA256: `2baab3b4611494f5bc93be36acfd3f8732767a1dc5ccdaeafea5ddef1e28ed15`.
- Source-only workflow SHA256: `b7a247ac112936950d269c68f15f97c3de0771acb6aebedf5acad781b30fd787`.

## Publication and remaining gates

At this evidence preparation checkpoint publication and actual Windows CI are
NOT_RUN. The reviewed source-only job checks only phase-08 and uses pinned actions,
contents:read, no persisted checkout credentials/cache, no artifact upload and no
native/application/device campaign. Exact new workflow LF bytes are preserved on
Windows through a path-specific attribute; older workflow files are unchanged.

P8-01 input payload validation against actual P5/P6/P7 schemas, approved production
manifest installation, durable job/version binding and disable/recovery integration
remain open. P8-02..14 remain unimplemented by this slice. Hash references do not
prove policy permission, app certification, identity, media or leases. P1-06 remains
UNMET. Physical Windows/Android, live UI/action, durable journal, unknown-effect
reconciliation, performance and phase acceptance remain unverified; no numerical
implementation progress is invented. Main is preserved; no merge or PR approval.
