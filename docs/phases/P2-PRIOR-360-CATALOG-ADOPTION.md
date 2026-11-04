# P2-01 — reviewed prior 36.0.0 metadata entry

Status: source entry adopted under the existing original P2-01 delegation, 2026-11-01 16:35 UTC. Independent design CLEAR applies to SHA256 `1e8fad965c73a5191d196950018231b05309ac893e952a9be8121c80fe175cc5`. This is not part of sole-pin rollback commit `ca60baddd89747f647ef97defc9c09b24da74e9e` and does not authorize a native campaign.

## Purpose and exact candidate

Close the original retained-runtime rollback dependency with one genuine prior metadata entry. Keep 37.0.1 as the sole production INSTALL target. Add 36.0.0 only as known, activation-eligible and launch-eligible retained prior; native selection still requires an actually settled, fully verified predecessor and genuine private confirmation. Metadata presence alone never creates installed bytes or rollback eligibility.

Official archive listing: [tagged AOSP archives](https://android.googlesource.com/platform/packages/modules/adb/+/refs/tags/android-16.0.0_r4/docs/user/archives.md). Official release context: [Platform Tools release notes](https://developer.android.com/tools/releases/platform-tools). Exact recipient archive URL is `https://dl.google.com/android/repository/platform-tools_r36.0.0-win.zip`.

Measured ZIP: 7,138,784 bytes, SHA256 `12c2841f354e92a0eb2fd7bf6f0f9bf8538abce7bd6b060ac8349d6f6a61107c`. Canonical candidate JSON, using the existing key order, sorted 14 flat names and explicit null PE fields: 2,276 bytes, SHA256 `dce9a38e3cb81111112690118ec842bce9f634e666517dc2fd4a02042fda098c`. Eleven PE files are I386/PE32; expanded files total 15,373,885 bytes. `adb.exe`: 6,641,760 bytes, SHA256 `1e1c2280b90b3f01ad84cd8df4858b1b1995012814f3ca8893bcc3ba3848edec`.

The archive was retrieved once from the exact Google HTTPS origin with redirects refused, bounded to 32 MiB/120 seconds. ZIP structure, CRC, all 14 file hashes, PE headers and source.properties were independently rechecked. No executable was extracted to disk or invoked in that inspection. Current-version metadata remains byte-identical.

## Provenance and notices — bounded disposition

The named URL was republished in June 2025: the [scrcpy maintainer's firsthand record](https://github.com/Genymobile/scrcpy/issues/6214) distinguishes earlier preview bytes from the measured stable bytes. Measured SHA1 `18bb505f9fbfbdf1e44fca4d794e74e01b63d30e` agrees with that quoted stable-channel record. This is corroboration, **not** an independently retrieved historical Google repository checksum. Future retrieval must match the exact SHA256 or refuse; neither the filename nor a floating latest URL overrides it.

NOTICE.txt: 1,089,730 bytes, SHA256 `b319ee2dc88f5d38b0921b0349bf6f7a1f7b30453ecef2180a74989503d7f704`. Its exact 10,848-byte `/bin/adb` stanza is identical to the reviewed 37.0.1 stanza; the composite notices otherwise differ. This is not a reconstructed binary linkage/license map, redistribution clearance or legal certainty. Current SDK terms are not a historical 36.0.0 terms snapshot. Amendment03 recipient-direct official/user-owned archive delivery remains unchanged: do not bundle or redistribute these binaries, fabricate component-license approval, or claim fixture consent is genuine human consent.

## Finite source entry

Add one exact metadata source and verification JSON, bind it into the existing immutable catalog and build-input/module closure, and preserve the current install target. Tests must compare all measured metadata, reject counterfeit handles/mismatched hashes and prove that merely adding a catalog entry does not make rollback available. Update sole-pin-specific assertions narrowly; retain the actual owned synthetic A→B→A tests as synthetic evidence. No dynamic target selection, new renderer authority, download origin, server/device command, profile adoption, cleanup cap or security setting is added.

Changed native/bootstrap source in the preceding checkpoint still requires refreshed four-source compilation plus all eight existing managed groups and both new release-parser groups. Old managed/native artifacts cannot be promoted to current proof.

## Subsequent execution prerequisite

A separate frozen runner must establish an actual owned prior installation, current-target upgrade, confirmed rollback and reopen with exact selected-release VERSION evidence and failure/race coverage. Any initial prior-target build derivation must be explicit, bounded and test-only; it must not add arbitrary production target selection. Reuse unchanged accepted positive evidence instead of replaying unrelated campaigns. Exact runtime/parent/Job custody, immutable settlement and actual retirement remain mandatory. This document alone claims no real rollback, Windows compatibility or whole P2-01 acceptance.
