# @kvman/kvvideo

## 0.1.4

### Patch Changes

- 8ba5fff: HTML scenes are drawn frame by frame at 60 frames a second on kvvideo's own clock (ADR 0120): a page whose steps are all `wait` has its `requestAnimationFrame`, timers, `performance.now`, `Date`, `Math.random`, animations, and media set to each frame's time, so CSS, three.js, anime.js, and Lottie are exact and smooth whatever the machine's load, and the same at every recording; `look` uses the same clock. Elements with `data-sound` (pop, whoosh, click) cue sound effects as they enter, and crossfades get a soft whoosh. Every composed video is 60 frames a second; a recorded page's camera pushes in slowly; captions are boxed in the brand's colour by default (outlined with no brand).
- 03a8bf0: The production guide (ADR 0120): your own voice needs no narration service; a generated one is offered as Piper or a service and set with `video narration-set`, installed outside the workspace; `style.css` imports `kvvideo/brand.css` and `kvvideo/motion.css`; the treatment shows a moving `preview.mp4`; the treatment is re-timed from the recorded voice; scenes move at every moment with the kit, scripts, and three.js, with sound cues; captions are off when the words are on screen; designer helpers get at least 30 steps; and a video is never post-processed with `shell`.
- 931ec0f: Fixes from the KVCare promotion (ADR 0120): the final pass aims at −2 dBTP so the encoded video passes its own review; `review`'s problems carry a `reason` with what was measured, a picture still for 3 s is `frozen`, and an end card's silence of up to 5 s isn't a problem; captions are cut into even lines, breaking after punctuation where it can, and `voice` captions each sentence of a take on its own; new `video narration-set` sets the narration service, voice, and model once the person agreed; `check` answers `toolsFolder`.
- aab54f4: Scenes reach kvvideo at a fixed `kvvideo/` address (ADR 0120): `kvvideo/motion.css`, a motion kit of entrances, exits, emphasis, ambient motion, word-by-word text, line drawing, and counting numbers that combine on one element and mirror for right-to-left pages; `kvvideo/brand.css`, the workspace's brand colours and font as CSS variables with every bundled font; the brand's logo and font file; and three.js (with its addons), anime.js, and lottie-web, bundled and pinned. `record` and `look` answer `failed`, the files a page or website couldn't load.

## 0.1.3

### Patch Changes

- 706f71a: A video can have no voice: the guide no longer stops for a narration service when the person wants on-screen text and sound effects only, and it says how such a video is made and that review's silence is expected then (ADR 0119).

## 0.1.2

### Patch Changes

- 8a83fb3: Every video is made through a production workflow of ten stages: a brief, research, a concept (debated by the council when it is open), a treatment with style frames the person agrees to, a production map, the voice first, the pictures (designers build HTML scenes in parallel), review rounds, and delivery. `video look` shows the model a page's frames at chosen moments; a page's animations wait for its recording to start, so they keep time with the narration; `compose` no longer writes an `.srt` (ADR 0117).

## 0.1.1

### Patch Changes

- f6d9c21: A page recorded again for another size is checked as `record` checks one: its sidecar's page must be an HTML file inside the workspace, with no `goto` step, before a browser starts.
- 81e609c: `video narrate` speaks sentence by sentence and joins them with 250 ms between them, with exact sentence starts; ElevenLabs's character times give each line and word its time, and it hears the neighbouring sentences. `tone` and `speed` direct the voice, `kvvideo.narration.pronunciations` changes how words are said, a cache makes an unchanged sentence free, and a sidecar beside the MP3 holds its captions (ADR 0115).
- 3214385: `video compose` joins its scenes in a final pass: crossfades, cuts, fades through black, and slides; sound effects kvvideo makes itself (click, key taps, whoosh, pop); the mix levelled to −14 LUFS in two passes. A narration sits 300 ms into its scene. The `.srt`, a poster, and a sidecar go beside the video, the player shows the poster, and `extraSizes` makes other shapes, recording a page again at each; progress per scene and for the final pass (ADR 0115).
- 9e14779: kvvideo makes any kind of video. `record` opens any website or an HTML page of the workspace, at 2× density, with an arrow pointer that appears on its first move, eased curved moves, a natural typing pace, smooth scrolling, a phone device with taps, steps that wait for a narration's caption line, each step's times and target box, a sidecar beside the recording, and progress for each step (ADR 0115).
- 0c54071: The production guide: how a good video of any kind is made, and the steps from `video check` to `video review`; the connector's new description, and an example for each command (ADR 0115).
- 7a8de7e: `video review` reports a video's silences, black and frozen pictures, and loudness, and makes labelled contact sheets of its frames that the agent sees through kvcoder; `check` also needs `drawtext` and `xstack` (ADR 0115).
- eab46b0: `video compose` frames a recorded website in a window or a phone on a gradient, colour, or image background, zooms the camera smoothly to each click and typing (and an image slowly), lays callouts, highlights, and blurs on a recording, and burns captions in as boxed, outline, or word-by-word highlight, or none, from the narration's sidecar; 1920 × 1080 by default. `video brand` and `brand-set` keep the brand's logo, colours, and font. `check` asks for the filters these need (ADR 0115).
- 21a66ba: `video voice` makes a narration from the person's own takes: each cleaned (rumble, noise, silence at both ends, level) or only converted, joined with 250 ms between them, with each take's captions and a sidecar (ADR 0115).

## 0.1.0

### Minor Changes

- 981b1ba: `video compose`: joins scenes of recorded clips or images, with their narrations and burned-in captions, into an H.264 and AAC MP4; captions use a bundled font or a .ttf or .otf of the workspace, and each line reads in its own direction, so Arabic reads right to left. The chat shows the video in a player card; the newest 10 videos of a workspace keep a copy for it. Tajawal is no longer bundled: its bold alef didn't render.
- d681deb: `video narrate`: narrates a scene's text into an MP3 with ElevenLabs, OpenAI, or Piper on this computer, as the person chooses in kvvideo's configuration, and answers its length and its captions, timed in proportion to their length. The services' keys are kvvideo's secrets `elevenlabs.apiKey` and `openai.apiKey`.
- e86935d: `video record`: records a page of an app on this computer in the installed Chrome or Edge, with click, type, press, hover, scroll, wait, waitFor, and goto steps, a drawn cursor, and each step's time; kvvideo captures the page's frames itself and encodes them as H.264 with the ffmpeg on the PATH (ADR 0107, 25). kvman's own address is never recorded or reached.
- 32c1385: kvvideo: a new bundled extension that makes videos of the person's app. `/video` turns on the `video` connector in a chat, with `check` (what is ready: ffmpeg, the installed browser, narration) and `fonts` (the bundled caption fonts), its guide, and its configuration of narration, recording, and programs (ADR 0107).

### Patch Changes

- 6b12b34: `video record` aborts the recorded page's requests to kvman's port whatever their host, since `0.0.0.0`, `127.0.0.2`, and `[::ffff:127.0.0.1]` reach kvman too.
