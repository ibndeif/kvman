---
"@kvman/kvai": minor
---

Tell a usage limit and a content refusal apart from other provider failures with two new codes, `kvai/USAGE_LIMIT` and `kvai/REFUSED`, each with its own text. A stream that ends before its final event is now `transient`, so a caller's retry applies.
