---
"@kvman/protocol": minor
---

`invoke` carries the invocation `deadlineAt`; new `abort { invocationId, reason }` and `loadFailed { invocationId, problem }` frames (ADRs 0081, 0084); `cancelRequestSchema` and `cancelResultSchema` for `kernel.cancel`; `quarantineReasonSchema` and `extensionQuarantinedSchema` for `kernel.extension.quarantined`.
