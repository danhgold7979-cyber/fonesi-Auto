# G0-13 / P0-09 — Secret-storage threat and key-recovery matrix

**PROPOSED, documentation/source research only.** 2026-10-30 20:07 UTC.
No experiment implementation, runtime provisioning, security change, production key
format or encrypted-backup selection is authorized by this document.

## Trace and scope

Approved P0-09 includes architecture/privacy/backup decisions and depends on
P0-01..08. G0-13 requires threat/restore/key-handling contracts and mechanism proof.
C-14 selects Windows-backed secrets with SQLite references and restore quarantine;
C-13/C-22 select encrypted local backup cadence/copies, not a cryptographic format,
portable key mechanism or support matrix. Those choices are not reopened here.

[Architecture](../02_TECHNICAL_ARCHITECTURE.md),
[accepted decisions](../16_ACCEPTED_PRODUCT_DECISIONS.md),
[ADR-0004](../decisions/ADR-0004-runtime-data-contracts.md) and
[approved baseline](../phases/PHASE-00-feasibility.md) remain unchanged.
The only candidate examined is already pinned Electron45.1.0's builtin safeStorage
in an owned main-only process. No Credential Manager entry, password, proxy secret,
Windows account or production backup may be deliberately inspected or modified.
Application code must not enumerate/manipulate real user/key stores. A future call
to Windows-backed crypto necessarily uses the runner identity and may access/write
OS-managed profile/key state; owned app paths do not guarantee zero OS-side effects.
That normal provider use must be acknowledged in any later experiment approval.

## Primary-source findings (retrieved 2026-10-30)

