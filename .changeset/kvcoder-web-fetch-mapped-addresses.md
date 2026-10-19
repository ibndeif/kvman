---
'@kvman/kvcoder': patch
---

`web fetch` judges an IPv4 address carried inside IPv6 (`[::ffff:7f00:1]`, NAT64, 6to4) as that IPv4 address, so no spelling of a local address is reached (ADR 0095, 3).
