---
'@kvman/kvcoder': patch
---

The base prompt tells the model to call `ask` to put a question to the person and never to end a reply by promising something still to come, and the connector list says, for each built-in connector (`ask`, `subagent`, `jobs`, `fs`), what it is for, when to use it, and its commands, and ends every entry with how to get that connector's help (`<name> -h`).
