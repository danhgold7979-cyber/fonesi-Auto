# Bounded cross-context DPAPI verification helper

Source-only candidate under the approved P1-06 contract. **Windows compilation,
LogonUser availability and DPAPI outcomes are NOT_RUN. Source review and coordinator
execution approval are required before invocation.** This is not a production API.

`Fonesi.Verification.VaultDpapiContext.Run(byte[] ownerDpapiBlob)` accepts only the
owned synthetic Electron profile's DPAPI-protected key payload, stripped of its exact
`DPAPI` transport prefix by a separately reviewed caller. It clones a 32–4096-byte
input. It never opens files, accepts a path, exports a SID/token/blob or returns
plaintext. A future caller must prove that payload's owned-profile provenance and
invoke this helper on one synchronous thread in a fresh process under the frozen
owned Job deadline/capture/retirement envelope. Never run it in the application or
in a reusable PowerShell host. No wrapper/execution workflow is provided here.

The fixed sequence is owner decrypt (32-byte key) → existing LocalService service
logon → effective TokenUser exact identity/difference check → foreign random
32-byte canary protect/decrypt → owner-blob decrypt rejection → RevertToSelf and
original effective SID verification → same owner-key decrypt/equality. Provider or
logon failure is unavailable/failed control, **not** a successful foreign denial.
Only all six controls and PASS satisfy `vault-context-contract.cjs`.

The helper uses no machine-scoped protection, password, account/service/task
creation, ACL/rights change, privilege enabling or token borrowed from another
process. The [LocalService documentation](https://learn.microsoft.com/en-us/windows/win32/services/localservice-account)
describes a predefined identity; it does not promise the runner can acquire a
service-logon token. [LogonUser](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-logonuserw)
service mode remains an attempted mechanism, without fallback or privilege changes.
Normal OS-managed profile/key writes may occur during provider use.

Reversion failure or inability to verify the restored identity immediately terminates
the isolated process (fixed exit 76); it never proceeds to owner filesystem work.
This follows [RevertToSelf's failure guidance](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-reverttoself).
The outer Job must still retire every descendant. Managed/unmanaged buffers are
cleared best-effort, not a secure-zeroization guarantee. Timeout termination is not
cancellation/durability proof. A successful future run would be compositional DPAPI
provider-boundary evidence, **not** Electron running under another Windows account
or cross-machine/backup-portability evidence. No arbitrary native error is emitted.

The pure tests check fixed-schema rejection and source/API policy only; they do not
compile C#, establish native semantics or simulate a successful Windows result.
