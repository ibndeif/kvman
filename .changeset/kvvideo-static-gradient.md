---
'@kvman/kvvideo': patch
---

`compose` draws its still gradient background as one frame repeated, instead of `gradients` with `speed=0`, which ffmpeg before 7 (such as Ubuntu 24.04's 6.1) refuses, so every scene failed to compose there.
