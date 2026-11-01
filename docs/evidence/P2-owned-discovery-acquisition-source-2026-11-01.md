# P2-03 — owned discovery acquisition source and managed gate

**SOURCE / HOSTED SOFTWARE1268/109/280 / CURRENT COMPILE + MANAGED27 PASS — actual socket/server/device execution NOT_RUN.**

This is the original P2-03 discovery-to-durable-registry dependency, following
[hosted ingestion source](P2-discovery-ingestion-source-2026-11-01.md) and the
[adopted acquisition contract](../phases/P2-OWNED-DISCOVERY-ACQUISITION-CONTRACT.md).
Independent source-entry design CLEAR binds pre-adoption SHA256
`3393f15f43c3bc4ab12822995cd75d7aafbdcb868134d2567f6da6ee7eac74ac`.
P2-01 stays TECHNICAL_PASS/DEPENDENCIES_PENDING; P2 technical1/13, overall11/154 and
formal0 remain unchanged. Actual P2-02 profile eligibility and P2-03 physical-device
proof remain open.

## Useful bounded implementation

The private retained foreground attempt gains one literal `host:devices-l` query,
not a CLI invocation or a generic socket/command interface. The native byte reader
bounds the payload to32KiB, validates OKAY/hex-length/strict UTF-8/EOF, and retains
socket/connect/native-worker lifetime independently of the server attempt. Query
completion never releases the server's runtime holder. The existing server service
owns the only native-provider brand and its ordinary/audit lane; the real factory
only supplies checked same-capability acquisition facts. Injected factories and
arbitrary caller source labels cannot mint admitted native provenance.

The headerless server parser shares the existing row semantics without inventing a
CLI header. JavaScript must validate rows even after native framing COMPLETE.
Private serial-bearing raw text/base64 remains bounded memory/private-pipe data,
not audit output, renderer data or a public artifact. The existing durable store
and final observation fence remain the commit boundary. No main/preload/renderer
activation, new dependency, database migration or new audit schema is included.

Native operation retirement covers the query socket/connect/worker only. Full
response receipt and the parent write callback do not prove remote serializer
Flush/reader/output retirement; that remains under the separately retained helper
and outer persistence lifetime. Known loss invalidates observations when detected,
not through an invented continuous process-health monitor.

## Managed-only execution envelope

The default-off `[discovery-managed]` / `run_discovery_managed` workflow replaces
only the current managed-source gate. It compiles the exact four production C#
sources plus the fixed fixture, then runs27 controlled groups: eight protocol,
two selected-release, nine SESSION and eight discovery groups. The new discovery
groups exercise the actual bounded framing algorithm through an in-memory seam and
fake-provider scheduling; they do not open sockets, launch ADB/Electron/server,
read a user profile, download archives or enumerate devices.

The strict report is managed schema v4 with all ten current input hashes. Existing
v1/v2/v3 hash tables and accepted reports remain historical exact-byte evidence;
they cannot certify the changed helper. The current gate requires v4/27, a known
retired/untruncated compiler and fixture, unchanged source and owned directory
cleanup. Unknown cleanup preserves evidence rather than creating a PASS.

## Verification accounting

- Native source assertions30/30 PASS; RunDiscovery8 is authored, not executed locally.
- Bridge/adapter/factory affected69/69 PASS before the final internal witness refinement. Later overlapping factory/custody45/45 and fresh-observation factory34/34 PASS cover callback-free exact-holder validity, pending HEALTH and legitimate equivalent revalidation. These counts are not summed as distinct coverage.
- Parser/service/ingestion affected48/48 PASS before the final busy/fence correction; final three targeted causal cases PASS. One earlier case incorrectly expected engine.busy while custody inspection was pending; its2/3 result and actual120.5-second cleanup retirement remain historical. The corrected case observes actual inspection/READY and settles its gates in finally. Full final integration is left to the sole parent aggregate.
- Managed workflow gates8/8 PASS. The initial7/8 failed because an old blanket constructor regex also matched the required pure nested DiscoveryBudget. Exact real-provider/socket/process constructor negatives replace it, while the shared in-memory framing seam is asserted. A mistaken working-directory edit did not apply and repeated that same failure; no product or admission predicate was relaxed.
- Python strict validator28/28 PASS, including three new v4 cases; actual discovery confirms280 registered Python tests. Historical managed hash tables are unchanged. No C# compiler, fixture DLL/EXE, socket or server ran locally.
- Closed module graph98 PASS; no module/output or test-file registration added (144 files retained). Existing build/privacy boundaries remain. Parent formatting checks have no warning/error; existing style infos are not changed.

The sole uninterrupted parent complete144-file aggregate completed19:50: TESTS_PASS1268/1268 and DESKTOP_SOURCE_CHECK_PASS, including metadata, graph, warning-level quality, strict TypeScript, production/demo builds and provenance checks. Hosted1268/109/280 and actual managed-v4/27 are pending; foundation109 is retained prior evidence, and the full280 Python suite was not rerun locally. No expected total is represented as an actual run.
The prior published ingestion checkpoint has actual hosted1243/109/277 PASS; the
prior current-source SESSION fixture has actual managed19 PASS only for its old
helper bytes. Neither is relabeled as current managed27 or live acquisition proof.

## Remaining gates

Actual fresh-profile server/query/EOF/close and real process-tree retirement need a
separately eligible authorized Windows environment and a reviewed finite campaign.
Existing native KnownFolder `.android` refusal is unchanged; no adoption, deletion,
profile redirection, account/token/ACL change or security workaround is proposed.
Two-phone isolation/reorder/reconnect, identity proof and public Fleet activation
remain unproved. This source/managed slice does not accept P2-02 or P2-03.

