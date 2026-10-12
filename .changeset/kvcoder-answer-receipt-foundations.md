---
"@kvman/kvcoder": patch
---

Add internal workspace-scoped answer-receipt schemas and ordinary/transactional collection accessors without changing public answer inputs, outputs or session DTOs. New receipts require exact question/turn/call identity, kind, SHA-256 fingerprint and timestamp; they have no raw answer, copied question/options, launch payload or defaults.

Extract shared typed-answer normalization from existing ask validation and add a canonical fingerprint helper for receipt retries. Preserve first-application choice membership rules, ordered arrays, exact text and existing approval decisions; approval dismissal and denial share the normalized false fingerprint. Existing question/approval integration tests remain passing.

Atomically apply ordinary ask answers/dismissals, nondelegate approval decisions and delegate denial/dismissal with held results, pending updates, question deletion, receipt insertion and last-pending intent preparation in one synchronous transaction. Matching normalized retries acknowledge without mutation, recovery or dispatch; conflicting answers fail the existing VALIDATION_FAILED without exposing answers or fingerprints. Verify current-job hints against exact immutable metadata and the receipt's same active turn, rechecking after awaits and never attaching a stale retry to a new turn.

Run workspace recovery only after a newly committed ordinary application, deferring its own session's dispatch and publishing the prepared identity outside SQLite. Preserve existing positive delegate foreground/background/refusal behavior WITHOUT a receipt: existing run records cannot prove durable launch. Durable delegate launch, confirmed-owned cleanup/retention and full KVC-01/20 completion remain open; additional persisted permit data requires separate approval. Public command shapes, DTOs, policies/defaults and retry/backoff counts are unchanged.
