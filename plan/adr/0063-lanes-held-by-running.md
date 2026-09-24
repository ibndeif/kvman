# ADR 0063 — Lanes are held by running messages; LANE_REENTRANT before ctx.command

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.5
- **Decided by**: the product owner

## Questions

1. Does a deferred command (`awaiting`, no handler running) keep holding its lane until `ctx.reply`?
2. `ctx.command` exists only from M1.6, yet M1.5 must detect `LANE_REENTRANT`. How far does M1.5 go?

## Options

1. **Awaiting releases the lane**; or awaiting holds it until the reply, deadline, or cancel.
2. **Build the detector now and wire it in M1.6**; or move the whole item to M1.6.

## Decision

1. A lane is held only by a `running` message. Deferring frees the lane for the next message (`02` §2.8: no handler runs while awaiting). `LANE_REENTRANT` therefore counts running ancestors only.
2. M1.5 builds the scheduler's check: given the calling invocation and the target's rendered lane, it fails `LANE_REENTRANT` when the lane is held by the caller or by a running ancestor in its causation chain (through messages and the events that caused them). It is tested directly. M1.6's `ctx.command` calls it before sending and adds the end-to-end test.

## Consequences

`02` §2.6 and §2.8 say a deferred command releases its lane; `15` notes the split between M1.5 and M1.6.
