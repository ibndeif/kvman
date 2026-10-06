---
'@kvman/kvcoder': minor
---

Extensions add slash commands to the send box, and keep connectors out of a chat until they switch them on (ADR 0027). `kvcoder.slash.register { commands: [{ name, description, command, message? }] }`, `kvcoder.slash.unregister`, and `kvcoder.slash.list` are the registry; the send box lists the registered commands after its own, runs one with the chat's id and the text after its name, and then sends that text, or the command's translated `message`, as the person's message. A connector registered with `optIn: true` is off in every chat until its owner calls `kvcoder.connector.enable { sessionId, names }`, and `kvcoder.connector.list` rows have `optIn`.
