# Auto recovery snapshot: 7 November 2026

This branch stores the requested recovery package under `Auto-recovery/`. It is a snapshot for continuing development, not a finished Windows application or an accepted software release.

## Download and restore

1. On branch `File-2026-11-07`, choose **Code → Download ZIP**, then extract the downloaded repository ZIP. Alternatively, download all 66 numbered files from `Auto-recovery/` with their original names, plus the restore scripts and JSON manifest.
2. Open `Auto-recovery/`. Keep `Auto-recovery-20261107T052553Z.zip.001` through `.066` together with `Auto-recovery-parts-manifest.json` and the restore scripts.
3. On Windows, run `restore_auto_zip.cmd`. With Python 3.11 or later on Windows/macOS/Linux, run `python restore_auto_zip.py` (or `python3 restore_auto_zip.py`). The scripts read the parts, validate SHA-256, and create one ZIP without overwriting an existing ZIP. They do not download/install software, change system settings, or delete files.
4. After `PASS`, extract `Auto-recovery-20261107T052553Z.zip` into a new empty directory. Read the new `PACKAGE-README` inside `Auto`; the included `verify_recovery` script verifies the extracted inventory and file bytes.

This GitHub delivery uses 66 parts (the separate chat attachment set uses 35 parts); do not mix the two sets. Both reconstruct the same ZIP hash.

The numbered files are binary pieces, **not independent ZIP archives**. Their total size is 682,633,479 bytes. Keep approximately 4 GB free for the parts, rebuilt ZIP, extracted folder, and working headroom. The Windows wrapper was code-reviewed but not executed on Windows during packaging; Python success, missing-part, and corrupted-part cases passed.

Reconstructed ZIP SHA-256:

`0001e3d6ca2e14dbeefa3b35473bf65c3982562be6029a83c15b14903e2a070f`

## Scope and exclusions

The package contains 102,400 original files, plus three new package metadata/verifier files. Source bytes were verified stable through 2026-11-07 05:30:13 UTC. Later development is outside this snapshot. Original source, plans, checkpoints, historical Git data and retained evidence remain byte-preserved.

It is **not an exact full-folder copy**. These eight original exclusions remain:

- `source/desktop/node_modules`
- `source/foundation/node_modules`
- `source/desktop/build`
- `source/desktop/demo-build`
- `source/desktop/.test-output`
- `source/foundation/.test-output`
- `handoff/archives` (older ZIPs and their sidecars)
- `checks/portable-handoff` (earlier extraction staging)

Splitting adds no further exclusion. Historical status documents and test evidence retain their original dates and limitations. Byte verification is not software qualification. Restore dependencies only using the included project instructions and lockfiles.

## Publication review

The final archive was checked for credential filenames and common token/private-key formats; a further review decoded loose Git objects, packed Git objects, nested source archives and database fixture content. Findings reviewed were synthetic test canaries/placeholders or public upstream documentation, not identified live credentials. The PNG payload is a synthetic 1×1 fixture. Historical build outputs are passive project/test evidence, not approved executables. No archive code or binaries were executed for this review.

This is bounded screening, not an absolute guarantee of the absence of every possible private datum. SQLite base files were opened read-only; retained WAL/SHM data received byte-pattern inspection, not a full forensic replay. No new device data, account stores or credentials were collected. Existing upstream copyright notices, licenses and corresponding source artifacts remain inside the archive. This snapshot does not grant new software licenses or waive uncompleted project/release gates.

Each numbered file is at most 10 MiB. See [GitHub's file-size guidance](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github). This is a one-time requested recovery delivery; it does not set up recurring repository backups, Git LFS, paid storage or a new release workflow.

The branch descends from the existing `main` commit. Publication does not modify `main`, rewrite history, merge phases, or approve a pull request. Earlier local-only workflow notes inside the snapshot remain historical; the user's 7 November request separately authorized this archive delivery only.
