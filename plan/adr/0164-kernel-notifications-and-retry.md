# ADR 0164 — The kernel's own notifications and `kernel.message.retry`

- **Status**: accepted
- **Date**: 2026-09-29
- **Milestone**: M2.12
- **Decided by**: the product owner

## Question

`08` §8.11, `03` §3.6, §3.8, and `04` §4.7 say the kernel notifies the person when an extension is quarantined, a migration fails, a message of a person's correlation is dead-lettered (with a Retry that sends `kernel.message.retry`), and the secrets file cannot be written. They do not give the keys, parameters, workspaces, or buttons. They also do not say whether a migration that fails without a quarantine notifies.

`kernel.message.retry` (`03` §3.8, admin, "dead or pending messages") is in no milestone's Build list; the inspector (M5.4) only uses it.

## Options

- **Notifications:**
  1. **Four kinds, keyed, including a migration that fails without a quarantine.**
  2. Migration failures only through the quarantine.
- **`kernel.message.retry`:**
  1. **Built now; `kernel.message.discard` stays with M5.4.**
  2. Retry and discard both now.
  3. Only the button now; the command in M5.4.

## Decision

Option 1 in each case.

**Notifications.** All four are sent by the kernel as `ui.notify` in the unit that records the event, with level `error`. Their text is `kvman:` catalog keys, which the shell ships (M3). They are never rate limited or muted.

| When | Workspace | Key | Title | Also |
|---|---|---|---|---|
| An extension is quarantined (any reason, `03` §3.6) | global | `quarantine:<extension>` | `{ $t: 'notifications.quarantined', extension, reason }` | button `{ label: '$t.notifications.actions.recovery', navigate: '/_kvman' }` |
| A data migration fails and the old version stays active (no quarantine, `04` §4.8) | global | `migration:<extension>` | `{ $t: 'notifications.migrationFailed', extension }` | `problem`: the problem it failed with (`MIGRATION_FAILED`, or `CONFIG_INVALID` from the last step's config check) |
| A message is dead-lettered and its correlation's root message was sent by a person (source `user:*`) | the dead message's (global if it has none) | `dead:<messageId>` | `{ $t: 'notifications.messageDead', type }` | `problem`: the stored `MESSAGE_DEAD`; button `{ label: '$t.notifications.actions.retry', command: 'kernel.message.retry', payload: { messageId } }` |
| A write of `secrets.json` fails after its commit (`04` §4.7) | global | `secrets:<extension>:<name>` | `{ $t: 'notifications.secretsWriteFailed', extension, secret: name }` | one per changed secret; clearing an uninstalled extension's secrets gives key `secrets:<extension>` and `{ extension }` only |

- `extension` is the package name.
- The dead-letter notification applies to both paths that make a message dead: the last retry and the boot recovery of interrupted rows (ADR 0091).
- If the root message's row is gone (retention), no notification is sent.
- A secrets failure is recorded by a kernel unit of its own after the failed file write, since the write happens after the commit.

**`kernel.message.retry { messageId } → {}`**

- An administrator (a person, the kernel, or an extension granted `kernel.admin`, ADR 0079) may send it; anyone else gets `CAPABILITY_DENIED`.
- **A dead message** goes back to `pending`:
  - attempts `0`, no `not_before`, and no stored reply;
  - its `onReply` is cleared, because its sender already received `MESSAGE_DEAD` and must not get a second continuation.
  - The scheduler places it again.
- **A pending message** has its `not_before` cleared, so it runs at the next pass.
- A message in any other state fails `VALIDATION_FAILED`, naming the state. An unknown id fails `NOT_FOUND`.
- The retry itself publishes no event. The message's own run publishes as usual.
- `kernel.message.discard` is built with the inspector (M5.4).

## Consequences

- The quarantine, migration-end, retry, and boot-recovery units carry the notification. The secrets writer enqueues a kernel unit when the file write fails.
- The kernel registers `kernel.message.retry`.
- `03` §3.8 (`kernel.message.retry`, the notifications paragraph), `08` §8.11 ("Errors: who tells the person"), and `04` §4.7 are corrected.
