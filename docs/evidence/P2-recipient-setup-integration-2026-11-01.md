# Recipient setup integration — source checkpoint

Date: 2026-11-01. Status: source implementation checked; final review pending; actual recipient/native
setup execution NOT_RUN. No canonical task or formal acceptance count changes.

## Authority and scope

Coordinator Coder Bin approved source entry at05:21 UTC against the independently
reviewed [contract](../phases/P2-RECIPIENT-SETUP-INTEGRATION-PROPOSAL.md), pre-adoption
SHA256 `278212f8a5e8c6be665bdacb18ed5d6b0d13a278412d2adaafa09f79823e0e87`.
The adopted recipient-delivery amendment preserves foundation offline launch and makes
optional first ADB setup explicitly direct-Google or recipient-owned matching archive;
it does not authorize Auto redistribution or imply component-license review.

## Implemented behavior

- Existing Help/settings contains compact setup/status and explicit Read controls.
  Two canonical path/URL-free methods use existing sender/frame/ViewSession fences and
  the shared eight unresolved preload invocations. Setup returns PENDING, not installed.
- A released RPC slot does not revoke the separately reserved single operation, but
  session generation loss, bridge disposal and service shutdown do. Late/ambiguous
  post-dispatch replies report OUTCOME_UNKNOWN; stale reads cannot restore readiness.
- Main owns terms, route/picker and final Cancel-default native dialogs. Only the final
  affirmative native decision can mint a private opaque grant; opening terms is not consent.
- Schema6 fixed-field audit preserves schemas1–5. REQUEST and PROVISION require flushed
  INTENT before their respective effects. Result degradation does not claim rollback.
- The HTTPS adapter permits one fixed official request, no redirects/retry, capped bytes
  and actual response/request closure. The core owns exact verification and append-only
  activation ledger. Main passes the existing owned persistence root, yielding the
  approved `platform-tools-runtime` child rather than an uncreated intermediate root.
- Setup/native/download retirement is awaited before other persistence resources and
  lease release. UNRETIRED never means safe cleanup. VERIFIED_LOCAL describes verified
  bytes only: production fleet still BINARY_UNAVAILABLE; no server/device capability
  is promoted and no legacy license-review boolean is fabricated.

## Source checks and review

Focused authored tests cover actual owned core/service composition with injected native
answers and transport, fixed wire/audit schemas, delayed REQUEST audit plus session loss,
shared preload cap, explicit React reconciliation, and exact graph registrations.
The native answers, HTTPS events and authority callbacks in these tests are synthetic;
they are not genuine recipient consent, actual network transfer or a Windows setup run.
The sole author pipeline passed metadata, strict TypeScript, exact83-module graph,
production/demo build and manifest stages, then test batches1–7. Batch8 reported92/93:
the historical blanket main `openExternal` exclusion was incompatible with the expressly
approved fixed native terms action. Its replacement asserts the sole literal call and
URL guard while retaining bridge/preload exclusions; affected policy40/40 passed.
Batch9 reported72/73 because that test-only edit required formatting; affected quality12/12
then passed. Remaining batches10–14 passed255/255. Thus all110 registered files were
covered in a stitched checkpoint, not an uninterrupted883-test run. Next Windows expected
count883 = prior845 +37 new tests +one renderer regression. Final quality290-file check,
verified build manifest and diff checks passed. Unchanged foundation109/Python205 evidence
is reused from exact CI41276065327, not rerun locally.

Independent review used affected causal tests and source reads rather than repeating the
aggregate: delayed real-service REQUEST/revocation, failed-download revision reconciliation,
stale-client read fencing, wire/audit/adapter boundaries and exact tooling closure.

The prior [schema4 native smoke](P2-schema4-fleet-native-2026-11-01.md) passed at its exact
older application tree and is retained here as distinct evidence. It does not prove the
new setup dialog/Help integration. A bounded actual setup runner requires exact independent
review and execution approval. Existing-user migration, capture crash recovery, physical
phones/AVDs, server availability and P1-06 cross-user proof remain separately unfulfilled.

## Frozen source fingerprints

- `desktop/src/main.ts`: `70cdf68feabfcb10ebf4f72f82f6fc63f84329a880cc882deafc23597288699a`.
- `desktop/src/main/platform-tools-setup-service.ts`: `65963e9f7d592bbf0c3b96a3af629a5052574dd4d4e06708c98e08562b1ccb80`.
- `desktop/src/main/platform-tools-setup-native.ts`: `6696164335523e1ae29ed6f581f75d8899b147e00d5ec2ff26b35550ca661ff0`.
- `desktop/src/main/platform-tools-download.ts`: `5871e5b353f103653bad8cdd5064cab15e879ee229f3c0c36fd65aa18f2f53ed`.
- `desktop/src/platform-tools-setup-bridge.ts`: `ab19f49ac4d95abcd374fe6ec5eab8874e9b62be147506b090cc865f4aaf4b68`.
- `desktop/src/platform-tools-setup-client.ts`: `45ddc3d5039cd61e3f398cfec109eab60e77e0040c32e040b70f790832039ad7`.
- `desktop/src/platform-tools-setup-contract.ts`: `5232478c2ceaf71d47460c18766ffdb96eca3ff6677abfc48ac56eb963ce3acc`.
