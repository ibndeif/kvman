# ADR 0059 — Attempts, the backoff ladder, and repeated conflicts

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.5
- **Decided by**: the product owner

## Questions

1. Max attempts is 3 (`02` §2.13, `13` §13.1), but the backoff ladder has three steps (1 s → 5 s → 30 s), and `15` M1.5 says retries "follow 1 s → 5 s → 30 s and end dead". With 3 attempts only two retries happen.
2. `STORAGE_CONFLICT` reruns the handler at once, up to 5 times, without counting an attempt (`03` §3.4, `04` §4.3). What happens on the sixth conflict?

## Options

1. **3 attempts, ladder capped**; 3 retries (4 runs); drop the 30 s step.
2. **A counted retry**; fail at once with `STORAGE_CONFLICT`.

## Decision

1. `maxAttempts` counts runs: a failed attempt that brings `attempts` to `maxAttempts` makes the message `dead`. Retry *n* waits the *n*-th ladder step: 1 s, 5 s, 30 s, and 30 s for every later retry. The default of 3 therefore retries after 1 s and 5 s, then dies; the M1.5 test uses `maxAttempts: 4` to show the whole ladder.
2. The sixth conflict in one attempt is a retryable failure like any other: `attempts + 1`, the backoff ladder, and `dead` at the maximum. The budget of 5 immediate reruns starts again with the next attempt.

## Consequences

`02` §2.13, `03` §3.4, and `04` §4.3 state both rules; `15` M1.5 names the `maxAttempts: 4` test.
