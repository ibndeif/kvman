# ADR 0011 — `Issue.severity` and `Problem.retryAfterMs`

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.2
- **Decided by**: the product owner

## Question

`13` §13.1 defines `Problem` and its validation issues, but:

- `kernel.validate` returns `{ ok, issues }` that include warnings (naming grammar `02` §2.4, literal text `08` §8.16), and an issue has no severity;
- `HANDLER_UNAVAILABLE` during a reload carries `retryAfterMs: 1000` (`06` §6.6) and `LLM_CALL_FAILED` carries the provider's retry-after (`05` §5.11), and `Problem` has no field for either.

## Options

1. **Add both fields** — `Issue.severity?: 'error' | 'warning'` and `Problem.retryAfterMs?: number`.
2. Severity only; retry-after inside `Problem.params`.
3. A separate `warnings` list in `kernel.validate`'s result, plus `Problem.retryAfterMs`.

## Decision

Option 1. `Issue` gets `severity?: 'error' | 'warning'` (absent means `error`), and `kernel.validate`'s `ok` is false exactly when some issue is an error. `Problem` gets `retryAfterMs?: number`. The provider-side name is `retryAfterMs` too (`llmProblem(code, detail, { retryAfterMs })`).

## Consequences

- `13` §13.1 shows both fields and names `Issue` as its own type; `03` §3.8 (`kernel.validate`), `03` §3.12, `05` §5.11, `13` §13.2, and `15` M4.1 use `retryAfterMs`.
