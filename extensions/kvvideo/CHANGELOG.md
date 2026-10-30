# @kvman/kvvideo

## 0.1.0

### Minor Changes

- 981b1ba: `video compose`: joins scenes of recorded clips or images, with their narrations and burned-in captions, into an H.264 and AAC MP4; captions use a bundled font or a .ttf or .otf of the workspace, and each line reads in its own direction, so Arabic reads right to left. The chat shows the video in a player card; the newest 10 videos of a workspace keep a copy for it. Tajawal is no longer bundled: its bold alef didn't render.
- d681deb: `video narrate`: narrates a scene's text into an MP3 with ElevenLabs, OpenAI, or Piper on this computer, as the person chooses in kvvideo's configuration, and answers its length and its captions, timed in proportion to their length. The services' keys are kvvideo's secrets `elevenlabs.apiKey` and `openai.apiKey`.
- e86935d: `video record`: records a page of an app on this computer in the installed Chrome or Edge, with click, type, press, hover, scroll, wait, waitFor, and goto steps, a drawn cursor, and each step's time; kvvideo captures the page's frames itself and encodes them as H.264 with the ffmpeg on the PATH (ADR 0107, 25). kvman's own address is never recorded or reached.
- 32c1385: kvvideo: a new bundled extension that makes videos of the person's app. `/video` turns on the `video` connector in a chat, with `check` (what is ready: ffmpeg, the installed browser, narration) and `fonts` (the bundled caption fonts), its guide, and its configuration of narration, recording, and programs (ADR 0107).

### Patch Changes

- 6b12b34: `video record` aborts the recorded page's requests to kvman's port whatever their host, since `0.0.0.0`, `127.0.0.2`, and `[::ffff:127.0.0.1]` reach kvman too.
