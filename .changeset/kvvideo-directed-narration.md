---
'@kvman/kvvideo': minor
---

`video narrate` speaks sentence by sentence and joins them with 250 ms between them, with exact sentence starts; ElevenLabs's character times give each line and word its time, and it hears the neighbouring sentences. `tone` and `speed` direct the voice, `kvvideo.narration.pronunciations` changes how words are said, a cache makes an unchanged sentence free, and a sidecar beside the MP3 holds its captions (ADR 0115).
