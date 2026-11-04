# P2-02 — retained helper API and injected bridge source checkpoint

## Useful scope and current result

This advances **P2-02 ADB server lifecycle, task2 of13**. The reviewed
[contract](../phases/P2-RETAINED-NATIVE-HELPER-BRIDGE-PROPOSAL.md) entered source under
ordinary delegation at06:37 UTC on2026-11-01, after independent design CLEAR on
`9217137a51f8800540e8254c2acf6dad075e8995bd7b829481ae875d472b3d9c`.
The executable-boundary implementation is source only: **C# NOT_COMPILED and
NOT_EXECUTED; no actual pipe/bootstrap reader or child-spawning bridge is installed.**
A TypeScript injected-byte state machine plus a C# retained API is not a live bridge.

The existing reviewed `IsolatedAdbServer.cs` is reused unchanged as a partial class,
not copied into a second interop implementation. Its exact SHA256 remains
`4bf1cddd06ad6ead68f2f22cdb0c9b7c43cda96d41005f7546973c81b92029d7`.
The extension adds no P/Invoke or dependency. Fixed VERSION/foreground/health/retirement
methods retain exact attempt/Job/endpoint handles. Reservation precedes effects;
stopping is checked before suspended creation and resume. Cleanup remains available
after revocation, with bounded gate acquisition and one-shot drain retirement.
Terminal replies require settled workers, process/Job/endpoint proof, exact profile/key
cleanup (or never-reserved proof), and current run-root ownership. Unknown cleanup is
UNRETIRED, never permission to release byte custody. Existing native `.android` entries
remain refused without reading/adopting/deleting credentials. No profile workaround.

The private TypeScript bridge uses injected transport only: bounded UTF8/LF frames,
decoded duplicate-key rejection, exact request/session/attempt correlation, one ordinary
request plus cleanup, actual write settlement, and no terminal inference from EOF or
errors. Its parser reuses the existing fleet-contract bounded grammar with explicit
provenance, without adding a renderer dependency. Replay bookkeeping caps an instance
at128 attempt IDs. A real host-adapter composition test uses synthetic transport/native
facts and supplied byte-custody facts; it is not a Windows process test.

## Impact-based verification, not a repeated aggregate

- Parent bridge tests:8/8 PASS, followed by the one new incomplete-exit causal
  regression1/1 PASS after review. Total9 distinct new bridge cases covered.
- Child native source/derivation assertions:9/9 PASS. These read source and frozen
  hashes; they do not compile or execute C# and cannot establish OS behavior.
- Affected closed module-graph and test-runner inventory:31/31 PASS. Graph is exactly87
  registered modules; an88th is still rejected. One new private TypeScript module,
  two source test registrations, and three source-input pins; no new bundle output,
  public IPC, UI, production provider or package executable surface.
- Strict TypeScript, restricted runtime graph,305-file quality inventory and build
  verification PASS. An initial tooling command used the desktop cwd with root-relative
  paths and failed before editing; corrected cwd succeeded. An intermediate quality
  check saw the child's in-progress test formatting; final formatted corpus passed.
- Independent review ran only two causal bridge tests (adapter composition and missing
  exit-proof reservation refusal), and read the native lifetime/cleanup corrections.
  No duplicate aggregate or native campaign was requested.
- Carry-forward: prior local host checkpoint937/937 and exact accepted recipient
  Windows901/109/214 remain evidence for their unchanged scopes, not fresh results.
  Expected next complete desktop count955 is **NOT_RUN**; no uninterrupted955 claim.
  Unchanged foundation109/Python214 are reused, not rerun for these private sources.

Local executor has no dotnet/csc/mcs. A separately reviewed Windows compile-only step
is the next native prerequisite; actual helper startup/pipe/parent-loss/profile tests
require their own exact owned execution envelope. Main remains unwired and fleet
BINARY_UNAVAILABLE. Existing-profile server criterion stays UNMET. No canonical task
count, full Phase2 acceptance, P1-06 or formal/hardware gate changes.

## Exact source fingerprints

- `desktop/native/RetainedAdbSession.cs`: `542d86eca13a7a0bfd4ec58be21a55b1b81073f1cd60d80c0dc0431c8ff15638`
- `desktop/src/main/adb-host-bridge.ts`: `775bc8e66ee65d18c759ffebbaeec9c8f7e3fa2350abf6d81af9889d3705c122`

Publication is local-only, separate from the denied custody795 checkpoint and subsequent
reviewed local commits. No new remote tree, hosted compile or CI result is claimed.