S1. [Exact Electron45.1.0 API documentation](https://raw.githubusercontent.com/electron/electron/v45.1.0/docs/api/safe-storage.md)
deprecates synchronous methods and describes lazy asynchronous initialization after
ready. `isAsyncEncryptionAvailable()` resolves a boolean; `encryptStringAsync(text)`
resolves a Buffer; `decryptStringAsync(buffer)` resolves `{result,shouldReEncrypt}`.
Windows protection does not isolate other applications running as the same user.
The documentation's rotation instruction is ambiguous (it says to decrypt again);
this proposal does not invent or test a rotation/re-encryption protocol.

S2. [Exact native binding](https://raw.githubusercontent.com/electron/electron/v45.1.0/shell/browser/api/electron_api_safe_storage.cc)
registers these three async methods. Successful decrypt returns plaintext and a
rotation hint. Failed decrypt rejects with a fixed error message, including a
separate temporary-unavailability message; the inspected binding exposes no
`isTemporarilyUnavailable` property despite documentation narrative mentioning it.
Do not invent typed error codes/properties or serialize exception text. An eventual
lab may map only reviewed exact literal strings to fixed codes; unknown rejection
remains UNKNOWN/failed evidence. OnOsCryptReady sets availability true without a per-key usability test. Availability
alone proves neither successful new encryption nor recovery of old ciphertext.
Exact Chromium156 [async initialization](https://raw.githubusercontent.com/chromium/chromium/156.0.8078.49/components/os_crypt/async/browser/os_crypt_async.cc)
constructs an encryptor despite provider failures; its [encryptor](https://raw.githubusercontent.com/chromium/chromium/156.0.8078.49/components/os_crypt/async/common/encryptor.cc)
can reject nonempty encryption without a usable default key. This source distinction
is not a recreated runtime failure.

S3. [Exact Electron browser-process implementation](https://raw.githubusercontent.com/electron/electron/v45.1.0/shell/browser/browser_process_impl.cc)
reads Local State under sessionData and supplies it to the Windows DPAPI provider.
It states legacy OSCrypt initialization precedes async provider creation. Redirect
all profile/session/log/crash paths before readiness; a successful fresh initialization
must not be equated to recovery of prior secrets.

S4. [Chromium156.0.8078.49 DPAPI provider](https://raw.githubusercontent.com/chromium/chromium/156.0.8078.49/components/os_crypt/async/browser/dpapi_key_provider.cc)
reads a DPAPI-wrapped local preference key, validates encoding/header/length, then
uses CryptUnprotectData. Missing/malformed key cases map to permanent unavailability;
DPAPI decrypt failure maps to temporary unavailability internally. This describes the
provider, not complete startup/recovery behavior or a public Electron error enum.
The matching synchronous initialization source URL returned404 in this research;
Electron applies Chromium patches, whose relevant coverage still needs review before
claiming a complete exact-binary key lifecycle. Do not assume deleting Local State
makes availability false; startup may provision a fresh, unrelated key.

S5. [Microsoft CryptProtectData](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)
describes ordinary user/machine binding, roaming-profile exceptions and integrity
protection. Machine-scope protection permits other users on that machine and is not
an acceptable silent replacement for user scope. A same-user hosted restart does
not establish another-user or another-machine recovery, credential-reset survival,
or app-level protection against a compromised same-user process.

## Threat / failure / evidence matrix

| Situation | Required application contract (proposed) | Current evidence / remaining gate |
|---|---|---|
| Disk copy without usable user keys | No plaintext secrets in SQLite/logs; store scoped references only | Windows-backed direction accepted; concrete adapter and at-rest audit unproved |
| Another process under same Windows user | Do not claim app isolation; least-privileged API boundary still needed | Source explicitly excludes same-user-app protection; navigation/IPC gate remains blocked |
| Administrator, malware, process memory capture | Outside any claim this candidate alone resolves | Threat-owner review needed; strings/Buffer cleanup is not guaranteed secure memory erasure |
| Same user/machine, orderly app restart | Old ciphertext decrypts exactly using retained owned profile, or remain blocked | Proposed synthetic probe below; NOT_RUN |
| Missing app profile/key record | Never treat fresh-key availability as restored secret; no empty/default secret fallback | Require exact old-ciphertext comparison/rejection evidence; no key format assumed |
| Corrupt owned profile/ciphertext | No corrupted plaintext accepted or uncertain state relabeled success; preserve original evidence and stop dependent dispatch | Corruption fixture proposed only on owned copies; actual behavior NOT_RUN |
| Revoked/unavailable Windows key access | Stop secret-dependent operations; never downgrade scope/plaintext or automatically retry effects | Real credential/key revocation NOT_TESTED; no account/password/ACL/key-store mutation authorized |
| Rotation hint | Preserve old ciphertext until a reviewed atomic re-encryption/recovery design exists | Source hint only; migration protocol and rollback NOT_SELECTED |
| Same-PC reinstall/changed Windows user | No recovery promise from same-process or same-user test | Separate authorized identity/profile lifecycle tests required |
| Transfer to another PC | Explicit recovery mechanism and verified proof before portability claim | Owner/design decision plus actual second-host evidence required; no key export proposed |
| Old database backup restored | Dispatch remains quarantined; secret availability cannot authorize replay of post-snapshot effects | C-14 accepted; reconciliation/storage implementation and empirical proof unresolved |
| Local encrypted backup | Maintain verified backup prerequisite and known-good copies per C-22 | Encryption format, key custody/recovery and chosen folder still require reviewed decisions; not solved by encrypting one string |

## Standalone stages1–3 proposal — NOT AUTHORIZED TO EXECUTE

Purpose: establish only asynchronous API availability and same-user/profile restart
behavior of the existing candidate, plus nonempty ciphertext-tamper handling.
Missing/corrupt profiles and OS-key revocation are excluded from this experiment,
not silently waived or counted as passed. This is not a production secret adapter, encrypted DB backup or portability
mechanism. A fresh playbook exception and explicit coordinator approval must precede
code/provisioning. Prior SQLite approval is not reused as secret-experiment authority.

If later approved, reuse exact45.1.0 runtime and reviewed checksum/Job supervisor,
with no new dependency, renderer, device, network content or run-as-node override.
Use at most three fixed synthetic strings (Vietnamese/English/emoji), each<=256UTF-8
bytes. Ciphertext stays only in a newly owned temporary tree, never an artifact.
All owned profile paths set before readiness; no deliberate real OS credential-store
enumeration, key export, credential creation, permission/ACL changes, password reset
or key deletion. Normal DPAPI access under the existing runner identity may still
read/write OS-managed key/profile state; no zero-OS-side-effect guarantee is made.

Proposed stages, each separately supervised and deadline-bounded:
1. **Create:** verify async methods and actual runtime; encrypt and decrypt fixed
   strings in owned profile A. Validate Buffer/result/boolean shapes and exact text.
2. **Restart:** orderly app shutdown, verify owned process tree empty, then relaunch
   under the same existing runner user/profile A and decrypt saved ciphertext exactly.
   Use normal bounded shutdown for preference persistence, not assumption that an
   immediate process exit flushed key state. Failed persistence is evidence, not
   permission to manually manufacture an internal key file.
3. **Ciphertext negatives:** in a new process using the same intact owned profile,
   first decrypt the unmodified baseline exactly (mandatory positive control), then
   test private in-memory copies with a one-byte tail truncation and a last-byte
   bit flip. Both stay nonempty and preserve the provider prefix; no header-routing
   error is accepted as proof of payload-integrity rejection. Require explicit rejected decrypt and no accepted plaintext.
   Missing method/init failure/timeout cannot pass as a tamper rejection. Keep
   baseline ciphertext unchanged and do not deliberately corrupt/replace the profile;
   normal runtime persistence may update that owned profile. Empty Buffer has an
   explicit successful empty-string path in the exact binding and is not evidence of
   tamper rejection; test it separately only as documented input behavior, not a
   security denial.

**Excluded stage4 — NOT_TESTED/no execution:** missing/corrupt app profiles, fresh
profile B or cloned Local State mutation. Availability and old-ciphertext recovery
would need separate observations and additional key-lifecycle source review. Neither
stage4 nor real OS-key revocation is included in approval of stages1–3.

No actual revoked-user/key scenario is simulated by claiming that a corrupted file
is Windows key revocation. That matrix row remains NOT_TESTED. Failure handling and
redaction can be reviewed without destructive OS-key experiments.

Suggested envelope for coordinator review: exactly three process launches15s+5s cleanup
each, existing bounded provisioning if separately permitted, fixed64KiB JSON evidence
cap/read cap before allocation, ciphertext<=16KiB per fixture, owned tree<=4MiB
post-run snapshot and bounded depth16/256-entry lazy traversal. These are lab bounds,
not a strict peak-resource quota. Delete only verified owned files after confirmed
Job cleanup; no recursive broad delete. No plaintext/ciphertext/key/Local State,
paths, identifiers or raw errors in logs/artifacts; only fixed case IDs, version,
booleans, finite counts and fixed outcome codes. Unknown/missing observations fail
closed and never become a capability PASS. Independent safety/schema review precedes
publication, and actual Windows evidence must match the tested commit.

## Dependency ledger and stopping point

- This source matrix is independent of user data/device access and makes no new
  security acceptance decision. All runtime observations above are NOT_RUN.
- Actual host standard-user profile/DPAPI behavior needs authorized target Windows
  testing; same-host and transfer recovery need separate identity/machine proof.
- Owner/design review still chooses backup folder, encryption/key-custody/portability
  mechanism and supported recovery restrictions. No production binding is selected.
- P0-01 host virtualization, P0-02 AVDs, P0-03..05 device/UI/video, P0-06 real load,
  P0-07 labeled OCR and P0-08 genuine pilot/policy authorization remain unresolved.
- P0-09 full dependency chain, G0-12 immutable navigation, ADR-0005 full containment,
  and Phase0 acceptance remain blocked. No Phase1 work follows from this proposal.

**Requested decision:** approve only standalone stages1–3 after the exact failure
classification/ownership/shutdown design review below. Stage4 uncertainty remains
open and outside scope; it does not block observation of stages1–3, and their PASS
cannot waive it. Otherwise retain this document as a pending proposal. No backup
implementation or production mechanism is requested.

Independent source review20:09UTC verified API/error-property and threat boundaries;
clarified availability without per-key usability, nonempty tamper negatives and
normal OS-managed DPAPI access despite owned app paths. Runtime/code remain NOT_RUN
and unapproved. Local links and whitespace checks PASS.

## Stages1–3 closure conditions — refinement requested20:10UTC

- All three processes use one exclusively created, marker-validated owned root and
  the same app profile/session paths, configured before ready; logs/crash paths
  are also owned. Ciphertext is at a fixed owned path with bounded reads and is
  neither printed nor uploaded. No app secret-store reference is persisted outside
  this disposable tree by application code; normal OS DPAPI provider access remains
  the explicit caveat above.
- Create and restart must both actually encrypt/decrypt or recover exact nonempty
  synthetic strings, with boolean rotation-hint shape checked. Availability alone
  cannot pass either. If shouldReEncrypt=true, record it without implementing a
  rotation protocol; exact recovery is still separately checked.
- [Exact app lifecycle documentation](https://raw.githubusercontent.com/electron/electron/v45.1.0/docs/api/app.md)
  distinguishes normal quit from immediate exit; it does not prove power-loss durability.
  Before each process ends, finish bounded output/file writes, request normal
  app.quit and require successful exit plus zero active owned descendants before
  starting the next. Do not use immediate app.exit as persistence proof. Timeout
  or failed orderly shutdown is nonzero/UNKNOWN, never fixed by a forced flush of
  undocumented key state. The second process's exact decrypt is the actual
  persistence observation, not an assertion that all shutdown paths are durable.
- Before each tamper negative, an intact baseline decrypt must pass in that process.
  Only native Error with exact reviewed literal
  `Error while decrypting the ciphertext provided to safeStorage.decryptStringAsync.`
  maps to DECRYPT_REJECTED. The separate temporary-unavailability literal maps to
  UNAVAILABLE and cannot satisfy tamper rejection. Unknown message/type maps to
  UNKNOWN; serialize only fixed codes, never actual text. API-not-ready, missing
  method, initialization, malformed output or timeout failures cannot count as
  tamper-denial success. Expected literals must be checked against the exact native
  branches again before implementation; this source mapping is not a public error
  enum guarantee across versions.
- Three stages each require all their positive/negative observations and verified
  Job cleanup. Final sanitized schema must enforce exact stage/case sets, runtime
  version, status/exit consistency and cleanup; duplicate/extra/missing/private
  fields or incomplete evidence fail closed. Final owned-tree deletion happens
  only after all processes are verified stopped. Stage4 and cross-user/machine
  recovery remain explicit NOT_TESTED fields, not success cases.
- Documentation-only review may publish this PROPOSED matrix. Implementation and
  trusted provisioning require separate explicit authorization and pre-code
  playbook exception; no current approval is inferred from this refinement.

Independent narrowed-scope review20:15UTC CLEAR for coordinator approval consideration:
stages1–3 only, exact native failure literal in queued/direct branches, prefix-preserving
nonempty tail mutations, positive control before each, normal shutdown plus actual
restart observation and all ownership/OS-access caveats. Stage4 remains excluded and
unaccepted. No code/runtime or experiment approval follows from reviewer clearance.

## Bounded execution authorization — 2026-10-30 21:16 UTC

Coordinator approved **only stages1–3** after source review, with the exact bounds,
normal DPAPI-access caveat and all exclusions above; playbook exception recorded
before code. This does not accept the full threat/recovery contract, production
mechanism or Phase. Historical NOT_AUTHORIZED proposal headings record prior scope;
stage4/OS revocation/portability remain NOT_TESTED and outside execution authority.
