# Source-only developer launch supervision

`Invoke-Desktop.ps1` is a trusted Windows PowerShell entry, not a renderer/IPC
service or the Phase 1 installer/package distribution. Its current source review
must not be confused with executed Windows first-use evidence.

The entry accepts **either** `-CreateUnder <existing fully qualified directory>`
or `-Root <existing owned root>`. The former reserves a new
`Fonesi-Auto-<UUID>` directory and marker; the latter never resets an existing
store. Optional `-Maintenance` accepts exactly the five canonical literals:
`--maintenance=backup-now`, `--maintenance=list-backups`,
`--maintenance=restore-to-new`, `--maintenance=accept-upgrade`, and
`--maintenance=select-backup-folder`. It rejects noncanonical/relative paths and
reparse ancestors; this is a conservative local path policy, not a hostile
concurrent-filesystem guarantee.

Before creating store directories, the launcher pins the reviewed native helper
hash, refuses a preloaded helper type, selects the actual Node application and
checks its exact reviewed Windows 24.22.1 executable hash. It verifies the existing
official Electron runtime inventory/head and current build through the reviewed
control helper. It neither downloads nor installs a runtime and does not accept
an arbitrary unverified `electron/dist` directory. The prerequisite attestation
must originate from the reviewed installer path; this is not manifest authenticity
against a hostile local editor.

An exclusive `launch-<UUID>` child holds private control/capture evidence. The
parent-owned control adapter handles setup, native provision/auth observations,
READY preparation and release; native dialogs run in the initialization adapter.
The supervisor itself never substitutes a filesystem reset or a fake key proof.
Control/provision/auth operations have a 120-second process deadline. Normal UI
uses `RunInteractive` with **no application lifetime deadline**; only canonical
maintenance uses a bounded main lifetime. Every invocation narrows process-local
environment and restores it in `finally`, without modifying user/machine settings.

The store lease is retained across native stages and the actual main process.
Release is attempted only after successful or cancelled initialization/normal
shutdown and confirmed whole-Job retirement with bounded capture. Nonzero exit,
uncertain cleanup, failed control or capture failure retains the root and lease
for explicit recovery; the script never automatically deletes persistent roots,
profiles or evidence. Root exit alone is not orderly-close evidence: the control
adapter must validate the exact captured application markers before releasing.
Normal lifecycle logging uses `root/logs-main` (the approved `logs-*` policy).

Only fixed status codes are printed. Native stdout/stderr and private identities
remain in exclusively created bounded launch files, never emitted/uploaded by
this entry. Initial folder selection/cancellation and persistence/key proofs are
separate adapter responsibilities; no target-host support, full P1-05 acceptance,
portable-key claim or genuine-human-intent proof is established here.

`persistence-launcher.test.mjs` checks source admission/order/argument/lifetime and
no-raw-console policies. These source regressions do not execute PowerShell,
compile C#, launch Electron, verify native dialogs or prove kernel behavior.

## Settings corruption and explicit recovery

A malformed CURRENT/PREVIOUS settings row is never repaired during normal startup.
Startup reports the fixed `BOOTSTRAP_FAILED` marker and preserves the database;
`RECOVERY_REQUIRED` is the typed result for an already-open settings adapter, not
a promised startup marker. For an existing admitted FRESH developer root with no
uncertain prior owner, the explicit operation is:

```powershell
.\desktop\launch\Invoke-Desktop.ps1 -Root <existing-owned-root> -Maintenance '--maintenance=restore-to-new'
```

This path authenticates the retained key/bootstrap proof without opening active
SQLite, asks for one encrypted backup inside an existing owned configured location,
then a destination parent and Cancel-default confirmation. It validates the exact
receipt/container again before creating a NEW quarantined root; it neither repairs
nor overwrites the source database/vault, and does not resume normal external work.
The current source launcher still admits its documented FRESH/data-main layout;
arbitrary restored-root launcher support is not implied.

A retained writer lock or uncertain process retirement is a blocking ownership
condition. Do not delete a lock, reset a profile, or rerun with a forged owner token.
The existing trusted supervisor must establish complete retirement and valid
owner admission before another recovery process can run. The native recovery
verification uses that explicit supervisor-held lease; it is not stale-owner stealing
or a claim of automatic recovery from unknown ownership.

The current developer launcher has **no** stopped-owner recovery command for a lock
retained after a failed normal launch. Therefore simply rerunning the command above
after that failure is not a supported recovery procedure. Closing that failed-launch
to relaunch usability gap is explicitly retained for P1-10 launch supervision, with
the P1-08 UI handoff; it is not waived by the bounded P1-07 actual-main restore proof.
Do not treat this checkpoint as complete end-user/tool recovery.
