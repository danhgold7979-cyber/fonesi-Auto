# P1-06 owned native evidence envelope

Current source checkpoint only: **Windows execution and cross-context availability
are NOT_RUN**. The coordinator must approve the reviewed native envelope before
execution. This extends the existing persistence run; no installer, account,
privilege, ACL, service or production test switch is added.

For source and renamed-package modes, the supervisor retains the existing lease
and original-backup proof after actual application READY. Each fresh native process
checks exact runtime versions and pre-ready owner/lock/profile identity, then
reauthenticates the original bootstrap backup using the actual provider. It uses
`createNativeSecretStore` from one emitted bundle (including its provider/error
identity), the actual main logger and the existing initialized vault.

Five orderly, separately retired processes perform:

1. Create a synthetic canary, read it, and deny a valid but stale future revision.
2. Read the original reference after restart, replace, deny the old reference and
   read the replacement. Private immutable references remain in the owned run.
3. While the parent holds the exact index with Windows `FileShare.Read`, attempt
   replacement. A delegating observer must see actual EACCES/EPERM/EBUSY from the
   exact index rename. The store must return OWNER_REVOKED, leave active index and
   revision bytes unchanged, and a fresh store must read the retained reference.
   The observer never manufactures failure; an ineffective lock fails the test.
4. Read the retained replacement after native restart, delete, and deny reads.
5. Reopen DELETED, deny the stale original, observe deletion and test idempotent
   delete. An inactive denied replacement candidate is never adopted or retried.

All native stages require successful real audit flush, canonical schema-1/schema-2
records and exact private operation/result correlation. Filesystem directory order
is not sequence order: correlation sorts one validated run's unique record sequence.
After native retirement, a trusted Node inspection scans the exact profile (including
any crash files), audit root and vault. Each tree keeps its own 8 MiB/256-entry/depth-16
cap; public counts are bounded by the sum, not an increased per-tree allowance.
Known synthetic plaintext, UTF-16 and base64 canaries must be absent. Captured stdout
and stderr are separately checked before normalization. Dump count zero means only
that this run observed no dump; it is not arbitrary-crash confidentiality proof.

The separate [cross-context helper](VAULT-CONTEXT.md) receives only the owned current
profile's bounded DPAPI key blob, bound to owner/store/current-profile hashes after
current-build and lease checks. A fresh exact System32 PowerShell process under the
frozen owned 120-second Job compiles the pinned helper. No unavailable token/provider
is counted as a foreign-context denial. Six actual controls, process success and
whole-tree retirement are required. This is compositional provider-boundary evidence,
not a complete Electron application executing as another user.

`validate_vault.py` rejects duplicate keys before normalization and emits only fixed
versions/stages/codes, Booleans and bounded counts. Private reference IDs, key blobs,
profiles and raw captures are never artifacts. Matrix schema 4 requires both modes'
five vault stages and cross-context results; historical schemas 1–3 remain intact.
Existing failure and owned cleanup semantics remain fail-closed. No task/phase or
user-host acceptance follows from source tests or this pending Windows run.
