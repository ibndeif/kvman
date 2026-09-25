# ADR 0098 — Event stream: transient seq, workspace scope, connections, resync

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.8
- **Decided by**: the product owner

## Question

The event stream (`12` §12.3) leaves four things open:

- the required `seq` of a transient event, which has no `events` row;
- what a subscription's optional `workspaceId` selects;
- what happens when one stream id connects twice, or a subscription arrives for a stream with no open connection;
- when `resync` is sent, with which reasons, and what happens to the stream's subscriptions.

## Options

- **Transient `seq`:**
  1. **The current cursor, with no `id:` line.**
  2. Make `seq` optional.
  3. Store transient events.
- **Workspace:**
  1. **Its workspace plus global events; without a `workspaceId`, every event.**
  2. The exact scope.
  3. The workspace only, or every event.
- **Connections:**
  1. **The newest connection wins; a subscription needs a connection.**
  2. The first connection wins.
  3. Both stay open.
- **Resync:**
  1. **Two reasons, and the subscriptions are dropped.**
  2. One reason, and the subscriptions are kept.
  3. Close the stream instead.

## Decision

Option 1 in each case:

- **Transient `seq`.** A transient event's `seq` is the kernel's cursor when it is sent, which is the newest durable seq. It has no `id:` line, so it never moves the resume cursor.
- **Workspace scope.** A subscription with a `workspaceId` receives that workspace's events and global events (those without a workspace). A subscription without one receives every event. Live events follow the same rule. A new live subscription first receives the address's ring (the last 1,000 chunks, `02` §2.5).
- **Connections.**
  - A new connection for a stream id replaces the open one, whose response ends with no message.
  - `POST /subscriptions` for a stream with no open connection answers 404 `NOT_FOUND`.
  - `DELETE /subscriptions/:sid` for an unknown sid answers 204.
  - A late reply for a stream that is not connected is dropped; the shell checks `GET /messages/:id` after it reconnects.
- **Resync.** The kernel drops the stream's subscriptions, sends `resync { reason }`, and keeps the connection open. The reasons are:
  - `cursor-expired`: `Last-Event-ID` or `since` is older than the oldest event row still kept;
  - `cursor-unknown`: the cursor is ahead of the newest seq.

## Consequences

`12` §12.3 states the four rules.
