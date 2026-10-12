# ADR 0054 — incomplete replies, and long files written in parts

Status: accepted by the product owner by choice on 2026-10-12, before source. This records KVC-14.

## Decisions

1. **An incomplete reply.** A reply with no call that is empty (no text), or that the provider cut at its length limit, is incomplete. It is not a lost reply (ADR 0009, 188), which is checked first. The first one in a turn gets one hint from kvcoder, as a `user` message with `source: { kind: 'extension' }`, saying that the reply was empty or cut and to go on in smaller pieces, with `fs part` for a long file; then another step runs. The second one ends the turn `failed` with the notice `REPLY_INCOMPLETE { reason: 'empty' | 'length' }`. A cut reply's text is kept. The notice takes the Retry and Choose-another-model actions and `kvcoder.turn.retry`. The internal `turns.incomplete` counts them (old records read 0).
2. **`fs part { path, part, content }`** → `{ path, part, parts, bytes }`, the command `kvcoder.fs.part`. It saves one numbered piece of a file the chat is writing, in the workspace collection `file-parts` `{ sessionId, path, part, content, updatedAt }`, and writes nothing in the workspace, so it never asks. `part` is 1 to 200; `content` is at most 64 KB, and more fails `TOO_LARGE`. Saving a number again replaces that piece. `parts` is the numbers held, in order, and `bytes` their total.
3. **`fs assemble { path, risky }`** → `{ path, created, bytes, parts }`, the command `kvcoder.fs.assemble`, asks as `fs write` does. It joins pieces 1 to n in order and writes the file through the safe change of ADR 0053 (the chat's view, the atomic replace, the restore copy), then deletes the pieces in the same transaction. With no piece it fails `NOT_FOUND`; with a number missing it fails `VALIDATION_FAILED` naming the missing numbers, and writes nothing.
4. A chat's pieces are deleted with it.

## Verification

Scenarios M2.4-E162 to E165, written before source.
