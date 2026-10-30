# Branch Cleanup and Recovery Record

Date: 2026-10-30. User requested short, clear branch names and removal of obsolete/incorrect material after verification. No main merge or history rewrite is included.

## Target names and current operation state

| Ref | Intended action | State at document preparation |
|---|---|---|
| main | Keep accepted baseline | Unchanged at e85d2c0c67a3aefa11dc390739243653d2b1bbf0 |
| phase/00-feasibility | Rename to phase-00, same head/history | Pending authenticated rename; expected head 34b964956e530dbc9d5b97dcb8564e49aa1c4fdf |
| plan | Publish normalized documentation for draft review | Local branch prepared; publication must be verified before claiming remote availability |
| planning/clean-slate-master-plan | Remove obsolete branch ref after recovery proof and head recheck | Pending authenticated cleanup; historical head 7dbaa8967d15982943091daf788256e6de7c3065 |
| feat/facebook-fixed-workflows | Remove obsolete initial-README branch after head recheck | Pending authenticated cleanup; expected head 7f4a747d82f2838b0031629dc39fb16c96712608 |

No old ref is deleted by creating this record. An unexpected new commit or new dependent PR stops cleanup until reconciled. No force push.

## Preservation proof

- Planning and main final trees match exactly: fa8081be17d24300ea315e8aa2f78183c07a5435.
- The planning history has 76 commits not in main ancestry because PR #1 was squash-merged; do not call those original commits preserved in main.
- Complete Git bundle backup was created and supplied privately to the owner as Fonesi-Auto-planning-history-backup-2026-10-30.zip. It contains the original root plus all 76 planning commits.
- Bundle SHA256: 88679347959cafe94f7211ebc60e98cde08e63fc225c99e4ae851fa152411e42.
- Verified with git bundle verify, explicit fetch into an independent empty repository, git fsck --full, 77-commit count and exact original head/tree. The archive includes recovery commands; this record contains no private download URL.
- The obsolete feature head is the direct parent of main and an ancestor of the active phase; its history remains reachable from kept refs.
- No open PR depended on the old refs at the safety-check snapshot. Recheck immediately before mutation.

## Current limitations

Git push in the working environment lacks credentials. The connected repository tools can publish documentation but do not expose rename/delete-ref operations. The cloud browser requires an authenticated owner session for those operations; a secure sign-in request has been presented. Until confirmed, the original remote branch names remain authoritative.

## Historical documents

The original approved PHASE-00-feasibility.md and host evidence retain their original branch names and bytes. After a successful rename, update this record and current workflow/status pointers rather than silently rewriting accepted execution history.
