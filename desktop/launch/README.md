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
