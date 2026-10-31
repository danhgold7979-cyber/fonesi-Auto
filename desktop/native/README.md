# Persistence first-launch process ownership

`PersistenceProcess.cs` is a development-reviewed derivation of the repository's
frozen `tools/phase-00/HostProbeNative.cs`, SHA-256
`b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89`.
The original file is unchanged. No external/native package was added.

## Exact API and limited changes

Namespace `Fonesi.Desktop.Persistence`; class `PersistenceProcess`; result
`PersistenceProcessResult` retains the existing fixed status/exit/capture/cleanup
fields. The trusted production launcher, not renderer IPC, may call:

- `RunBounded(executable, arguments, timeoutMilliseconds)`: accepts only 30,000 or
  120,000 milliseconds for initialization/maintenance operations.
- `RunInteractive(executable, arguments)`: waits with Win32 `INFINITE` for the
  normal application's root process to end. **No 120-second normal-UI kill.**

Both retain 10,000-ms cleanup/drain budget and 32,768 captured characters per
stream. Capture readers continue draining after the retained-character cap;
truncation is explicit. The UI lifetime is unbounded, not its captured buffer.
Cleanup begins after root termination, or a launch/wait failure; bounded mode
also enters cleanup after its deadline. Root exit is not proof of graceful app
shutdown: callers must separately verify application evidence. Remaining Job
children are always retired before `CleanupComplete` can be true. A caller must
retain the persistent store lease until this retirement is confirmed, and must
preserve uncertain ownership on failure/launcher interruption.

The only source changes are names/header, removal of `RunCmd`/its regex import
and raw command-tail branch, explicit bounded/interactive entry methods,
`INFINITE` and unsigned wait timeout, fixed limit checks and rooted `.exe`
validation. `Path.IsPathRooted` alone also accepts Windows drive-relative or
root-relative forms; the caller must require the fully qualified exact selected
executable path before invoking this helper. C-runtime argument quoting, explicit inherited handle list,
suspended launch → non-breakaway kill-on-close Job assignment → resume, pipe
ownership, background drain, termination/Job-empty verification and disposal
remain byte-equivalent after these documented substitutions. `ReserveDirectory`
and `QuoteArgument` are unchanged trusted helpers, not application services.

The launcher still selects and verifies exact executable bytes, fixed arguments,
working-directory implications, and inherited environment. This is **not** an
arbitrary executable sandbox, shell service or hostile-local-editor defense.
There is no CMD/batch API. Killing the supervisor closes its Job handle but is
not permission to assume lease cleanup was confirmed.

## Evidence limits

`desktop/tests/persistence-process.test.mjs` checks the entire precise derivation
against the frozen source hash and the lifetime/API policy. These are source
regressions, **not** C# compilation or kernel execution. Windows PowerShell
`Add-Type`, native bounded/interactive behavior and launcher integration require
subsequent reviewed Windows evidence. No full P1-05/Phase or target-host
acceptance follows from this file.
