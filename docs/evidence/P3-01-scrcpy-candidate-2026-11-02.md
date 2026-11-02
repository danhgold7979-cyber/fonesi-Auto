# P3-01 — scrcpy 5.0.1 candidate inspection (2026-11-02)

## Status and scope

**Metadata-only candidate; runtime NOT ADMITTED.** No application source or runtime
admission has been implemented by this inspection. The official ZIP was downloaded
by the coordinator and inspected in memory; this report independently re-read its
bytes, recomputed the archive and all member SHA-256 values, and matched the retained
inventory. No executable was extracted, installed or executed; no phone payload,
stream, input, server, profile or device operation occurred. This is not P3 acceptance.

## Official provenance and measured artifact

- [Official release](https://github.com/Genymobile/scrcpy/releases/tag/v5.0.1):
  release ID `406503257`, published `2026-10-08T06:44:27Z`, tag `v5.0.1`.
  Release API records `immutable:false`; retained digests, not the mutable release URL, bind these bytes.
- Annotated tag object `a0c27ff382c411af1301dcc1cd8205c9aeb81996` resolves to
  source commit `a60891aea193d92e7e5c3942700eca63f9d19a5f`. GitHub reports signature
  verification `true/valid`; no independent local GPG verification was performed.
- Official asset `scrcpy-win64-v5.0.1.zip`, ID `620992965`: measured **11,264,634 bytes**,
  SHA-256 `b12a2c4ee8be317422451fc7dcf8ee20a71b5ea7ef9ad73ddd825a25316227a5`.
  This matches release metadata and the pinned Windows download documentation.
- ZIP: **17 entries, 16 files, 26,206,780 uncompressed bytes**, one enclosing directory
  `scrcpy-win64-v5.0.1/`. The server member is **733,930 bytes**, SHA-256
  `764eb6f79811d5211fe9df341120882ba9994c7a61b897d7bf3fb662e53bc536`, matching official
  standalone server asset ID `620992900` metadata (not a separate local asset download).
- Research inputs remain outside the repository at `/tmp/auto-p301-research/`:
  ZIP, `upstream-metadata.json`, `inventory.json`, `pe-imports.json`. No binary or
  whole license text is copied into this report/repository.

### Complete measured file inventory

PE labels below describe headers, not host compatibility: AMD64=`0x8664/0x20b`,
I386=`0x14c/0x10b`; dash means no PE header recorded.

| File | Bytes | PE | SHA-256 |
|---|---:|---|---|
| `AdbWinApi.dll` | 108184 | I386 | `c1d653030b4bde65d3e07e4d0b0979e17be56df1436cdd15528630f27808050d` |
| `AdbWinUsbApi.dll` | 73368 | I386 | `0710e894d9b40f71a670c13c694079d564c92c1279da382cfe4850983aaebe1b` |
| `LICENSE.txt` | 11387 | — | `01c12035bf35af37241298dc7ad538eb2a07e5c940437bc6876feeaa9d1951d0` |
| `SDL3.dll` | 5384859 | AMD64 | `288aaf5b4f246bd84c276351867e3132cfcd9b0a9d25fb679c8d94b30cdf333e` |
| `adb.exe` | 8273560 | I386 | `b4a6b455702684652cccf7b46258b29e653538904359a58fd4931cf3ef286b3f` |
| `avcodec-63.dll` | 8685568 | AMD64 | `159928e3bbe7beaca046ccf831fdf44f1e5559c0e63417f007889a6bb2c5de88` |
| `avformat-63.dll` | 743424 | AMD64 | `4dbb0c1c8262f7ae45e7edc4866e26f53b358bf4fc7a0b971f15d1f2d7baf22f` |
| `avutil-61.dll` | 1047552 | AMD64 | `52eb504ced0ea6d9e936d348df51c8aaeec1cae8fa4a7dba339fea87d7cce725` |
| `disconnected.png` | 4703 | — | `e394873cd3e2cc3ab0cca6212b10ed2a8a0fad11a05675c8a9fa6f26f3ae12c0` |
| `libusb-1.0.dll` | 227005 | AMD64 | `0c82e969c046d816507a2fe1e57253a334cb203bd6ea223194ad17c007154f32` |
| `open_a_terminal_here.bat` | 5 | — | `843758795a84d0d035a7d277ad29cc1ff1702048b4b61ae74b9e3439ae683423` |
| `scrcpy-noconsole.vbs` | 212 | — | `3ccda94c161f18cef07c50d4d3c4913eb883d4b0fe3b939c35fae52784fb1d2b` |
| `scrcpy-server` | 733930 | — | `764eb6f79811d5211fe9df341120882ba9994c7a61b897d7bf3fb662e53bc536` |
| `scrcpy.exe` | 766717 | AMD64 | `64bcee493d9243dab1e84093928014348738e31f3225e67558210e6b6cfb9cd6` |
| `scrcpy.png` | 6530 | — | `8e8ca237898faa16014cdd118396af53405b423f3db0508c50cc3edce08eb313` |
| `swresample-7.dll` | 139776 | AMD64 | `7b57e891bf09c43422d79f98cf9d1830c4b1d48a251423ce5fb8c2048eb8fc1e` |

Seven PE files are AMD64; the bundled `adb.exe` and two ADB DLLs are I386.
The ordinary import directory of `scrcpy.exe` names the six bundled AMD64 DLLs
(SDL3, avcodec, avformat, avutil, swresample, libusb) plus Windows libraries.
This static import inspection does **not** establish delay-loaded/runtime module
closure, signatures, minimum Windows compatibility, runtime integrity or license completeness.

## Pinned source behavior and integration blockers

1. [CLI flags](https://github.com/Genymobile/scrcpy/blob/a60891aea193d92e7e5c3942700eca63f9d19a5f/app/src/cli.c#L620-L637) and the
   [server implementation](https://github.com/Genymobile/scrcpy/blob/a60891aea193d92e7e5c3942700eca63f9d19a5f/server/src/main/java/com/genymobile/scrcpy/Server.java)
   distinguish `--no-control` (no controller/input forwarding) and `--no-audio`
   (no audio capture/forwarding) from playback-only switches. Neither makes the
   client effect-free. `--no-cleanup` exists but disables removal/restoration;
   it does not suppress startup payload writes and is not an ownership solution.
2. [Client startup](https://github.com/Genymobile/scrcpy/blob/a60891aea193d92e7e5c3942700eca63f9d19a5f/app/src/server.c#L910-L923) unconditionally invokes
   `adb start-server` before device enumeration. [ADB executable selection](https://github.com/Genymobile/scrcpy/blob/a60891aea193d92e7e5c3942700eca63f9d19a5f/app/src/adb/adb.c#L28-L51)
   honors `ADB`; Windows otherwise falls back to `adb`. Removing bundled ADB and
   fixing an absolute reviewed ADB path is necessary but **insufficient**: it does
   not remove startup/replacement authority if the owned server is lost.
3. [Pinned tunnel documentation](https://github.com/Genymobile/scrcpy/blob/a60891aea193d92e7e5c3942700eca63f9d19a5f/doc/tunnels.md#L8-L47) supports
   `ADB_SERVER_SOCKET` for endpoint targeting; `--tunnel-host/--tunnel-port` refer
   to the scrcpy forwarding connection, not proof of ADB server ownership.
   `ANDROID_ADB_SERVER_PORT` is not established here as a scrcpy-owned custody
   mechanism; any handling by a selected ADB binary needs its own exact review.
4. [Device selection](https://github.com/Genymobile/scrcpy/blob/a60891aea193d92e7e5c3942700eca63f9d19a5f/doc/connection.md#L1-L48) uses serial/USB/TCP selection;
   [actual commands](https://github.com/Genymobile/scrcpy/blob/a60891aea193d92e7e5c3942700eca63f9d19a5f/app/src/adb/adb.c#L247-L317) use `-s serial` for
   forwarding/reverse/push. The inspected CLI has no `--transport-id` option;
   these paths do not preserve the application's sealed current transport-ID binding.
5. [Payload startup](https://github.com/Genymobile/scrcpy/blob/a60891aea193d92e7e5c3942700eca63f9d19a5f/app/src/server.c#L17-L65) writes
   `/data/local/tmp/scrcpy-server.jar`, establishes a tunnel and remotely starts
   the server. Video-only flags do not authorize these device writes/execution,
   payload cleanup, process custody or device association. They are not proof of
   physical identity, coordinate authority or observed input effects.

## Component/license inventory — mapping still pending

The [Windows build](https://github.com/Genymobile/scrcpy/blob/a60891aea193d92e7e5c3942700eca63f9d19a5f/release/build_windows.sh) and
[packager](https://github.com/Genymobile/scrcpy/blob/a60891aea193d92e7e5c3942700eca63f9d19a5f/release/package_client.sh) combine the client, separately built
server, DLLs and ADB components. Pinned dependency scripts specify:

| Component | Pinned source/build declaration | License evidence / unresolved boundary |
|---|---|---|
| scrcpy client/server | 5.0.1 | [Apache-2.0](https://github.com/Genymobile/scrcpy/blob/a60891aea193d92e7e5c3942700eca63f9d19a5f/LICENSE); not a license for all archive components |
| SDL | [3.4.18](https://github.com/Genymobile/scrcpy/blob/a60891aea193d92e7e5c3942700eca63f9d19a5f/app/deps/sdl.sh) | [zlib-style notice](https://github.com/libsdl-org/SDL/blob/release-3.4.18/LICENSE.txt) |
| FFmpeg | [9.0.2, shared selected-codec build](https://github.com/Genymobile/scrcpy/blob/a60891aea193d92e7e5c3942700eca63f9d19a5f/app/deps/ffmpeg.sh) | Exact configuration, corresponding source and applicable LGPL/GPL obligations must be mapped; no whole-bundle conclusion |
| zlib | Windows FFmpeg build enables zlib with static dependency flags; embedded FFmpeg configuration corroborates `--enable-zlib` | Exact linked version, source and notice mapping remain UNESTABLISHED; do not infer them from the scrcpy version |
| dav1d | [1.5.4, statically built](https://github.com/Genymobile/scrcpy/blob/a60891aea193d92e7e5c3942700eca63f9d19a5f/app/deps/dav1d.sh) | [BSD-style conditions](https://github.com/videolan/dav1d/blob/1.5.4/COPYING), including binary notice mapping |
| libusb | [1.0.30](https://github.com/Genymobile/scrcpy/blob/a60891aea193d92e7e5c3942700eca63f9d19a5f/app/deps/libusb.sh) | [LGPL-2.1](https://github.com/libusb/libusb/blob/v1.0.30/COPYING), exact binary/source relationship pending |
| ADB and two DLLs | [Platform Tools 37.0.1, x86 for Windows packages](https://github.com/Genymobile/scrcpy/blob/a60891aea193d92e7e5c3942700eca63f9d19a5f/app/deps/adb_windows.sh) | Separate Platform Tools provenance/NOTICE/license analysis; exclude from intended application scrcpy runtime closure, not silently execute |

Only `LICENSE.txt` appears as a license/notice-named archive member; there are no
separate NOTICE/COPYING members in the measured inventory. This is an inventory
fact, **not** a finding of infringement or a redistribution authorization. Static
compiler/runtime dependencies also require mapping; the version/build scripts do
not by themselves prove reproducible correspondence to every measured binary.

## Finite remaining decision and preserved evidence

The stock client is **not runtime-admissible under the existing owned-server and
sealed-device authority** merely by adding `--no-control --no-audio`, `ADB`, or an
endpoint environment variable. Keep candidate admission metadata-only/disabled.
Before any runtime source entry, decide explicitly how the stock startup,
serial selection, device payload and cleanup behavior will satisfy the existing
boundaries; no mediator or upstream patch is proposed or authorized by this report.
Complete the component/notice mapping and exact runtime closure first.

[P0-05](../phases/PHASE-00-feasibility.md) retains the scrcpy **4.1 video/encoder failure on one
Android 9 device**. A new release and host-side decoder changes do not establish
that the device encoding failure is cured. No 5.0.1 hardware, stream, performance,
resource or video-only acceptance is claimed.

## Server-only payload follow-up — 2026-11-02 02:25 UTC

A narrower **direct server consumer is under review**, not implemented/admitted by
this evidence. If the stock Windows client and its DLLs are not admitted, their
remaining dependency mapping is not a prerequisite for that separate server-only
choice. The historical stock-client analysis above remains unchanged. Exact Windows
consumer proof is absent; device push/execution, stream custody and cleanup still
require their own reviewed boundary. No payload has been run or pushed.

The already hash-matched `scrcpy-server` member was opened as a nested ZIP **in
memory only**. Its exact 13-member inventory is retained in
`/tmp/auto-p301-research/server-members.json`:

- `META-INF/com/android/build/gradle/app-metadata.properties` (56 bytes), recording
  Android Gradle plugin **9.1.0**;
- `META-INF/version-control-info.textproto` (120 bytes), recording revision
  `dc8a55a24c27ae78ae202b5a3288da681d0f141a`;
- `classes.dex` (2,302,128 bytes), SHA-256
  `a7e811763dc6352cfcc2e9d6f9e20724219b68af8e8a7a11271d8e00fe72ff8d`;
- eight builtins resources under `kotlin/`: `annotation/annotation`,
  `collections/collections`, `concurrent/atomics/atomics`, `coroutines/coroutines`,
  `internal/internal`, `kotlin`, `ranges/ranges`, `reflect/reflect`, each with
  `.kotlin_builtins` suffix;
- `AndroidManifest.xml` (1,184 bytes) and `resources.arsc` (40 bytes).

The inventory therefore totals 2 metadata files + 1 DEX + 8 builtins + 2 Android
resources = **13**. The coordinator's [exact revision comparison](https://github.com/Genymobile/scrcpy/compare/dc8a55a24c27ae78ae202b5a3288da681d0f141a...a60891aea193d92e7e5c3942700eca63f9d19a5f)
found the release tag one later documentation/install-links-only commit, with no
server/build-source changes. Embedded revision metadata is corroborating evidence,
not a source-reproducible binary attestation.

Static DEX parsing, without loading its code, counted **1,051 `kotlin` classes,
153 `com/genymobile` classes, 32 JetBrains/IntelliJ annotation classes and 10
`android` stub/AIDL classes**. `kotlin.KotlinVersionCurrentValue.get()` at code-item
`0x5b1ec` constructs `KotlinVersion(2,2,10)`: code units
`0022 0233 2112 0213 000a 4070 09eb 2110 0011` load constant 2 into v1,
10 into v2 and call the constructor with v0/v1/v1/v2. Thus the embedded runtime
identifies itself as **Kotlin 2.2.10**, rather than merely inferring it from AGP.

Primary dependency corroboration (POMs read as bounded text, no JAR download):

- [AGP 9.1.0 POM](https://dl.google.com/dl/android/maven2/com/android/tools/build/gradle/9.1.0/gradle-9.1.0.pom)
  declares Kotlin Gradle plugin and Kotlin stdlib 2.2.10. Built-in Kotlin is
  [enabled by default since AGP 9.0](https://developer.android.com/build/migrate-to-built-in-kotlin).
- [Kotlin stdlib 2.2.10 POM](https://repo.maven.apache.org/maven2/org/jetbrains/kotlin/kotlin-stdlib/2.2.10/kotlin-stdlib-2.2.10.pom)
  declares Apache-2.0 and compile dependency `org.jetbrains:annotations:13.0`.
- [Annotations 13.0 POM](https://repo.maven.apache.org/maven2/org/jetbrains/annotations/13.0/annotations-13.0.pom)
  declares Apache-2.0; the actual annotation classes corroborate this dependency,
  but their exact version is not independently encoded by the class count.
- [Kotlin 2.2.10 license](https://github.com/JetBrains/kotlin/blob/v2.2.10/license/LICENSE.txt)
  is Apache-2.0. The nearby `NOTICE.txt` expressly concerns the **compiler
  distribution**; it is not automatically adopted as the stdlib notice inventory.

These facts establish a concrete Kotlin/dependency attribution, not a byte-for-byte
rebuild or exhaustive applicable-notice determination. No claim that scrcpy's own
Apache license alone covers every embedded component is made. The remaining
server-only mapping is bounded to its actual embedded components and applicable
notices, separately from the unused stock client/toolchain dependencies.