Coordinator disposition at19:48 authorizes the single bounded `[discovery-managed]`
compile/27-group campaign after exact independent source/runner/hash closure under
the existing Auto build/test scope. This is not actual server/socket/profile/device
execution authority. Any tool denial stops the exact operation; no workaround or
unreviewed additional campaign is implied.

## Frozen source and gate SHA256

| File | SHA256 |
|---|---|
| `desktop/native/RetainedAdbSession.cs` | `d192f132cd7c4463ae2e3cd65d75f34b95ae10cdfab92dfb1eb61d3b60446d4f` |
| `desktop/native/RetainedAdbProtocol.cs` | `1959feb7f83d005fddf9c6df0762ca5c7dd21946fe3c2f1b8bd9056b2e426757` |
| `desktop/tests/fixtures/RetainedAdbProtocolFixture.cs` | `1e7a2def3b57a3b79cfc51b6dc6143807aab7513d3bb387d9a8ac2ecf9303d8a` |
| `desktop/src/main/adb-host-adapter.ts` | `caa18eddbd220d5e0bb7c411725353c4ca5dc02aae64cec7921dc67e0cec2aa5` |
| `desktop/src/main/adb-host-bridge.ts` | `eb1dbecc58638dc2089d60a800536e3d06b0e3233b05c23559aa77ad5d45d3e7` |
| `desktop/src/main/adb-host-factory.ts` | `50c68b5e571d0eb1483e684b7242089a92f913f8cfae8057d1066024f6bd0cb0` |
| `desktop/src/main/adb-server-service.ts` | `6e20190b514df126bddc6d69affc96e3a9292badbbfe9c6700f99814deff98da` |
| `desktop/src/main/adb-discovery-service.ts` | `f8b1be7e97db481372a27708f65830fddd61d00b4f1043cc6a66c8e4b11443b3` |
| `desktop/src/main/adb-discovery.ts` | `bf61c60ecce7a58dd0062931821010e98e65e74be76eae99388229cc2983c435` |
| `desktop/src/main/platform-tools-runtime-custody.ts` | `a5501fd2ed3f5f0063585db08292cf64d7029a6fe6a7b8c897772f8b822aac8c` |
| `desktop/verification/Invoke-RetainedManagedFixture.ps1` | `6a018a9694a155e28b849e620f55061cff76ed32a5a105195fc74c7f0b6fba6b` |
| `desktop/scripts/retained-managed-fixture.mjs` | `d1ba3f6cb95018fab74492d4f89579e1dc5ff6b04518085c7881c996accf4236` |
| `desktop/verification/validate_retained_host.py` | `739808e1ba60c989bcbe4eeb5e8c1e770612949a1ba9a09d8246aeede5ce09c7` |
| `.github/workflows/phase-02-software.yml` | `254c2e0e4a1227db73e551bc56906d1c0c16bf5bac6daae29e606cbda794b7e5` |
| `desktop/module-map.json` | `9776417e164ccbd607146e1591cedccd5c2e51a91c0cdf4cb97398c2c20a80f7` |

Independent consolidated implementation and managed-envelope source review closed19:49 after bounded-lock, local-contention and final-custody corrections. The parent owns the sole aggregate; the reviewer did not rerun tests/builds/native execution. Final32-file staged/hash/docs closure completed19:51: all15 documented source hashes, all10 managed-v4 pins, retained historical tables, links and whitespace independently verified. The reviewer recommends only the already-authorized single compile/27-controlled-group campaign.


## Actual Windows managed-only closure — 20:00 UTC

CI41344155270 completed SUCCESS on public
`9a0700b48253100877bbd1c2385883ba938da68f`, local
`e3db87266cdb3e2a863589ca357dd6dc369309c2`, exact tree
`c7933f679c8d270945641963920b8cbd9845f5e2`. Source job124960273116 logs actual
1268/1268 desktop + DESKTOP_SOURCE_CHECK_PASS,109/109 foundation with no
failure/cancellation/skip/todo, and Python280/OK. All unrelated native jobs were
SKIPPED. This supersedes the pending hosted counts above for these exact bytes,
without rewriting the earlier local failures or overlapping affected evidence.

Managed job124960967053 compiled the exact current four production C# sources and
fixed fixture, then passed27 controlled groups. The delivered
[canonical report](samples/P2-owned-discovery-managed27-pass.json) is1197 bytes,
SHA256 `1d24c19e9d6a1e78cd48c176c9a4c5abc3da251796ea9c7bc95b7a5a07dc2595`.
Both compiler and fixture are SUCCESS/exit0/retired/untruncated, compilerDiagnostics
is empty, sourceUnchanged and directoryCleanup are true, all ten exact input hashes
match, and strict passed is true. Artifact13099045228 contains only this report;
ZIP882 bytes, SHA256
`20d05957a02689312f8d60a6e95fba772478cdf866c78869c0ba470ef03c7c28`.

The parent downloaded/logged once and strictly reconstructed the bytes; independent
20:01 audit extracted the seven-module validator closure (six dependencies) from the
exact committed local source, repeated duplicate-aware canonical reconstruction,
matched all ten committed hashes and read the retained source/managed logs. No
additional test/build/native execution or second fetch was performed for review.
This accepts current compilation and controlled managed27 behavior only. It does
not establish a real query socket, eligible Windows profile, native server lifetime,
physical device, public/main activation or P2-02/P2-03 technical acceptance.
