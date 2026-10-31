# Internal package verification — P1-10

Current status: hosted package attempts FAILED before first-Cancel evidence admission. Complete diagnostics and local reproduction identified JSON-encoded verification script copies; corrected raw-copy Windows confirmation is pending. No bundle promotion or package-stage PASS is claimed.
See the [approved contract](../../docs/phases/PHASE-01-P1-10-PACKAGING-CONTRACT.md) and
[measured source evidence](../../docs/evidence/P1-10-package-recovery-source-2026-10-31.md).

The package is an unsigned offline Windows x64 developer/internal bundle, not an
installer or public release. It contains pinned Node and official Electron runtime,
production app outputs, exact local launch helpers, provenance and license files.
There is no npm install, PATH-Node fallback, runtime download or device/account service
at launch. Build-time fetching of the exact pinned Node license is separate.

## Intended fixed package entry

Run `Launch.ps1` from a trusted PowerShell session, using absolute canonical directories:

- `-CreateUnder <existing-parent>`: native first-use selection/confirmation, Cancel by
  default; new data remains outside the package.
- `-Root <owned-parent>`: reopen that parent's FRESH `data-main`.
- `-Root <owned-parent> -Maintenance "--maintenance=restore-to-new"`: authenticated recovery selection
  into a new quarantined root; never repair or overwrite the corrupt source.
- `-Store <owned-parent/data-storeId> -Maintenance "--maintenance=restore-to-new"`: RESTORED provenance
  remains immutable and maintenance-only; normal app admission remains refused.
- `-Root <owned-parent> -RecoverRetainedLaunch <exact-launch-UUID>` (or `-Store` for the
  exact restored store): only a complete, bound, known-retired journal is recoverable.
  Read the launch identity from that parent's retained journal; never guess it or delete
  lock files. Legacy, unknown, interrupted or unattributable ownership remains blocked.

These are the implemented entry interfaces, **not yet a Windows success claim**. The
supervisor holds an exclusive parent guard throughout each operation. A free guard,
missing process or old PID alone is never proof permitting recovery. Successful explicit
recovery retires only the matching settled ownership; it does not make invalid SQLite
valid, clear quarantine, reset keys or start jobs.

## Verification/publication boundary

The native harness relocates the exact candidate and uses reviewed, hash-bound copies
of the fixed PACKAGE wrapper/core with exactly four observer substitutions. Real
packaged initializer/main/provider/SQLite paths remain; only synthetic native dialog
answers and bounded quit observation are injected. This is not an untouched top-level
Launch.ps1 E2E or genuine human widget-click claim. Original package bytes remain
unchanged and are revalidated before publication.

Only duplicate-aware fixed-field `validated.json` may be uploaded on a valid failure.
The ZIP and SHA256 file require a separate complete PASS promotion marker after exact
payload/ZIP revalidation and exclusive copy. Candidate metadata, raw captures, journals,
profiles, databases, vault files and backup copies are private and never uploaded.
Previous verified builds are not overwritten. P1-06 cross-user remains UNMET and is
not retried here; physical-device and formal release gates remain pending.
