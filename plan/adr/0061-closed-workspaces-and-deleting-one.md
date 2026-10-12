# ADR 0061 — closing workspaces whose folder is gone, listing the closed ones, and deleting one

Status: accepted by the product owner by choice on 2026-10-12, before source. This records KVC-48.

## Context

A workspace is remembered until it is closed, and closing only pauses it: its data stays. Nothing ever removed one. The owner's home held 48 workspaces, 21 of them closed and 6 whose folder no longer exists.

## Decisions

1. **A folder that is gone.** When kvman starts, each open workspace whose path is no longer a folder is closed, before the start folder is opened. Its data stays, and opening the path again, once it exists, brings it back (plan 02 §2.6).
2. **The closed ones.** `kernel.workspace.closed.list {}` → `[{ id, name, path, missing }]`: the closed workspaces in the order they were first opened; `missing` says that the path is not a folder now. `kernel.workspace.list` is unchanged.
3. **Deleting one.** `kernel.workspace.delete { workspaceId }` → `{}` erases a closed workspace for good.
   - Home fails `VALIDATION_FAILED`, an open workspace fails `VALIDATION_FAILED` (it is closed first), and an unknown id fails `NOT_FOUND`.
   - It first stops the workspace's work: its running async jobs are cancelled and waited for, and its processes (§2.16) are stopped.
   - Then, in one transaction, it deletes the workspace's row, every extension's stored data and the settings of that workspace, and its file rows, jobs, schedules, and process rows, and queues the handler jobs of `kernel.workspace.deleted`. After the transaction it removes the contents of the deleted files.
   - A workspace that was opened again while its work was being stopped fails `VALIDATION_FAILED`, and nothing is erased.
   - The folder on disk is never touched.
4. **The point.** `kernel.workspace.deleted { workspaceId }` is a lifecycle point. Its handler jobs run in Home, since the workspace is gone; an extension clears there what it keeps outside the workspace's own data.
5. **The picker.** Under the open workspaces, kvwebui's workspace picker has a "Closed workspaces" section that folds, with their count: each one's name and folder, "folder missing" on a missing one, "Reopen" on the others (`kernel.workspace.open`), and "Delete". Delete asks inline, "Delete this workspace's data? Its folder is not touched.", with Delete and Cancel. "Delete all missing" shows when one is missing, asks the same way with their count, and deletes each. The section isn't shown when no workspace is closed.

## Limits

A sync job that began in the workspace before it was closed isn't waited for. Deleting is permanent.

## Verification

Scenarios M2.4-E201 to E208, written before source.
