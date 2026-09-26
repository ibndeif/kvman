# ADR 0122 — Forgetting a workspace

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.3
- **Decided by**: the product owner

## Question

Three parts of `kernel.workspace.forget` (`04` §4.4) are open:

- `15` M2.3's Done-when has forget cancel "a running handler, a deferred command, and a running process". Processes (`ctx.process`, the supervisor) arrive in M2.6.
- Step 1 stops admitting messages for the workspace. Step 2 says a cancelled deferred command's `onAbort` runs, and that `onAbort` command belongs to the same workspace.
- The plan does not say in which scope `kernel.workspace.opened`, `.renamed`, and `.forgotten` are published.

## Options

- **Processes:**
  1. **Move the process part to M2.6.**
  2. M2.3 kills `processes` rows even though nothing creates them yet.
- **`onAbort`:**
  1. **Admit the kernel's own `onAbort` sends and wait for them.**
  2. Skip `onAbort` on forget, as uninstall does.
- **Event scope:**
  1. **All three are global.**
  2. `opened` and `renamed` in the workspace; `forgotten` global.

## Decision

Option 1 in each case.

**Processes.** M2.3 proves forget with a running handler and a deferred command. M2.6 adds killing the workspace's processes (`03` §3.7) and the process part of invariant 13 (`14` §14.3).

**Order of forget:**

1. The workspace is marked as being forgotten. From then on, every message for it is refused `WORKSPACE_INVALID`, except the kernel's own sends and publishes: the `onAbort` commands and the continuations of the messages it cancels.
2. Every unfinished message of the workspace is cancelled with `kernel.cancel` semantics (`02` §2.9). Running invocations are aborted, and deferred commands end `CANCELLED` and send their `onAbort`. Forget waits for all of these, the `onAbort` commands included, to settle, for at most 10 s. It then aborts the rest. Anything an `onAbort` handler sends to the workspace is refused `WORKSPACE_INVALID`.
3. One transaction deletes the workspace's rows (`04` §4.4 step 3) and publishes `kernel.workspace.forgotten`. The folder is never touched.

The fault point `workspace.forget.after-cancel` sits between steps 2 and 3. Invariant 13 holds whatever the crash point: a forget interrupted before step 3 is redelivered and finishes.

**Unknown workspaces (follow-up answer).**

- From M2.3, admission refuses every message whose workspace has no row, or is being forgotten, with `WORKSPACE_INVALID`. No row is stored, and the adapters answer 422.
- The dispatch check of ADR 0075 stays, for a workspace forgotten between admission and dispatch.
- A forget sent with the workspace it forgets has its own row deleted with the rest. Its reply still reaches its waiters, because the unit settles it after the deletion.

**Scope.** `kernel.workspace.opened`, `.renamed`, and `.forgotten` are published without a workspace, so every tab's switcher receives them (ADR 0098). `forgotten` has to be global anyway, since forget deletes the workspace's event rows.

## Consequences

- `15` M2.3's Done-when drops the process; M2.6's Build and Done-when gain it.
- `04` §4.4 names the `onAbort` exception and the 10 s wait.
- `03` §3.8's events table says the three workspace events are global.
- ADR 0075's dispatch check now covers only the forget race; M1.6-E37 tests that race, and admission refuses unknown workspaces.
