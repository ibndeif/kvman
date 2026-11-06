---
'@kvman/kvvideo': minor
---

Fixes from the KVCare promotion (ADR 0120): the final pass aims at −2 dBTP so the encoded video passes its own review; `review`'s problems carry a `reason` with what was measured, a picture still for 3 s is `frozen`, and an end card's silence of up to 5 s isn't a problem; captions are cut into even lines, breaking after punctuation where it can, and `voice` captions each sentence of a take on its own; new `video narration-set` sets the narration service, voice, and model once the person agreed; `check` answers `toolsFolder`.
