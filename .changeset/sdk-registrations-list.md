---
'@kvman/sdk': minor
---

The kernel has a new public query, `kernel.registrations.list`: every command and query of the run's extensions with its kind, owner, `public`, and description, and no schema. The SDK types it and exports `registrationRowSchema`.
