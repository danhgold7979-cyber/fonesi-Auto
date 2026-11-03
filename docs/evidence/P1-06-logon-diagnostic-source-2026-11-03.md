# P1-06 bounded logon diagnostic amendment

Source preparation only, authorized by coordinator 2026-11-03 03:24 UTC.
Isolated local branch phase-01-context-diagnostic based on phase-01 commit
3797dae41996884f12c6d14cec89497c70776087. No publication or native invocation
is authorized by this document. Phase07 work remains untouched.

Run 41198112252 at commit 7137e3182dd7701e952ae71f758363915c839db1
previously returned TOKEN_UNAVAILABLE in source and package contexts. Only
ownerBefore was true; the isolated children retired successfully. The exact
failure reason was not recorded. No claim about that historical reason follows.

## Fixed change

Immediately after the unchanged fixed LogonUserW call returns false, capture
Marshal.GetLastWin32Error before any other managed/native operation. Map only:

- 5: TOKEN_UNAVAILABLE_ACCESS_DENIED
- 1314: TOKEN_UNAVAILABLE_PRIVILEGE_NOT_HELD
- 1385: TOKEN_UNAVAILABLE_LOGON_TYPE_NOT_GRANTED
- 1326: TOKEN_UNAVAILABLE_LOGON_FAILURE
- 1327: TOKEN_UNAVAILABLE_ACCOUNT_RESTRICTION
- Any other integer, including zero: TOKEN_UNAVAILABLE_OTHER

