---
'@kvman/kvai': patch
---

A model stream with no event for 300 s, before its first event or between two, is aborted as a temporary `kvai/PROVIDER_ERROR` (`stream stalled`), so the caller's retries take it; a cancel stays a cancel (ADR 0096).
