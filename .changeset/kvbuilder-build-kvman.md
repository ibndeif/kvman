---
'@kvman/kvbuilder': minor
---

The person starts building kvman with the slash command `/build-kvman` (ADR 0027). Until it runs in a chat, nothing of kvbuilder is in that chat's prompt: its five connectors are registered with `optIn: true`. `kvbuilder.build.start { sessionId, argument }` enables them for the chat, sets the guide as the chat's section, and adds a note; the send box then sends the text after the command, or "I want to change this app.", as the person's message. `kvman init` and `kvbuilder.app.guide.get` are gone, and the docs page `customizing` is `building`.
