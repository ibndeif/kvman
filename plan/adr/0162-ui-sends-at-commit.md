# ADR 0162 — `ui.*` sends at commit: rows, checks, rate limits, and replacement

- **Status**: accepted
- **Date**: 2026-09-29
- **Milestone**: M2.12
- **Decided by**: the product owner

## Question

`08` §8.11 and `02` §2.4 say the kernel handles `ui.toast`, `ui.notify`, `ui.dismiss`, and `ui.navigate` at commit, checks their action buttons like view actions, and folds the excess over 20 toasts and 10 notifications per extension and workspace per minute. They leave open:

- **Rows.** Is a `ui.*` send stored as a message (the envelope's `target` is for them), and what happens to one with `onReply` that is refused?
- **Folding.** Is the minute sliding or a clock minute? Do key replacements count? Where do excess toasts go, and what does the folded entry look like?
- **Entities.** An entity's `route` may use several `$item` fields (`06` §6.3), but a notification names only `{ type, id }`: who renders the route, and when?
- **Text and dismissal.** Are runtime `$t` keys checked against the sender's catalog? Which entries does `ui.dismiss { key }` remove?

## Options

- **Rows:**
  1. **Stored `done` rows** with `target` and the reply `{ ok: true }`. The rate limit counts them, and any refusal fails the unit.
  2. Not stored; the tray row only, with in-memory rate counters.
- **Folding:**
  1. **A sliding minute; every send counts; excess toasts and notifications fold into one tray entry.**
  2. The same, but key replacements do not count.
  3. Clock-minute windows.
- **Entities:**
  1. **The kernel resolves the route at admission and stores it.**
  2. The shell renders it at click time.
- **Text and dismissal:**
  1. **Keys unchecked; dismissal by the message's scope.**
  2. Keys checked against the sender's default catalog.

## Decision

Option 1 in each case.

**Types and senders**

- `ui.toast`, `ui.notify`, `ui.dismiss`, and `ui.navigate` are kernel-owned commands registered with access `extensions`, their `08` §8.11 payloads as input, and `{ ok: true }` as output.
- Only an extension and the kernel send them (`02` §2.4). A person, a widget, or a process (`proc:*`) gets `CALLER_NOT_ALLOWED`.
- An extension needs the `ui` capability in its grant for the unit's workspace (the intersection for a global invocation, ADR 0133). Without it the send is refused with `CAPABILITY_DENIED`.

**Admission at commit**

A `ui.*` send is checked in its unit's transaction, in this order:

1. The sender.
2. The payload (`VALIDATION_FAILED`).
3. The `ui` capability (`CAPABILITY_DENIED`).
4. The action buttons (`CAPABILITY_DENIED`).
5. The entity (`VALIDATION_FAILED`).

A refusal always fails the whole unit with that problem, not retryable, even when the send has `onReply` (`08` §8.11: a handler never commits half its work with a broken notification). The kernel's own sends skip checks 3 and 4.

**Rows and targets**

- An admitted send is stored as a `done` command row, handled by `kernel`, with the reply `{ ok: true }`. It shows in traces, a waiting `ctx.command` gets `{ ok: true }`, and a continuation receives it.
- Its `target` is:
  - for `ui.toast` and `ui.navigate`, the tab that started the correlation (`user:local/client:<id>`, the source of the correlation's root message) when there is one, else `user:local`;
  - for `ui.notify` and `ui.dismiss`, always `user:local`.

**Buttons**

- A `command` button is checked with the view-action rule (`08` §8.7, ADR 0157), with the sender as the view's author:
  - one of its own types, or a type its `calls` cover;
  - with access `all` or `user`, and never another extension's `user` command, even one its `calls` cover (`08` §8.11; a view may offer that one, a notification may not);
  - never a grant command;
  - a `kernel.*` type only as its capabilities allow.
- Types are resolved in the message's workspace. A global message resolves only the sender's own types and global-scope types, and a type it cannot resolve is refused, so the check fails closed.
- A `navigate` button is not checked.

**Entities**

- `entity: { type, id }` names an entity type registered by an extension enabled in the message's workspace (for a global message, one of the sender's own).
- The type needs a `route` whose `{{ $item.… }}` segments all name its `idField`. The kernel renders the route with the id (URI-encoded) and stores it as the entry's `route`, beside `entity`.
- An unknown type, a type without a route, a route that needs another field, or `route` and `entity` together fail `VALIDATION_FAILED`.

**Effects** (after commit, on the event stream, `12` §12.3)

- `ui.toast` is pushed as a `ui` message: to the tab in its target, else to every stream with the message's `workspaceId`.
- `ui.notify` stores or replaces its tray entry (below), publishes `kernel.notifications.changed`, and is pushed as a `ui` message.
- `ui.dismiss { key }`:
  - dismisses the sender's entry with that key in the message's workspace (the global entry for a global message);
  - is pushed, so tabs close the sender's toast with that key;
  - publishes `kernel.notifications.changed` when an entry was dismissed.
- `ui.navigate` is pushed only when its target is a tab; otherwise it is dropped.
- A muted extension's toasts and notifications for that workspace are stored but not pushed (ADR 0163).

**Replacement by key**

- A `ui.notify` with the same source, tray workspace (`''` for `global: true` or a global message), and `key` updates the existing entry in place: title, body, level, problem, route, entity, actions, attention, expiry, and `updated_at`. It keeps its id and `created_at`.
- It keeps its read state, unless the new level is `warning` or `error` and higher than the old one; then it is unread again.
- A dismissed entry with that key comes back as a fresh unread entry.

**Rate limits and folding**

- The kernel counts the stored rows of the same type, source, and message workspace created in the last 60 s.
- A `ui.toast` when there are already 20, or a `ui.notify` when there are already 10, is stored as its row but not shown: nothing is pushed and no tray entry changes. Key replacements count.
- Instead it raises the count of the extension's **folded entry** for that workspace: a tray entry with source the extension, no key, no title, and `folded: n`, which the shell draws from its `kvman:` catalog ("PDF Translator sent n more notifications").
- An unread folded entry grows (`n + 1`, `updated_at` now). Once it is read or dismissed, the next excess starts a new one at `n = 1`.
- A folded entry is never pushed as a `ui` message; its changes publish `kernel.notifications.changed`.
- `ui.dismiss` and `ui.navigate` are not limited, and the kernel's own notifications are never limited or folded.

**Text**

`$t` keys in runtime toasts and notifications are not checked against the sender's catalog. They are stored as sent, and the shell's fallback shows `⟨ns:key⟩` for a missing one (`08` §8.16).

## Consequences

- The kernel registers the four `ui.*` types.
- The router handles them in the commit's transaction, and `AppliedMessages` carries the `ui` pushes for the event hub.
- `08` §8.11, `02` §2.4, and `03` §3.8's `ui.*` row are corrected.
- A kernel-schema index on `messages` makes the rate count cheap (ADR 0163).
