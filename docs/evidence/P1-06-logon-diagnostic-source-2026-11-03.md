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
