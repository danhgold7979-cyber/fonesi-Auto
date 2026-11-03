# P2-02 — isolated owned-server development proposal

**SOURCE DESIGN APPROVED — 2026-11-01 03:15 UTC; native execution NOT_RUN.**
Coordinator approved implementation and synthetic tests for this hosted-only design.
The first actual server run still requires exact runner review. No personal host,
existing keys, device access or persistent credentials are authorized. If an action
tool identifies a persistent-access/privacy concern, stop that operation and continue
independent work. This records the next finite development design under the
[software-first entry](PHASE-02-SOFTWARE-FIRST-ENTRY-PROPOSAL.md), not approval to
start a server or write an actual Windows user profile. Coordinator review of that
new host-profile effect and the exact runner is required before execution. No
canonical P2-02 acceptance, production activation or hardware evidence follows.

**Current execution disposition:** after exact source/envelope review and the sole
688-test aggregate, coordinator Coder Bin approved the first bounded hosted run at
03:24UTC. See the [exact hashes and approval](../evidence/P2-02-isolated-server-development-2026-11-01.md).
The source-design prerequisites above describe the earlier stage; native execution
is still NOT_RUN at this commit, with no personal-host/device or production authority.

## 1. Candidate and fixed operation

Reuse the already inspected official Windows Platform Tools 37.0.1 candidate:
[versioned archive](https://dl.google.com/android/repository/platform-tools_r37.0.1-win.zip),
8,044,989 bytes, SHA256
`45f4d63113e895ebde0c90f194099a4676b6ac653bd28d54314a9e022bbc1a99`.
The exact 14-file, 17,529,398-byte inventory and PE32/I386 executable/DLL hashes
remain `desktop/verification/platform-tools-candidate.json`. Revalidate physical
bytes before and after use. No duplicate download, install, PATH fallback, release
bundling or inference of redistribution approval. The separate
[P2-01 version evidence](../evidence/P2-01-platform-tools-development-2026-11-01.md)
does not authorize server startup.

Only the verified absolute `adb.exe` may execute, with this fixed grammar:

```text
-L tcp:127.0.0.1:<supervisor-owned-port> server nodaemon
```

The supervisor chooses the bounded port, never a renderer/caller address. No
`start-server`, `kill-server`, `devices`, `connect`, `pair`, transport selection,
shell, emulator or device command. Health uses only a bounded direct smart-socket
`host:version` request after custody admission, not another ADB client invocation.
The official [command parser](https://android.googlesource.com/platform/packages/modules/adb/+/fb529d52f4485c1fdbe6208f20af6578493e1ca7/client/commandline.cpp)
supports foreground `server nodaemon` and `-L`; the
[service protocol](https://android.googlesource.com/platform/packages/modules/adb/+/refs/heads/main/docs/dev/services.md)
distinguishes host version from device services and global server termination.

## 2. No automatic device-discovery authority

Use a captured narrow environment with exact `ADB_USB=0`, `ADB_EMU=0` and
`ADB_MDNS=0`; remove inherited serial, vendor-key, server-endpoint and discovery
settings. Do not substitute `ADB_LIBUSB=0`, `--one-device` or mDNS auto-connect
settings: those do not establish absence of all discovery.

Official [server startup source](https://android.googlesource.com/platform/packages/modules/adb/+/refs/heads/main/client/main.cpp)
(blob `50a60a7bc1d6ddd62bcc1320cc120cc7fb7ae851`) gates USB and emulator initialization
on the first two exact zero values. Official
[mDNS source](https://android.googlesource.com/platform/packages/modules/adb/+/46de3b3842edd47ac4df7bfd688f242f218abd9c/client/mdns_utils.cpp)
gates discovery on `ADB_MDNS`. These names occur in the pinned binary, but neither
strings nor moving-source inspection prove exact binary control flow. Exact-candidate
suppression remains an explicit evidence limitation. Hosted development may use an
environment with no provisioned real devices and verify configured suppression;
proving binary control flow from strings is not an execution prerequisite. No
claim of verified physical-device noninteraction or wireless readiness is permitted.

## 3. Actual Windows profile and new-key custody — separate authority gate

Do **not** assume changing `USERPROFILE`, `HOME` or `ANDROID_*` redirects server
authentication. Official [Windows home resolution](https://android.googlesource.com/platform/packages/modules/adb/+/1bacec0a271e494d149d5e46f745b04a3c5c7a19/adb_utils.cpp)
uses the native profile folder and appends `.android`. This inspected commit is not
asserted to be the pinned binary's exact source. Current official
[authentication source](https://android.googlesource.com/platform/packages/modules/adb/+/HEAD/client/auth.cpp)
(blob `5b837526498846a9c902685cba083a3d6fc94a98`) initializes the default `adbkey`
even without vendor keys; absent keys may cause private/public key generation.

Proposed hosted-only prerequisite, requiring explicit coordinator approval:

1. Resolve the current process user's actual Windows KnownFolder/profile through
   the native API, without changing identity, token, ACL or privileges. Verify the
   canonical regular directory ancestry and agreement with the relevant native
   profile resolution; uncertainty refuses launch.
2. Require its `.android` entry to be completely absent, including dangling links
   or reparse points. **Any preexisting entry refuses this test**; never adopt,
   read, rename, replace or delete an existing user's ADB keys or directory.
3. Exclusively reserve that absent `.android`, create a fresh exact ownership
   marker, and retain bounded directory identity/marker witnesses before launch.
   This is a disclosed write outside the ordinary temporary run root, not an
   environment-only isolation claim. Use only the already authorized ephemeral
   hosted CI user's profile; no personal workstation fallback.
4. After whole owned Job retirement, admit only the unchanged marker plus newly
   created regular, single-link `adbkey` and `adbkey.pub`; total at most 64 KiB,
   three entries, no subdirectories. Bound and witness bytes/identity privately;
   never publish key contents, paths or digests. Missing/unexpected files or
   ownership changes fail and preserve the directory for reviewed disposition.
5. Only after every expected identity and inventory check succeeds, remove those
   exact newly owned key files, marker last, then the empty directory. No recursive
   deletion, adoption, retry-unlock or deletion after uncertain retirement.

No SDK setup, accounts, services, tasks, drivers, ACL edits, privilege acquisition,
USB authorization, pairing or P1-06 identity retry is included.

## 4. Process and endpoint custody

A dedicated reviewed native coordinator must preserve the frozen suspended-launch,
explicit handle list, owned Job and bounded capture design. The existing blocking
`NativeProbe.Run` alone cannot establish live listener custody while waiting for
root exit. No shell, generic command service or global process enumeration/kill API
is added to application IPC.

Before launch, refuse an occupied selected loopback endpoint without contacting or
terminating its owner. That precheck is not ownership: after launch correlate the
exact loopback listening socket with the still-live owned process handle/PID and
Job membership, rechecking before each health request. PID/port alone and a free-port
check followed by bind are insufficient. A collision race, wrong listener, premature
exit or ambiguous correlation fails closed; terminate only our retained Job handle,
never the process currently using a port. No foreign server version negotiation or
replacement is attempted. Loopback is not authentication against arbitrary local
clients; this bounded development test does not claim hostile-local-user isolation.

Use a 30-second startup/health deadline, at most 120 seconds for the entire owned
operation, 10-second retirement cleanup, captures at most 32,768 characters per
stream, and health response at most 64 KiB with strict framing. Timeout does not
cancel already-issued I/O or prove retirement. Stop by owned Job retirement, labeled
forced stop rather than an orderly ADB shutdown; then verify endpoint disappearance
without adopting any successor listener. Uncertainty latches failure and retains
private evidence/profile ownership. No automatic replay.

## 5. Finite evidence and stopping conditions

Source-only work may define the exact adapter, custody predicates and synthetic
transport tests without creating sockets or executing the candidate. Hosted work
requires separate exact-source/runner review and execution approval. Proposed cases:

- occupied synthetic loopback endpoint refused and its owner unchanged;
- owned foreground process, listener correlation and fixed `host:version` observed;
- deliberate owned-process death after health, and a healthy server held to its
  fixed deadline then forcibly retired; this is not proof of hung-health handling;
- whole Job retirement, endpoint release, candidate byte equality and exact newly
  owned profile cleanup observed, or truthful failure with retained evidence.

Use existing development run-tree limits: 64 MiB, 256 entries, depth 8; the native
profile partition has its separate stricter bound above. Validate all cleanup
partitions before deletion. Fixed public booleans/codes and process facts only;
raw captures, endpoint/owner identifiers, keys and paths remain private and are not
uploaded. No device data, screenshots, benchmark, feature activation or task-count
increase. **Server execution, native endpoint custody and profile cleanup are NOT_RUN
for this proposal.** Exact runner review must confirm the approved absent-profile
custody and configured suppression in the device-free hosted environment. This does
not require an invented proof of binary control flow, nor block independent pure work.
