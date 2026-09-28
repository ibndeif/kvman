# ADR 0163 — The notification tray: items, scope, muting, the stream, and retention

- **Status**: accepted
- **Date**: 2026-09-29
- **Milestone**: M2.12
- **Decided by**: the product owner

## Question

`08` §8.11 and `03` §3.8 name `kernel.notifications.list { workspaceId?, unreadOnly? } → { items }`, `.count`, `.read`, `.read-all`, `.dismiss`, `.mute`, and `kernel.notifications.changed { workspaceId }`, but leave open:

- **Shapes.** The shape of an item, and what `workspaceId` absent means.
- **The stream.** The event stream's `ui` message (`12` §12.3) has no workspace, yet a toast goes "to every tab showing the message's workspace".
- **Muting.** Which entries a mute covers, and what the kernel does with them.
- **Retention.** How §4.9's trimming meets dismissed entries and the 200-entry cap.

## Options

- **Shapes and scope:**
  1. **Scoped like event subscriptions (ADR 0098)**: with `workspaceId`, that workspace and global entries; without it, every entry. The `ui` message gains `workspaceId?`.
  2. Without `workspaceId`, global entries only.
- **Muting:**
  1. **That workspace's entries only**: listed as muted, not counted, not pushed.
  2. Also the extension's global entries shown in that workspace.

## Decision

Option 1 in each case.

**Items.** `kernel.notifications.list` answers `{ items: NotificationItem[] }`:

```ts
type NotificationItem = {
  id: string; workspaceId?: string;          // absent = global (stored with ws '')
  source: Address;                           // 'kernel' or 'ext:<name>'
  key?: string; level: Level;
  title?: Text; body?: Text; problem?: Problem; route?: string; entity?: { type: string; id: string };
  actions?: NoticeAction[]; attention: boolean; expiresAt?: number;
  read: boolean; muted: boolean;
  folded?: number;                           // a folded entry (ADR 0162): no title, n excess sends
  createdAt: number; updatedAt: number;
};
```

**Scope**

- With `workspaceId`, a query or command covers that workspace's entries and the global ones. Without it, it covers every entry.
- Dismissed and expired entries (`expiresAt ≤ now`) are never listed or counted.
- The list comes newest first by `updatedAt`, with unread `attention` entries pinned at the top. `unreadOnly` leaves out read entries.

**Tray API**

- **`kernel.notifications.count`** answers `{ unread, attention }`:
  - `unread` counts unread entries that are not muted;
  - `attention` counts those among them with `attention`.

  The event stream's `hello` carries the count without a workspace.
- **`kernel.notification.read { id }`** and **`kernel.notification.dismiss { id }`**: an unknown or dismissed id fails `NOT_FOUND`. Reading an entry that is already read answers `{}` and changes nothing. The person may dismiss any entry.
- **`kernel.notifications.read-all { workspaceId? }`** marks every unread entry in scope read.
- **`kernel.notifications.changed`** is a transient kernel event, published globally with the payload `{ workspaceId? }` (absent for a global entry). It goes out in the same unit as each change of an entry: stored, replaced, folded, dismissed, read, muted, or trimmed while visible. A command that changes nothing publishes nothing.

**Muting**

- `kernel.notifications.mute { workspaceId, extension, muted }` (access `user`) is stored as `user_preferences.data.muted: { [workspaceId]: extension[] }`.
  - `kernel.user.preferences.set` keeps it.
  - An unknown workspace fails `WORKSPACE_INVALID`; a name that is not an installed extension fails `NOT_FOUND`.
  - A mute that changes nothing answers `{}` without an event.
- A mute covers the extension's entries in that workspace, never its global entries and never the kernel's.
  - Muted entries are stored and listed with `muted: true`.
  - They are left out of the counts.
  - The kernel pushes no `ui` message for that extension's toasts or notifications in that workspace.

**The stream**

The `ui` message is `{ clientId?, workspaceId?, type, source, payload }`, with `workspaceId` being the message's workspace (absent for a global one). The kernel sends it to every connected stream: a tab-targeted message (ADR 0162) carries the tab's `clientId`, and the shell routes the rest to the tabs showing that workspace.

**Retention** (`04` §4.9)

- The kernel's housekeeping, which runs with blob collection every 10 minutes (ADR 0139), deletes:
  - expired entries;
  - dismissed entries;
  - entries read more than 7 days ago;
  - entries not updated for 30 days.
- The 200-entry cap per workspace (by `updated_at`) is applied when an entry is stored, so a list is always complete.
- Removing a visible entry publishes `kernel.notifications.changed` for its workspace.
- Kernel schema 6 adds the indexes these reads need: on `notifications (ws, updated_at)`, and on `messages (source, type, created_at)` for the `ui.*` rows the rate limit counts (ADR 0162).

## Consequences

- `@kvman/protocol` gains the tray request, answer, and event schemas, and the `ui` stream message's `workspaceId` (changeset).
- `08` §8.11, `03` §3.8, `12` §12.3, `04` §4.1, and `04` §4.9 are corrected.
