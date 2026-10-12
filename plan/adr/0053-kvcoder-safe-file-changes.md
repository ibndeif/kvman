# ADR 0053 — safe file changes: one writer at a time, stale writes refused, atomic replace, and undo

Status: accepted by the product owner by choice on 2026-10-12, before source. This records KVC-12 and KVC-13.

## Decisions

1. **One writer at a time.** `fs write`, `fs edit`, and `fs undo` do their read, their checks, and their replace inside one store transaction. The kernel's transaction takes SQLite's write lock when it begins, so only one worker is in it at a time, and a worker that dies releases it. The file is its real path, after symlinks, so two spellings of it are one file. Nothing is stored for the lock. Programs outside kvman are not in it.
2. **What each chat saw.** The workspace collection `file-views` holds `{ sessionId, path, fingerprint, updatedAt }`: the real path and the SHA-256 of the whole file as the chat last read or wrote it. A successful `fs read` of any part of a file records it, from the step that made the call. Changing an existing file fails `VALIDATION_FAILED` when the chat has no view of it ("read it first") or the file no longer matches the view ("it changed since this chat read it; read it again"). A new file needs no view. A helper is its own chat.
3. **Atomic replace.** The new content is written to a file beside the target and renamed over it, with the target's permission bits. A failure leaves the target as it was and removes the file beside it.
4. **Restore copies.** The workspace collection `file-backups` holds `{ sessionId, path, previous, written, createdAt }`: `previous` is the file's content before the change, base64, or `null` when the change created the file; `written` is the fingerprint of what the change wrote. A change whose previous content is over 1 MB saves no copy and still happens. A chat keeps its newest 20 copies. Views and copies are deleted with their chat. They live in kvman's database, not the workspace.
5. **`fs undo { path, risky }`** → `{ path, removed, bytes }`, registered as the command `kvcoder.fs.undo`, asks for approval as `fs write` does. It takes the chat's newest copy of the file. With none it fails `NOT_FOUND`. When the file no longer matches `written`, it fails `VALIDATION_FAILED` and changes nothing: the file was changed since. Otherwise it restores `previous`, or removes the file when the change had created it, deletes that copy, and updates the view; the next undo goes one change further back. It never uses Git.

## Verification

Scenarios M2.4-E156 to E161, written before source. Linux is checked here; the rename on Windows and macOS is not.
