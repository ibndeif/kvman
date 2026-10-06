---
'@kvman/kvcoder': minor
---

A registered connector command can ask the person first: an entry of `kvcoder.connector.register` takes `asks: true`, and every call of it then becomes an approval card, whatever `kvcoder.shell.approval` says. A denied call returns "denied by the user". `help` of such a command says "The person is asked before this runs.", and `kvcoder.connector.list` answers `asks` for each command (ADR 0022, 5, 10, and 11).
