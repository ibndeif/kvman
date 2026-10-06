---
'@kvman/kvcustomizer': minor
---

The agent reads kvcustomizer's guide on demand instead of in every prompt (ADR 0023). The global section `guide` is gone, and kvcustomizer removes the one that earlier versions stored. The `kvman` connector gains `init`, a read that answers the guide: which app is meant, what to ask the person, the rules for a person who isn't a developer, and the method for building an extension and managing the app. The connector's description opens by telling the agent to call `init` first when the person asks to change the app itself.
