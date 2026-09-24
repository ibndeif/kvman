# ADR 0064 — Aging and fairness participants

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.5
- **Decided by**: the product owner

## Questions

1. `background` messages "waiting more than 30 s are treated as normal" (`02` §2.6). When does the 30 s clock start?
2. Fairness is "round-robin across workspaces, then across lanes" (`03` §3.4). Where do messages without a workspace and keyless messages fit?

## Options

1. **When the message becomes runnable**; or from `createdAt`.
2. **Extra participants**; or messages without a workspace first in their class.

## Decision

1. From the moment the message entered a queue: its admission, its timer coming due, or its retry backoff ending. A delayed or backed-off message does not age while it may not run.
2. Messages without a workspace form one more participant in the workspace rotation. Inside a workspace (or the no-workspace participant), each lane queue and each handler's keyless queue take turns, one message per turn. A lane queue offers only its head; a keyless queue offers its highest class, then lowest `seq`.

## Consequences

`02` §2.6 and `03` §3.4 state both rules.
