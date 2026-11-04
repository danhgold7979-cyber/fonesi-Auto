# P2-02 retained VERSION transport — local source checkpoint

2026-11-01. Local implementation only under the reviewed
[finite contract](../phases/P2-RETAINED-HOST-INTEGRATION-CONTRACT.md).
Remote publication remains held for phase batching. This is progress on canonical
**P2-02 ADB server lifecycle (task 2 of 13)** and its P2-01 runtime-custody dependency,
not completion of either task, a new acceptance denominator, or server/device evidence.

## Implemented path and exact files

- `desktop/native/PersistenceProcess.cs`, `desktop/launch/launch-core.ps1`,
  `Invoke-Desktop.ps1`, `Invoke-Package.ps1`: default-off normal-launch opt-in,
  exclusive nonce-named outer Job, suspended assignment and native-handle parent
  receipt before resume. Old anonymous routes retain their exact derivation checks.
- `desktop/native/RetainedHostAdmission.cs`: exact parent PID/creation FILETIME/image
  binding and transient QUERY-only exact Job membership/flags check. The query handle
  is closed before admission; only the parent process handle remains for liveness.
- `desktop/native/RetainedAdbProtocol.cs`: bounded continuous canonical request
  reader with VERSION/cleanup only, real provider adapter, bounded workers and
  latest-completion retirement semantics. `tests/fixtures/RetainedAdbProtocolFixture.cs`
  contains eight managed causal groups, **authored but not executed**.
- `desktop/src/main/adb-host-context.ts`, `adb-host-factory.ts` and
  `desktop/launch/Invoke-RetainedHost.ps1`: exact private assets/bootstrap, ordinary
  fixed private-stdio spawn, existing bridge/adapter composition, fresh runtime read
  custody, and bounded owned helper-root cleanup. The factory is not activated by main
  and exposes no renderer/IPC command or arbitrary executable/argv interface.
- `desktop/launch/launch-journal.cjs`: exact companion and bounded helper inventory;
  retained helper roots refuse release/recovery rather than being inferred retired.
- Build/module/package lists add exactly the private factory output and fixed native/
  bootstrap inputs. SOURCE and PACKAGE closure are authored, not newly native-certified.

The remaining remote response Flush/bookkeeping has no native effect authority and
belongs to helper/persistence lifetime. Receiving a complete correlated response does
**not** prove that remote worker retired. Runtime release additionally requires native
terminal evidence and completed parent request write. A subsequent native Reserve
waits for prior worker/output settlement. Only the sole clean bootstrap exit path plus
actual child/stdio closure permits helper cleanup; abnormal exit remains UNRETIRED.

## Checks and repairs

One author owns the integration checks. **Complete 122-file inventory checked as a
stitched local checkpoint**, not an uninterrupted aggregate PASS or a fresh Windows run:
- Corrected full pipeline passed metadata, installed dependencies, module graph,
  quality, TypeScript, production/demo builds, verified manifest and test batches1–12
  (96 files), then stopped at two stale shared launcher hash pins in batch13.
- After exact shared core/wrapper pin updates, batches13–16 passed **49/49,45/45,
  47/47,10/10** (151 tests, remaining26 files; zero fail/cancel/skip/todo).
- The earlier single stale helper pin in the launcher test was corrected and its
  affected1/1 passed before that full pipeline.
- The demo launcher's same stale helper pin was also corrected. Targeted demo build
  refreshed its registered input and verified; demo-contract6/6 passed. Production
  build verification remains true. Final quality inventory and diff checks passed.

No uninterrupted total test count or `DESKTOP_SOURCE_CHECK_PASS` marker is claimed for
this stitched checkpoint. Independent review checked all original119 test paths are
retained in order, exactly three added paths, no duplicates and all24 verification
entries intact. Independent source/causal-test review and exact inventory comparison are separate from the
sole author's integration run; they are not a second aggregate.