The number, system error string, identity and token are never emitted. These
categories describe a returned error class, not a proposed remediation or
permission to alter rights. Source: [Microsoft error definitions](https://learn.microsoft.com/en-us/windows/win32/debug/system-error-codes--1300-1699-)
and [LogonUser](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-logonuserw).
The documented LocalService example matches the existing fixed call; its
availability on a particular hosted runner is not assumed.

Version1 closed fields remain unchanged; the finite status set is extended.
Historical TOKEN_UNAVAILABLE remains readable. All six PASS controls, canary
prerequisite before foreign denial, owner reversion, buffer disposal, owned
deadline/capture/retirement and final aggregate gates are unchanged. Only the
exact existing pre-impersonation boolean vector with clean successful process
retirement can authorize continued evidence collection. Every classified
failure remains passed=false and cannot make the aggregate PASS.

No account creation, rights/ACL or security changes, privilege enabling, new
identity, token borrowing, fallback mechanism or repeated logon attempt.
No source change to production, workflow triggers or native ownership helper.

## Verification limits

Node schema/source-policy tests and Python actual validator/matrix tests verify
finite categories, no raw output, immediate error capture source order, unchanged
controls and failure-only collection. These are not C# compilation, P/Invoke or
Windows execution evidence. No native probe is run in this batch; P1-06 remains
UNMET. Independent review must precede any later proposed execution.

## Source checkpoint results

2026-11-03, Linux Node24.22.1 / Python3.12.14:

- `env -u NODE_PATH node --test desktop/tests/vault-context.test.mjs`: PASS3/3.
- `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s desktop/verification -p 'test_*.py'`: PASS159/159.
- Independent review: exact eight-file freeze SHA256
  e861f230df685c1bd034c501b1d5ed42a1703aa2604dddef61590bc8a95766f7
  CLEAR for source/local checkpoint. Independent focused Python16/16 and Node3/3
  PASS (overlapping the above suites), plus diff-check PASS.
- C# compilation, PowerShell execution and native Windows probe: NOT_RUN;
  these tools are absent locally. No full application build is claimed.
- This final results paragraph is a documentation-only append after that freeze.
  No production acceptance or historical failure diagnosis follows. P1-06 UNMET.

## Exact publication/campaign preparation — 2026-11-03 15:19 UTC

The current Phase1 completion instruction authorizes reviewed phase publication and corresponding disposable Windows CI, not account/rights/security/device changes. Before publication, source inspection found two concrete closure defects in the earlier diagnostic checkpoint: Test-VaultContext.ps1 still pinned the prior C# helper bytes, and the dormant full-matrix workflow expected124 Python tests (ordinary workflow157) although the current diagnostic inventory contains159. These would refuse before meaningful context evidence; neither explains the historical TOKEN_UNAVAILABLE result.

The wrapper now binds exact diagnostic helper SHA256070183ca73a79deb26d451f8187384060111a14ba354e34aa3e7f3aa7b5d35f4. Both workflow counts require exactly159 with no skips. A regression checks the actual wrapper-to-helper hash and fixed campaign selection. The existing full historical persistence/vault workflow gains only phase-01 push selection with explicit [vault-context] marker, preserving manual dispatch. The ordinary five-job chain skips that selected push to avoid duplicate unrelated campaigns. Both push path filters are identical so every skipped marker push can select the full matrix; independent review caught and corrected the initial narrower full-workflow path filter before publication. Existing full-matrix job commands, native controls, artifact sanitizer, deadline and read-only permissions are unchanged. No repeated logon call or fallback, account creation, token borrowing, privilege/ACL modification or new provider is added.

Fresh remote phase-01 f8b155738e0ebbe404449579d4f4b60b911aed28 has treeea1b20b62970a40df0da780591d26d844209e281, identical to local phase-01 predecessor3797dae41996884f12c6d14cec89497c70776087. Publication must preserve this remote lineage and bind the eventual exact local source tree; main remains untouched. No successful publication or Windows outcome is claimed by this preparation record.

Final local Node4/4 and complete Python159/159 PASS; counts overlap the earlier diagnostic tests. Existing pinned quality admission/check and diff check PASS. Dependencies were copied locally from an already admitted checkout only after exact package-lock/dependency-review/Biome-review equality, then verified through the original tooling admission; no symlink or override bypass. C#/PowerShell/native execution remains NOT_RUN locally. Final independent source/campaign/disclosure review CLEAR; Windows outcome remains pending.

Exact additional fingerprints:
- `desktop/verification/Test-VaultContext.ps1` SHA256 `a9eb1f621032a0cd2afedc38f635f2e85d2e2959c0976be423015f4be0886784`.
- `desktop/tests/vault-context.test.mjs` SHA256 `6b0dbd44823e17af40b3b8748d4140c9a762c269fcd2f208cd0d00061a7e0649`.
- `.github/workflows/phase-01-desktop-foundation.yml` SHA256 `a88319f1542c32f2d0d795a9ca687718768b459f41a740570b1be45012838e06`.
- `.github/workflows/phase-01-full-persistence-manual.yml` SHA256 `f4fc457456e34f4c4853f37e4eaa666803b69de79a7495ca814a35d978915258`.
- `/tmp/p1-context-pin-closure-final.log` SHA256 `11c32f2425f5790d43b38e43d9041c89efa612bcdd782700d337f7be01e904e3`.
- `/tmp/p1-context-python-final.log` SHA256 `cfd58d3bc025d47c0009e8b0a05e20f1d9256312dc7f2000c04807d377a3bd46`.
- Final routing-only regression `/tmp/p1-context-routing-final.log` 4/4 PASS, overlapping prior4; SHA256 `01483642891380a47467a7a42efeca08eab4c900824f65d08704be591a007362`. Python/native sources unchanged after159/159; no duplicate Python run.

## Published diagnostic campaign and schema closure — 2026-11-03 15:35 UTC

The reviewed local9f5f8be887f27aa4b686cc5d2ae8df4af92cb11f tree45bfd0534d45e9c51a41d4f145c00b5415f2ed01 was published as ad093a98bbaeb17044b79b13a4e5ec063a071786, preserving public parentf8b155738e0ebbe404449579d4f4b60b911aed28. [Run41663612141](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41663612141) completed FAILURE. Its source587/587, foundation and Python159 gates passed. The sanitized persistence artifact ZIP SHA256bf51e9c31d998276d31f4965fb6ede20a0906a54dbd47b735260462017f71510 contains only fixed public facts: all four source key-auth stages passed with proven child retirement, followed by STAGE_VALIDATION_FAILED, empty READY/context summaries and directoryCleanup=false. It did not reach LogonUser, and supplies no new token error category. The artifact alone does not distinguish the READY inspector from its following validator; no raw logs, identities or private files are disclosed here.

Source inspection established a concrete campaign incompatibility: actual Phase1 production DATABASE_VERSION is3, while READY inspection required2 with only2 protected migration backups/3 total. Actual maintenance/restore and production-launcher verification also imported the current build but retained schema2 predicates. The coherent repair updates verification only, not product SQL or migration behavior. Report6 binds READY schema3, exactly3 protected predecessor backups plus1 ordinary backup. Nested maintenance evidence2 binds initial3 protected backups, then exactly2 protected and1 released after accepting one backup; restore evidence2 explicitly names schema_three. Launcher outer/result2 binds schema3 and3+1 backups. Historical reports1–5, nested evidence1 and launcher1 retain their original exact schema2 meanings; cross-version mixtures cannot pass. Fixed process/custody, marker, row-count, quarantine, all-case and cleanup gates remain mandatory. Store crash-boundary scenarios still test their actual predecessor0/1 outcomes unchanged.

Final local checks: Python159/159 PASS (expanded existing cases, not new test count); three CJS contract suites13/13 PASS; actual foundation-persistence plus context-source suites12/12 PASS; pinned quality, diff check and BUILD_VERIFIED PASS. The two earlier CJS attempts lacked normal build/test-output prerequisites and failed; they are retained separately, not described as product failures or clean passes. Existing historical sample and new failed artifact both revalidate as passed=false under the new reader. No local C#/PowerShell/Windows execution or new P1-06 acceptance is claimed. Final independent source/disclosure readback CLEAR; the next actual campaign remains necessary.

Final retained local evidence digests (logs are not published):
- Python159: `664a31a8792080503020f6bb2a68ae95f9c2d7039f855186a56fb33e0869ee67`.
- CJS13: `eb01cf34f02d6da033ada9a96e4ad21ebbb7c7ebc41d85a89958a03d362eadbf`.
- Actual service/context12: `a71226454d0ec484002088d1f8c60f87f0e5be7e1df3fcc686c65667ae2c839f`.
- Build: `8f83032384d612278af87d199eb4285ec209e665f53a55e95912c853447f66c6`.
- Historical failed-evidence readback: `7d5c7ca229c85998aa6b0a91022802f943f24669ac8a19ae4f0ee4a95316c84e`.

Current verification pins:
- validate_persistence.py: `40461ea1cbf498cff30079cfe4edbd904bc2f295c000777b0265772a05348f44`.
- persistence-control.cjs: `a17dd2255c7c5fa21c90a734171e1aa07ea7bc644ff6d704d5bfbb6bd049d910`.
- persistence-maintenance-contract.cjs: `7ad4f6abf37ab0da46b2f0c9e6860fa7ea63e82b003933088e14685a0e0feb35`.
- persistence-restore-contract.cjs: `fc6d5394dc0b0c8f45656575c88a78686c7d457b039ecaddfc3e4c5e1368e5d3`.
- persistence-launch-e2e-control.cjs: `7ea87d7dee67a4d1a1bff591a6f8f6f09675d38f57423a738d2c5f744e5091da`.

## Remaining vault preflight closure — 2026-11-03 15:44 UTC

The schema repair was published as f4be0bf7baad67bbd31ec7c6689390270fc759a4, exact local08a539e6ea89854000c31c59c2ce381fde65f8db/tree54f2d3e39d8821a8366df294bd905f096158ad3c. [Run41666214242](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41666214242) retained source587/587, foundation and Python159 PASS, then ended FAILURE. Its sanitized ZIP SHA256bf810a875eb88dc2a963d084160711feeb4cc1f9eff9dd67d9e513d3602617d7 proves actual source READY schema3 with3 protected+1 ordinary backup, mainReady/orderlyQuit and owned child cleanup all true. The subsequent first vault preflight failed; context remained empty and directoryCleanup=false. No new LogonUser outcome exists.

The previous source scan missed vault-control.cjs, which also opens the actual current database but still required schema2. This follow-on changes that one exact predicate to3, with no native/API call or proof relaxation. The existing campaign regression now enumerates all six current database-guard sites across READY, vault, launcher, maintenance and restore, compares them to the actual production DATABASE_VERSION, and rejects a synthetic stale predecessor mutation. Audit log schema2 and backup predecessor2 remain unchanged because they are different formats with legitimate historical semantics. Focused4/4 PASS, pinned quality and diff check PASS; no duplicate full build/Python run is claimed. Current Windows result remains FAIL until a new exact campaign. Independent final source/disclosure readback CLEAR. P1-06 remains UNMET.

## Actual terminal context result — 2026-11-03 15:52 UTC

The final corrective local7f1e22b7c435d70fe4ba7c05875fb677bb2bafc4/treeaa8ea81c9b826dab8d1cfa61128f619e11735c1e was published as f3dfad56b040897f108a6d1b0302e51b75ae2fbc with parentf4be0bf7baad67bbd31ec7c6689390270fc759a4. [Run41667295104](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41667295104) reached the actual fixed LogonUser call in both source and renamed-package modes. Both returned TOKEN_UNAVAILABLE_ACCESS_DENIED, with ownerBefore=true and distinctContext/foreignPositive/ownerBlobDenied/reverted/ownerAfter all false. Both context children retired SUCCESS/exit0, untruncated. This establishes the error class for this run only, not the underlying policy or a reason for historical TOKEN_UNAVAILABLE.

The artifact ZIP SHA256e4e6e530249e776fbdfb5e4ebd779b09c2d869966aac190b7848f4e737d79e54 was downloaded and rehashed; its sole validated.json was revalidated with the exact current strict validator. All non-context portions passed: both four-stage key-auth sequences, both actual READY3 summaries, eight store crash/reopen summaries, two maintenance summaries, two restore summaries and all14 native vault-stage summaries. failure=null and directoryCleanup=true prove the campaign completed collection and owned cleanup; aggregate passed=false remains mandatory because both context proofs failed. Source587/587, foundation and Python159 gates passed; downstream launcher was skipped after the strict aggregate failure and is not newly validated by this run.

The fixed sanitized [collected sample](P1-06-context-access-denied-2026-11-03.json) contains only closed public evidence fields, no account names, paths, tokens, ciphertext or raw logs. P1-06 cross-user criterion stays UNMET; Phase1 remains10/11 task-specific technical passes and formal0. No unchanged retry, new identity, account creation, token borrowing, privilege/ACL change or fallback was attempted.

Microsoft's [LogonUser documentation](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-logonuserw) documents the exact LocalService call and states that account logon rights matter. ACCESS_DENIED does not establish which underlying permission or policy caused rejection. Further cross-context evidence needs a supported, explicitly approved disposable Windows test context or a separately reviewed manual two-context procedure. Existing separate test accounts alone are not proof that this fixed LocalService helper will work. Do not request or store user credentials, and do not advise changing rights based only on this category. Final evidence/disclosure readback CLEAR; no implementation work remains possible on this identity proof under the present restricted runtime scope.

## Independent launcher selection — 2026-11-03 17:17 UTC

The user elected to defer the blocked cross-context check and continue independent work; this is not a PASS or completed P1-06 criterion. The previously repaired current-schema3 production first-launch/reopen scenario was skipped after the strict full matrix failed. It can run independently: Invoke-Foundation prepares the verified build/runtime, and Invoke-PersistenceLauncherE2E creates its own fresh owned root, provisions its own owner-scoped key and exercises first launch/reopen. It does not consume any full-matrix vault/restore roots or call the foreign-token helper.

An explicit phase-01 [p1-launcher] push selection now runs that existing scenario after unchanged source, foundation validation and owned-supervisor gates. The full matrix is skipped only for launcher-only push selection. Manual dispatch and [vault-context] retain full-matrix precedence, including a message containing both markers. The ordinary workflow skips either explicitly selected marker to avoid duplicate unrelated jobs; identical path filters remain. No continue-on-error, altered strict validator, weakened cleanup, native command or deadline change is introduced. A scoped green launcher run cannot make the previously failed full matrix green or satisfy P1-06.

Regression evaluates the actual workflow condition strings for ordinary, launcher-only, vault-only, both markers, manual dispatch, failed foundation and failed prior steps. Focused4/4 PASS, pinned quality and diff check PASS; no redundant production rebuild or Python run because product/probe/validator bytes are unchanged. Exact routing-log SHA256fb3afa1799223d7f8f0806d2ff05e979283e8a4a1922ce025f296dc8187b60e1. Full workflow SHA256384a1c034162b011a3faefbea2758b5a303f5ca78c5bbf61989e87a426bacec7; ordinary workflow bb852f1b9a3532c4c81288a4f7e9d686c70bbf0215de435e9c0e2476c96708c5; regression39f903a9e5bff0388899eddf6c76a9b6b91cf9fe1b6c1ed7f75717b6d0851213. Independent final source/disclosure review CLEAR; current-byte launcher Windows outcome remains pending. Technical10/11/formal0 unchanged.
