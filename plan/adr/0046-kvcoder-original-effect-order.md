# ADR0046 — Original effect order independent of answer order

Status: accepted11 October2026 through owner confirmation for selected KVC07.

## Decision
`turn.calls` is the canonical model call order. Add internal `turns.deferredCalls`: an array of `{toolCallId: string, call: RunCallDoc}`, with legacy read default empty and explicit empty arrays on new turns. An entry represents automatically permitted execution-ready work delayed by ordering; it is not user approval. `HeldResult.run` remains approved-only, including the inert legacy shell form. Approved delegate resources use ADR0045 permits rather than inferred approval from assistant history.

Only a ready prefix of effectful operations may execute, sequentially in original call order. Earlier unanswered decisions, unfinished foreground effects and unprovable bindings block later effects. Denial settles a slot without execution; cancellation invalidates remaining work. Proven-independent reads may remain parallel. Answer buttons remain unrestricted, and existing answer receipts and current grant/lease/held guards remain mandatory.

Existing durable step-intent authority may authorize ordered draining. It must not clear pending prematurely or request a new model response while unresolved work remains. Delegate launch joins the same ordering boundary. No extra user approvals, approval/default change, automatic replay of uncertain effects or exactly-once OS execution guarantee.

Source ownership extends to the necessary internal schemas, answer, settlement and delegate paths. Integration is serial with ADR0045 to avoid competing shared-module writers. Any additional persisted/public contract returns to the owner before documentation or source; this decision does not authorize arbitrary fields or new APIs.

## Verification
Native isolated original-entry scenarios cover reverse approval order, automatic effects behind an earlier approval, denial/cancellation, current permission withdrawal, delegate ordering and safe independent reads. Terminal/history tool results retain model order. Legacy approved-call semantics remain unchanged. This ADR records approval, not implementation completion or checked behavior.

## Amendment, 2026-10-12 (owner's choices; ADR 0052 removed the permits this ADR pointed to)

1. Only a pending approval holds later effects back. A foreground helper does not: several helpers in one reply still run in parallel, and a later effect in that reply runs as before.
2. An effect is a call that could change something: a built-in command that can ask for approval (a shell line, a file write or edit, an MCP tool call, a binary), or any registered command. Reads, help, and `ask` are not effects and still run at once, in parallel.
3. Effects of one reply are evaluated one after another in the model's order. One that would run automatically behind a pending approval is saved in `deferredCalls` instead. When the turn resumes, the step walks `turn.calls` in order and runs each approved call and each deferred call one after another, each with a fresh permission check and no new approval.
4. A `delegate run` behind a pending approval is not started and not saved: its result says that an earlier call in the reply waits for a decision and to make the call again afterwards.
5. A message that dismisses the pending approvals also settles the deferred calls without running them; their result says so. Nothing in the plan said which way this goes; not running is the choice that can be undone.

