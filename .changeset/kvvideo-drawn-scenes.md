---
'@kvman/kvvideo': minor
---

HTML scenes are drawn frame by frame at 60 frames a second on kvvideo's own clock (ADR 0120): a page whose steps are all `wait` has its `requestAnimationFrame`, timers, `performance.now`, `Date`, `Math.random`, animations, and media set to each frame's time, so CSS, three.js, anime.js, and Lottie are exact and smooth whatever the machine's load, and the same at every recording; `look` uses the same clock. Elements with `data-sound` (pop, whoosh, click) cue sound effects as they enter, and crossfades get a soft whoosh. Every composed video is 60 frames a second; a recorded page's camera pushes in slowly; captions are boxed in the brand's colour by default (outlined with no brand).
