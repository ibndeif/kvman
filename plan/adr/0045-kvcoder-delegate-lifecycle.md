# ADR0045 — Durable delegate authority, atomic delivery and confirmed cleanup

Status: accepted11 October2026 through owner confirmation; background policy selected separately as `live-origin-until-claim`.

## Decision
Implement selected KVC01/E94 and04–06 using internal workspace collection `delegate-starts`, accessor `delegateStarts`. Kernel-generated IDs identify both durable start authorization and terminal delivery receipt. No separate outbox or physical SQL table.

Every new row supplies required fields without defaults: `sessionId`, `turnId`, `toolCallId`, `ref` strings; `kind: subagent | worker`; `background: boolean`; `phase: prepared | claimed | settled | invalidated | needs-review`; `jobId`, `childTurnId`, `reason`: string|null; `delivery: foreground | background | discarded | null`; `cleanup: requested | confirmed | null`; `createdAt`, `updatedAt`: ISO datetime strings. Initially phase is prepared and nullable fields are null. Reuse captured resource configuration rather than copying launch payload/output.

Add internal `sessions.deleting: boolean` (legacy false, new creation explicitly false) and `processes.cleanup: requested | confirmed | null` (legacy null, new creation explicitly null). No public DTO/session status changes. Existing step-intent tracking remains until owned shutdown is confirmed.

Resource, permit and exact foreground wait/background started result commit together under current parent authority/grants. Child first-turn opening validates/claims its permit and records childTurnId with preparation of its existing step intent. Private program candidates carry `{runId, permitId}`; immutable candidate metadata and current authority/grants must pass before exclusive claim records winning jobId, before spawn. Publication cannot overwrite an early winner. Duplicate candidates cannot execute effects.

Authorized positive workspace commands may recover proven prepared work; Stop/delete never launch recovery. Null jobId never proves no enqueue. Unknown claimed effects become retained needs-review/interrupted, never automatic replay. This guarantees exclusive durable authorization to attempt execution, not exactly-once OS spawn or an atomic SQLite/enqueue transaction.

Positive delegate answer application revalidates exact question/binding and atomically records the existing answer receipt, creates captured run/permit, consumes the question, replaces/resolves pending and prepares permitted continuation. Matching retries only acknowledge; receipt proves acceptance, not launch. Ordering also obeys ADR0046.

One synchronous transaction records exact child/program terminal state/output, originating foreground result or background message/discard, nonnull delivery receipt and permitted parent continuation. Bind child messages to childTurnId, never a latest unrelated turn. Repetition is inert. Failure ending a parent records sibling cleanup requests before removing links. All notifications, external stop and enqueue remain postcommit.

Ordinary Stop/origin end invalidates unclaimed foreground and background starts. Background independence begins only after claim; already-started independent background work survives ordinary Stop, remains tracked and saves results. Delete/retention fences ancestry and requests shutdown of all owned foreground/background work, completely pages tracking and only removes records after confirmed owned shutdown. Repeated delete resumes cleanup; ambiguous metadata retains deleting/tracking.

Preserve legitimate legacy waits without fabricating permits/receipts, redelivering already-terminal legacy results or replaying uncertain launches. Keep-all adds no expiry. Cancellation ACK, stored terminal status or ambiguous NOT_FOUND alone does not prove physical shutdown; implementation must verify actual kernel/process ownership and stop-confirmation semantics.

## Verification
Native isolated original-entry tests must cover preparation/claim/publication/Stop races, duplicate candidates, uncertain recovery, receipt rollback/retry, exact same-transaction terminal delivery, sibling cleanup, deletion ancestry, complete paging and legacy compatibility. No new approval/default/sandbox/budget/retry/backoff policies. This ADR records approval, not implementation completion or successful checks.
