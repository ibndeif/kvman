# ADR 0043 — atomic kvcoder finish/inbox decision

Status: records the product owner's already selected KVC-09 decision, before this focused acceptance/correction batch. It adds no public or persisted-data contract.

## Decision

1. A canonical step's no-call reply checks/drains its session's inbox and decides end versus successor in one synchronous transaction. With reply-requiring messages it settles and prepares the successor there; with no such messages it commits the terminal state there. A normal user send whose acceptance commits after the terminal decision sees idle and opens a new turn with its initial intent atomically.
2. Every accepted queued record must be preserved once, in inbox order, with its existing source/attachment metadata. A storage read page of1000 is not a total-inbox cap. Normal processing and terminal draining must enumerate the complete inbox in that transaction, without a later asynchronous drain/decision gap.
3. Existing intentional termination is unchanged: Stop/cancellation, model failure, lost-reply exhaustion and configured maxSteps can end without replying to every queued message, but preserve their messages in history with the existing outcome/notice and never silently leave an idle hidden inbox. No automatic continuation after these terminal policies and no new default, budget or cap.
4. The canonical turn/intent/generation/job lease fences the complete transition. Stale/cancelled/replaced steps cannot drain or finish newer work. Failure, including safe-integer successor overflow or an injected fixture-only post-transition throw, rolls back inbox movement, sequence updates and end/successor state together.
5. Enqueue, cancellation, points and notifications remain outside SQLite. A postcommit enqueue failure retains the prepared intent for the already approved positive-workspace recovery policy; it is not an atomic SQLite+kernel enqueue promise.
6. Preserve existing handler injection loop safety: an idle message injected by a recognized session handler is stored without starting a turn, for the next explicit turn. Ordinary public sends/injections that may start retain their existing behavior. No new mayStart field or source policy.
7. This is not KVC-04–06 parent-start/owned-cleanup/atomic-child-delivery approval. Those persisted contracts and their dependent completion remain separate. Public message/turn/session DTOs, approval policies, attempts/backoffs and configured maxSteps are unchanged.

## Acceptance

Use the original default entry in native isolated SQLite/testkit/temp homes and explicit gates immediately before/after the actual finish transaction. Verify both serial commit orderings of public send versus finish, concurrent sends delivered once, a committed prepared successor before dispatch, cancellation/stale finish, rollback/overflow, complete queued preservation beyond two storage pages and handler no-auto-start. Run related lifecycle/message/steering/limit/recovery/worker/types/lint/build checks and narrow read-only review; full/global gates wait until all selected changes. No production fault hooks, sleeps, skips, masking retries, weakened assertions, timeout increases, user-home/settings/server3737 or Git index changes.
