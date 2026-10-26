# ADR 0105 — deleting artifacts: the agent, the person, and age

Status: accepted by the product owner on 2026-10-26. It amends plan 08 §8.1, §8.2, §8.5, §8.6, and §8.7, and ADRs 0009
(173 to 177), 0063 (1), and 0082 (13).

## Context

After ADR 0104, the owner asked that stale artifacts in a running chat be removed too, to save context. Their chat
"Manually Testing the Research App" held 20 artifacts, the limit: superseded reports, four previews of servers that had
ended, and five that the agent had emptied into "… — cleaned up" stubs, since nothing could delete an artifact, though
the 21st write's error says "or delete one". An artifact costs the model little context by itself (its write call's
long strings are cleared with its result, ADR 0097, 4; a summary lists ids and titles), but the agent spends calls
emptying ones it can't delete, and a full chat can't show anything new.

## Decisions

1. **`kvcoder.artifact.delete`**, one public command like `write` and `edit` (the owner chose it over a separate
   command for the person): `{ sessionId, payload: { id } }` → `{ id, deleted: true }`, for any chat of the job's
   workspace. An unknown `id` fails `NOT_FOUND`; unknown keys or a bad `id` fail `VALIDATION_FAILED`. The agent calls
   it as `artifact delete { id }`. A helper is refused, as for `write` and `edit` (ADR 0063, 1), and its prompt leaves
   it out.
2. **The agent deletes what is stale**: the `artifact` entry says to delete an artifact that is superseded or no
   longer true, and never to empty one to clear it.
3. **The person deletes in the panel** (the owner's choice): a trash icon, "Delete", after Copy, for an artifact (not
   the map or the changes); pressing it shows "Delete this artifact?" with Cancel and Delete in the panel, as the chat
   menu's delete does. Delete runs the command, and the panel shows the next artifact or closes.
4. **The agent is told of the person's delete** (the owner's choice, like the person's Stop): when the caller is the
   person, the chat gets one message, ``The person deleted the artifact `<id>`.``, with kvcoder's own source
   `{ kind: 'extension', name: '@kvman/kvcoder' }`, which the conversation shows as the muted card "kvcoder told the
   model" (ADR 0009, 188); it is queued while a turn runs and starts no turn. An extension's or the agent's delete adds
   nothing.
5. **Expiry by age** (the owner's choice, off by default): the setting `kvcoder.artifacts.keepDays`, an integer of 0 or
   more, 0 by default, which keeps every artifact; it is on the Chats card after `kvcoder.sessions.keep`. The daily
   `kvcoder.session.prune` deletes, after the sessions it deletes, the artifacts of every format whose `updatedAt` is
   more than that many days old, in each idle chat; a chat that isn't idle keeps them until a later run. It now runs
   its two parts apart, so either setting alone works. Each chat that lost some gets one message with kvcoder's own
   source, ``Artifacts not updated in <N> days were deleted: `<a>`, `<b>`.``, ids in order, starting no turn.
6. **The owner's chat is cleaned by its agent**: once this is released, the owner asks that chat to delete what is
   stale. No database is edited by hand.
