# Phase2 — private runtime read admission and shared custody

## Scope and authority

Source-only implementation follows the [reviewed custody contract](../phases/P2-RECIPIENT-RUNTIME-CUSTODY-PROPOSAL.md),
pre-entry SHA256 `36203047ccf6164c795a3c49d9d3f06feaae86d9beadab5302a3f21605d3061a`,
under coordinator Coder Bin's 2026-11-01 05:53 ordinary independent source delegation.
No new IPC, renderer behavior, executable dispatch, server, device, download or binary
availability promotion is introduced. A read holder proves a current bounded byte
observation, never process retirement or permission to execute ADB.

The main-owned lane replaces the setup service's historical no-server assumption.
It reserves before external callbacks; setup and byte inspection/read holders exclude
each other. Exact opaque holder identity survives observation revocation so its actual
retirement can still be reported. Close refuses new admission, awaits actual inspection
and holder release, and reports UNRETIRED after its fixed bound without erasing custody.
Late retirement never reopens a closed lane.

Read admission requires the settled private ledger, bounded complete inventory and
all14 pinned runtime files, followed by a second ledger observation and final owner
fence. Missing state remains BINARY_UNAVAILABLE; malformed/partial retained inventory
is RECOVERY_REQUIRED. Private paths and tokens never enter public IPC or logs.

Setup initialization and REQUEST reserve the real shared lane. Native/core operations
retain it through both their real settlement and the REQUEST RESULT audit reservation.
Core idle checks validate the exact held token. Main starts service and custody shutdown
concurrently and requires both RETIRED before its existing persistence/lease release.

## Checks and limits

Author affected checks: custody10, service16 and bridge5 PASS. These include actual owned
synthetic14-file/PE/hash fixtures, pending read/close races, inactive malformed inventory,
setup contention before audit/native effects, actual pending-native exclusion, concurrent
shutdown and delayed REQUEST RESULT audit. Synthetic metadata/owner facts are not native
process or official-recipient evidence. Strict TypeScript and exact84-module graph pass.

The sole coherent check passed build/security/quality stages and test batches1–10,
then batch11 reported72/73: the new test filename was not in sorted inventory order.
The closed-inventory assertion was retained; only registration order was corrected.
Affected harness5/5 passed. Corrected batches11–15 passed224/224 (73/49/45/47/10);
all registered files are covered by the stitched checkpoint. Final298-file quality and
manifest checks passed. Expected next full hosted inventory is914 desktop /109 unchanged
foundation /214 Python; no uninterrupted local914 result is claimed.

Independent review read the custody/service/main boundaries and reproduced focused
causal cases, without duplicating the full suite. No current custody native execution
or new canonical task acceptance is claimed. P1-06 cross-user UNMET, physical-device
requirements and formal0 remain unchanged.

## Exact prior and concurrent evidence

Recipient integration local9cfb65d was published as public
`611c56e0cd90761f51d7becf996c613ed3ad3e24`, exact tree
`083353a88d13755444bd65ebab9c5cdf02811cf5`, after explicit user approval of that36-file
public payload. Windows CI `41279086636` independently audited883/109/205 PASS;
fleet and ADB runtime jobs were skipped. Prior denied publication attempts had no effect.

The separate immutable recipient campaign local935add3 was approved for bounded
FIRST+REOPEN development execution at06:05 and published as
`f1fe3212e680d672b511983223fc5728d177d2de`, tree
`d072169975cfeabd5d0ee3093d868036ffe77dd1`, CI `41279477173`.
It contains no custody slice. Its injected-consent/local-archive scope and exact six
runner hashes remain in the [native campaign evidence](P2-recipient-setup-native-2026-11-01.md).
At this checkpoint that campaign is running, not a native PASS claim. No actual user
consent, production HTTPS route, server/device interaction or redistribution approval
is inferred from its test fixtures.

## Source fingerprints

- Custody: `781dcf7ab6e1c16e67eeff9a9ab0af40c8524d0d769f1d484e1d2dd90b48f67c`.
- Setup service: `912403aaa149389a8cac2b3ddfd4c319206530ab1acc7a19acb815da503ad7fc`.
- Main: `f5cf4448e97c40755554b33a2bd2d819c53f462ad350d88a3652f86af6d58a41`.