Affected checks exercised actual owned files and the actual journal initializer,
factory/bridge/adapter composition with injected OS/native/custody facts. They cover
fixed spawn/bootstrap bytes, separate helper retirement, changed runtime refusal,
abnormal exit, immutable receipt/assets, marker-last and type-closed cleanup,
reentrant shutdown, private diagnostics, retained predecessor refusal, and missing/
changed/replaced launch marker/directory refusal. C# source/parity checks use actual
TypeScript bridge request bytes but do not execute managed code.

Independent review closed concrete findings: wrong `.launcher-current` filename
(replaced by the sole actual `.launcher-current.json`), predecessor helper exclusion,
launch marker/device-inode binding, marker-last cleanup, stale reader terminal state,
and the explicit native-versus-output lifetime partition. A proposed historical READY
concern was retracted after verifying current-pointer ordering; no historical API or
stale-READY fallback was added.

The first integration aggregate stopped in batch 7 at 43/44: the launcher test still
pinned the old helper SHA. Only that test literal was updated to the reviewed native
source SHA; its affected test passed. Final diff review also caught an unintended
removal of 24 verification test registrations; all original entries were restored,
leaving only three additive test registrations. No truncated suite was accepted.
Because the interrupted runner did not retain per-batch pass counts, the corrected
complete inventory was restarted once. That run reached batch13, exposing the shared
core/wrapper hash pins; the final remaining batches were then checked separately as
listed above rather than replaying the already-passed96 files. Shared exact pins and
historical helper smoke/demo pins now match reviewed current sources; derivations,
acceptance and default-off opt-in behavior are unchanged. Existing native artifacts
remain evidence for their original bytes only, not the newly bound runners.
An initial formatter invocation mistakenly passed the binary to Node; it failed before
formatting, then the direct formatter invocation succeeded. No product predicate was
changed for these tooling failures.

Unchanged foundation109 and Python214 results are carried forward from exact public
`e5680a2f8934a747e6fd45bada7340b0e3331f0f`, CI41287763437, not fresh local reruns.
[That actual compile-only evidence](P2-retained-helper-compile-preparation-2026-11-01.md)
applies to the original unchanged IsolatedAdbServer/RetainedAdbSession pair only.

## Frozen source fingerprints

| File | SHA256 |
|---|---|
| adb-host-factory.ts | b2050fff1d6ac01b5270421c440aba524fc0121bfb619c329089d8ba42827d77 |
| adb-host-context.ts | 6be681ce154c5d3e72e1b11374cab7a848bcaa60b41d57db06607d1f40ce9a01 |
| Invoke-RetainedHost.ps1 | 11e2b2e441aa720fb29694321b8203ed1236db80ffe0dcb556218942b2045a5d |
| PersistenceProcess.cs | 7005eaa51de202d1138828254b766a48af2bb9305823a50076165efd4fe422fe |
| RetainedHostAdmission.cs | 2e5602d3965b753ae536cf51a9467af77e59fc1b477ae06029dcfbd56e9c3110 |
| RetainedAdbProtocol.cs | 21fd676ad24e9bb3eeae12831c93100ed868736399ebf120be7c9eac2a038888 |
| launch-journal.cjs | a10975261a84d85cea8dc8e476d3fb594df80b0d64ede445438dc27408fb53cf |

## Remaining proof and authority

New C# sources: **NOT_COMPILED/NOT_EXECUTED**. Actual PowerShell bootstrap, private pipe,
parent/Job admission, EOF retirement and fixed VERSION invocation: **NOT_RUN**.
A later necessary hosted-test exception or coherent phase publication must establish
those facts with exact reviewed tooling. No automatic new CI or micro push is implied.
The existing-profile server refusal remains intact; no profile adoption/deletion,
redirect, account/token workaround, server start, device action, genuine recipient
consent or new legal/distribution approval is claimed. P1-06 cross-user, hardware and
formal acceptance gaps remain unchanged. No full P2 task count is increased.
