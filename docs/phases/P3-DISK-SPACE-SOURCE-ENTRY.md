# P3-11.B owned data-volume disk-space entry

Prepared 2026-11-03 22:35 UTC. **ADOPTED: independent entry review CLEAR 2026-11-03 22:36 UTC.**
Reviewed draft SHA256 `58d169d2bfecf115ec958628c841ef518ae8fcb374ad38890ab829275b2d40eb`;
coordinator assigned implementation after review. No source/runtime result is implied.
Repository danhgold7979-cyber/fonesi-Auto, branch phase-03, base
`3b2ed1746cea2ff111d251d1c2699b420ce53d2b`, tree
`c9c6ddab68d85aa3d78c59c2269640d5e21c1870`. Worktree starts clean.
Coordinator assigned this scoped continuation under existing software-first engineering authority.
Only Phase03 and Phase10 are active; Phase07 is closed and Phase11 parked.
This does not accept a phase or waive predecessor, P1-06, hardware or release gates.

## Behavior and authority

Extend the existing explicit Read CPU/RAM action to also read available and total
bytes on the filesystem containing the already-opened main-owned persistent data
directory. This is one application-data volume, not all disks, the user's media
folder, the executable volume, a device, quota promise or I/O pressure estimate.
No polling, disk enumeration, write, free-space reservation, thresholds, stream
settings mutation, new dependency or phone operation.

The sampler receives a main-only callback that checks the existing prepared
persistence lease and returns opened persistence.root; absent persistence returns
null. It is called before spawn and again before publishing a successful result.
A lost/changing owner/root invalidates the operation. No arbitrary renderer path,
environment fallback, cwd, Electron profile, native picker or userData fallback.
CPU/RAM remains available with null/unavailable disk metrics when persistence is absent.
Only the worker receives the private path. Never copy the path, volume label,
drive letter, hostname, exception text or native error details into a public sample,
UI, logs or published test evidence. Revalidate directory identity in the worker;
symlink/reparse alias or non-directory is refused. This is a read-only ownership
guard, not a claim against a concurrent malicious filesystem swap.

## Wire and sampling

Deliberately move this internal bundled host-resource channel and request/response/
worker sample to v2. The whole app bundle is manifest-bound; this is not a persisted
wire migration or a change to foundation public IPC v1/v2. Strict schemas reject v1,
unknown keys, path/pid selectors, duplicate keys and wrong metric identities.
Retain the same SAMPLE/CANCEL methods, shared invocation budget, one-worker lane,
3-second deadline, owner/session fences and actual worker-exit retirement.
Cancellation and timeout request termination but never release a worker lane early.
Capture the monotonic start before the main ownership callback and recheck elapsed
time after that callback, before spawn and immediately before publication. Existing
synchronous OS lease reads are not claimed to have a hard latency bound; disk statfs
and directory checks run only in the worker. A late ownership check cannot extend
the deadline or fresh lifetime.

Keep CPU/RAM metrics and add availableDisk and totalDisk with BYTES, NODE_FS_STATFS
and APP_DATA_VOLUME identities. Both disk values come from one BigInt statfs result:
bavail*bsize and blocks*bsize, requiring positive block size/total blocks,
nonnegative available blocks <= total blocks, valid BigInt types and products <=
Number.MAX_SAFE_INTEGER before conversion. Genuine available zero is valid; failed,
missing, inaccessible or invalid probes produce null and a fixed reason, not zero.
Probe only during the final collection, within the observed sample start/end window.
Retain the existing conservative freshness measured from request admission; neither
native delay nor renderer IPC transit grants a fresh five seconds. Retained values
keep original sample timestamps and visibly become STALE/NOT CURRENT.

Show both disk readings with an explicit application-data-volume scope label in the
existing performance panel. Remove the duplicate disk-free UNKNOWN card only when
the host slot is present. Keep disk I/O separately UNAVAILABLE (no supported adapter),
not conflated with disk free. Preserve Dark/Light shell, geometry, panel controls,
close/reopen/cancel behavior, existing source labels and non-current errors.

## Planned changes and verification

Source: host-resource contract/client/worker/sampler, main construction, renderer
and existing UiShell host slot; exact module/build manifests as required.
Tests: existing host-resource suite plus pure BigInt boundaries, missing/inaccessible
root, zero/overflow, independent CPU/RAM survival, path privacy, ownership changes,
closed schemas, cancellation/deadline/late exit, stale/out-of-order response, repeat
Read/Cancel and close/reopen. Actual source integration must remain attributable.
Run approved quality/strict/module/build/full source checks on frozen final bytes.
Capture before/after Dark/Light views at equal viewport with the existing supported
owned rendering workflow; visual limits remain explicit if unavailable.

Add a bounded source-only Windows CI entry on phase-03. It runs aggregate source and
an actual bundled-worker read against a freshly created test-owned local directory,
not a user computer/device. Native Electron acceptance, managed/native video
campaigns, signing and package release are not part of this CI. Record exact head,
platform/Node version and observed results; Linux or synthetic tests cannot stand
in for Windows runtime evidence. No baseline failures are hidden or automatically
retried as unrelated native repair.
Compare Windows total bytes with the independent statfs result; free space may
change between reads, so verify each reading's bounds rather than false equality.

Reference: Node 24 statfs documentation, https://nodejs.org/docs/latest-v24.x/api/fs.html#fsstatfssyncpath-options.
Documentation establishes API semantics only; shipped-version behavior requires
tests. No dependency/runtime pin changes are proposed.

## Acceptance boundary

Independent final source/privacy/criterion review precedes commit/publication.
P3-11.B's fixed definition and denominator are unchanged. Disk-I/O remains an
explicit unsupported capability; do not automatically credit the full cell or task.
No source count is added until the independent criterion audit identifies exactly
what the frozen implementation and tests prove. Full P3-11, Phase03 and product
acceptance stay open; no fabricated live freshness or hardware support.
