# Phase2 recipient-provisioning private core

Status: IN_PROGRESS / SOURCE ONLY. The coordinator adopted [Amendment03](../phases/PLATFORM-TOOLS-RECIPIENT-PROVISIONING-AMENDMENT-03.md) and its private core source entry at 2026-11-01 04:38 UTC, against reviewed pre-adoption SHA256 `c08a07ee70752598e01149cc879bac2eea75af8034f04a4e79ac2a4b0d27e4fb`.

## Implemented boundary

Five private main-adapter modules implement immutable official candidate metadata,
exact bounded ZIP decoding, owned payload materialization, append-only intent/settled
records and a single provisioning lane. They are registered in the closed source/hash
inventory but are not wired to a production grant issuer, downloader, public IPC,
server or device executor. `PRODUCTION_PLATFORM_TOOLS` remains null.

Recipient decisions and ownership/idle-server custody are supplied by private adapters.
The core snapshots configuration, checks current grants and final ownership around
callbacks and every file effect, and refuses stale revisions, unknown layouts,
unfinished operations and unverified retained runtimes. Production terms acceptance
and actual host setup are NOT_RUN, not implied by synthetic grants.

Publication is exclusive directory creation plus exclusive per-file write/sync/readback,
not an atomic directory rename. Full physical verification precedes settlement. Partial
publication is preserved as unsettled and cannot become active or be overwritten by a
retry. Completed staging is retained as well as failed staging, under the same five-stage,
four-runtime,128-operation and128MiB aggregate bounds; no cleanup/pruning permission
is introduced. Reinstall of the already active exact digest revalidates it without
creating another intent or download. Rollback can select only a retained still-allowed
verified prior digest; the current production allowlist has one candidate, not an
invented second release.

Archive reads and write readbacks are capped before allocation. Total operation and
close waits are bounded at120000ms. A timed-out/uncooperative adapter does not acquire
a retirement claim: close reports UNRETIRED, retains the active promise and uncertainty,
and requires the caller to keep its resources/lease until real settlement. Status reads
also participate in this retirement boundary. Thrown exotic objects map to fixed errors,
not raw private exception text.

## Evidence and limits

Affected author tests: provisioning13, ledger8 and module graph26, combined47/47 PASS.
Strict TypeScript, closed graph76 and quality275-file inventory PASS. Independent review
ran ledger8 and a final affected provisioning9-case subset; these overlap author tests
and are not additive. The sole author complete aggregate passed841/841 plus DESKTOP_SOURCE_CHECK_PASS at04:59 UTC; no duplicate full reviewer suite was run.
Unchanged foundation109 and Python203 evidence is reused, not rerun for this TypeScript-only
slice. No native execution or platform compatibility claim is made by these local tests.

The tests exercise actual owned files, canonical records and physical verification with
an explicitly substituted tiny synthetic candidate/ZIP: install/reopen, idempotence,
invalid archives, partial retained runtime refusal, callback revocation, archive growth,
open/write/sync/close faults, non-throwing error classification and late completion.
Production candidate pin/metadata are independently asserted unchanged. Synthetic metadata
substitution is test-only and cannot activate production fixtures.

A separate development-only byte experiment decoded the already-retained official ZIP
and installed its14 files/17529398 bytes through the private core into an exclusively owned
temporary root, then revalidated via same-instance status and removed only the exact known
files. It performed no network download or executable invocation. Actual new-instance
reopen is covered by the synthetic-byte tests, not mislabeled as part of that experiment.
The official archive remains8044989 bytes, SHA256
`45f4d63113e895ebde0c90f194099a4676b6ac653bd28d54314a9e022bbc1a99`.

## Delivery and acceptance

Auto's foundation remains offline-capable. First optional ADB setup requires a direct
Google download or the recipient's already-held exact archive; Auto does not redistribute
these binaries. Recipient terms/use authority, exact component obligations and runtime
admission remain separate. No reviewed-license flag is fabricated.

Current schema4 native UI/migration/capture proof remains NOT_RUN. The accepted historical
schema3 fleet/UI smoke is separately linked in [fleet evidence](P2-fleet-facade-integration-2026-11-01.md).
The existing-profile server refusal remains UNMET; no existing `.android` entry is adopted.
P1-06 cross-user UNMET, hardware/AVD requirements, canonical task counts and formal0 are unchanged.

## Frozen source digests

- `platform-tools-candidate.ts`: `96dd4a955c751cc4c2127974251e7fbc8d80bc3e37c78569370d7707f3cd3146`.
- `platform-tools-archive.ts`: `f05478600d8a4cc66329f05c2f4b632b24113083df258e9eecc5f23e1619605b`.
- `platform-tools-provision-ledger.ts`: `0ba8116066cdc380e1bbc7a8129c1c0ad732e75dcce7ca3cde9daa518e633e3d`.
- `platform-tools-provision-files.ts`: `95ebff4965220134e53192ef70e9aee85d7ad3d12eadfa1220ef5b49b811301b`.
- `platform-tools-provisioner.ts`: `6b66caf40476fc273f6fb38f33c4023ea8a74b3607066607cd3ecdf715482de9`.
