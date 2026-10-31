# Scoped nonsecret settings verification

The [approved P1-07 contract](../../docs/phases/PHASE-01-P1-07-SETTINGS-CONTRACT.md)
and [current evidence](../../docs/evidence/P1-07-settings-source-2026-10-31.md)
control this envelope. The first version1 native run41201915177 passed and was
independently reviewed. Version2 run41202834105 also passed with both22-case UI groups;
its fixed artifact was independently reviewed. Version3 adds the approved reachable
corruption-recovery matrix; run41204195482 passed both modes and was independently
strictly reviewed. Coordinator13:14 accepted qualified P1-07 TECHNICAL_PASS; formal
acceptance remains pending, with the launcher usability limitations below retained.

`Invoke-Settings.ps1` uses the unchanged owned Windows Job/provenance/retirement
helpers and four-stage synthetic key certification controls. It then runs source
and unpacked-package actual-main UI/reopen and separate before/after-COMMIT crash/
reopen stages. Real main/preload/React/SQLite remain the compiled production code;
verification wrappers supply exact native dialog answers and bounded quitting.
Those are not genuine widget clicks. Only synthetic nonsecret settings are used.

`validate_settings.py` retains historical validators unchanged, requires exact fixed
cases/process statuses/cleanup and explicitly records `P106_UNMET_NOT_RERUN`.
JSON uses exclusive post-validation publication. The separate screenshot marker is
emitted only for all four validated metadata-bound1024×768 Light/Dark PNGs; partial
copies cannot be uploaded with a FAIL JSON merely because the JSON is valid.
No raw capture, UUID, path, account or secret value enters the fixed report.

A settings PASS does not close P1-06's unmet cross-user negative or the original
Phase-0/formal dependency chain. The preserved full persistence/vault workflow is
manual-only; no further unchanged identity attempt is authorized by this envelope.

Local verification:

```sh
env -u NODE_PATH node desktop/scripts/check.mjs
PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s desktop/verification -p 'test_*.py'
```

Native execution is Windows-only and requires the reviewed exact-head workflow,
verified runtime distribution and coordinator authorization. Never launch it against
an existing user profile or real credential store.

Version2 adds exactly four UI observations: actual foreign/child-frame metadata
against the captured unchanged handler, held reset confirmation revoked by real
reload with unchanged DB, and a real preload read whose returned result is delayed
past timeout. This is adapter/transport instrumentation, not forged native IPC or
human-intent proof. Late release is observed for150ms with no UI resuccess/second
dispatch and composed with direct client tests. Version1 retains its exact case map.
Only four literal new failure-stage markers may be forwarded; no raw errors/paths.

Version3 retains all six version2 settings stages and adds five separately versioned
recovery stages per mode: schema3 authenticated backup setup, malformed CURRENT
Cancel/Confirm, then malformed PREVIOUS Cancel/Confirm using the genuine new
quarantined root. Actual compiled main runs the existing explicit restore literal;
verification answers native dialogs, witnesses no active corrupt DatabaseSync open,
and checks source DB/WAL/SHM/vault plus selected backup bytes unchanged. A fresh
lease on the fully retired first restored root enables the second pair; no live
profile/lease copy or normal restored-root activation is claimed. Native key-profile,
checkpoint and private staging writes are not included in a false zero-write claim.
The source developer launcher's failed-normal-launch retained-lock recovery remains
P1-10 work with P1-08 UI handoff; this proves actual-main recovery under an already
legitimate supervisor-owned lease, not a working stale-owner recovery command.
