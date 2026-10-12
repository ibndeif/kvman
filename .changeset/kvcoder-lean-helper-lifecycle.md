---
"@kvman/kvcoder": patch
---

A helper's end and the delivery of its result to its parent are now one transaction, as are a worker run's end and delivery. Deleting a chat stops every helper, process and run under it before removing their records, and a delete that was cut short is finished by deleting again. A turn that ends while it still waits on helpers cancels them.
