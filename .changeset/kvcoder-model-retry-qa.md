---
'@kvman/kvcoder': patch
---

A step's model call is tried up to 3 times when it fails for a temporary reason (a timeout, a dropped connection, a 5xx, a rate limit), with "Retrying… (2 of 3)" in the activity line; a failed turn's notice now says the provider's reason.
