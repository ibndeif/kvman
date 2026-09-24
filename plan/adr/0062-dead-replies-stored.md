# ADR 0062 — Dead messages store their reply; waiters come with M1.6

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.5
- **Decided by**: the product owner

## Question

A dead message "replies `MESSAGE_DEAD` to waiters" (`03` §3.4). Continuations, `ctx.command` waits, and HTTP waiters arrive in M1.6 and M1.8. What does M1.5 do for waiters?

## Options

1. **Store the reply only**; M1.6 delivers stored final replies to every waiter kind through one path.
2. Also admit the `onReply` continuation for a dead message in M1.5.

## Decision

Option 1. M1.5 stores `{ ok: false, problem: MESSAGE_DEAD }` as the row's result; the problem's detail names the last attempt's code. M1.6 delivers stored final replies (`done`, `failed`, and `dead` alike) to continuations and `ctx.command` callers through one path; M1.8 to HTTP callers.

## Consequences

`15` M1.5 notes that waiters are reached from M1.6.
