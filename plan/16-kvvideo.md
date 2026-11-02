# 16 — kvvideo (namespace `kvvideo`)

kvvideo makes videos from the person's own app: tutorials that show how to use it, and promotional videos. A video is composed, not generated: pages of the app and HTML pages the agent writes, recorded in the browser already on the computer; a narration from a text-to-speech service or recorded by the person; captions burned into the picture; joined with ffmpeg (ADR 0107, 2 and 3; ADR 0115, 3 and 5). kvvideo has no loop of its own: it extends kvcoder (plan 08 §8.4) with the `video` connector, its guide, and the slash command `/video`. The `coder` preset runs it.

## 16.1 In a chat

- **Off until `/video`** (ADR 0107, 11). kvvideo's `kernel.started` handler registers the `video` connector with `optIn: true`, and the slash command `{ name: 'video', description: 'kvvideo.slash.video', command: 'kvvideo.video.start', message: 'kvvideo.slash.video.message' }`.
- **`kvvideo.video.start { sessionId, argument }`** (public command, `retries: 0`) → `{}`: enables `video` in the chat (`kvcoder.connector.enable`), sets the section `{ id: 'guide', title: 'Making videos', order: 30, sessionId }` from `docs/guide.md`, and, the first time in that chat, adds the note `kvvideo.video.started`.
- **The connector's description**: "Make videos: record pages of an app running on this computer and HTML pages you write, narrate a script or have the person record it, and compose them with camera moves, transitions, captions, and sound into an MP4. Use it when the person asks for a video, a tutorial, a demo, or a promotion."
- **The guide** (ADR 0115, 1, 23, and 52) has the production rules, then the steps.
  - **Story.** Fit the video to its purpose and audience: a clear opening that says what the viewer gets, one idea per scene in a logical order, and an ending with the next step or a call to action. Show rather than tell: the narration explains what the picture can't, and on-screen text is a few words. No filler, repetition, or long still shots; scenes of 3 to 12 s unless the content needs more.
  - **Look.** Use the workspace's brand (`video brand`); for the first video take the colours, font, and logo from the app's own styles and files, list them in the script, and save them with `video brand-set` once the person agrees. Keep the colours, type, and style the same in every scene; design each HTML scene with a clear hierarchy, alignment, contrast, and space, and keep important things inside the middle 90% of the frame. Draw titles, diagrams, charts, and illustrations as HTML, CSS, and SVG pages; never generate images. Show the app in a `window` frame, a phone app in a `phone` frame.
  - **Motion.** Let `record` and `compose` move the pointer and the camera; in an HTML scene, animate with eased motion (an ease-out entrance of 300 to 600 ms, never linear), one thing moving at a time, and kinetic text only for the key words. Use `crossfade` between scenes, `slide` for a step forward in a sequence, and `fade-black` before the ending.
  - **Text.** Short, correctly spelled, readable on its background, and in the video's language; Arabic text right to left in an Arabic font, with `dir="auto"` on every text element of an HTML scene.
  - **Sound.** Narration in a clear, natural voice whose `tone` and `speed` fit the purpose; names said right through the pronunciation list. Sound effects stay on unless the person asks otherwise. There is no music.
  - **Accuracy and licences.** Say only what the app does, as recorded; no invented numbers, features, or claims. Blur emails, keys, names, and other personal data on screen. A font, library, or picture from the web is used only under a licence that allows it, and its source is written in the script; pin a library's exact version.
  - **Review.** Before telling the person the video is ready, run `video review`, look at every sheet for typos, cut-off or overlapping text, bad zooms, and empty frames, fix what is wrong, and compose again.
  - **The steps.** 1. Run `video check`; when something is missing, tell the person in plain words what to install or set, and stop until it is there: ffmpeg (with libass) from https://ffmpeg.org/download.html; Google Chrome or Microsoft Edge; a narration service chosen on kvvideo's extension page, with its key added there as a secret (`elevenlabs.apiKey` or `openai.apiKey`), or Piper (`pip install piper-tts`) with a voice file. 2. Make sure the app runs: start its dev server in the background with `shell`, and use its localhost address. 3. Write the script as a Markdown artifact: a "Look and sound" section (shapes, brand, framing, caption style, transitions, sound effects, and the voice: generated with its service, tone, and speed, or recorded by the person, with the examples' cost), then one section per scene with its narration and what is on screen. Have the person agree to it before anything is narrated, since narration with ElevenLabs or OpenAI costs money. 4. For each scene, make the narration first: `narrate`, or, for the person's own voice, `narrate` each sentence as an example, `ask record` with one card per scene, and `voice` with the takes. 5. Write each HTML scene, then `record` every scene with its `narration`, starting each action at its caption line with `atLine`. 6. `compose`, then `review`, fix, and compose again. Tell the person where the file is; the chat shows a player.
  - **Rules.** A chat without `ask` (Decide for me, plan 08 §8.1) can't record the person's voice: use the generated one, and say so in the script. Narrate a sentence again only when it changed; the cache makes an unchanged one free. Put the parts of a video in their own folder, such as `videos/<name>/`, and the video beside it. When the person asks for a font, find it on the web, save its `.ttf` or `.otf` file in the workspace, and name that file. A target in `record` is a Playwright selector: prefer `role=button[name="Save"]` or `text=Save` to CSS classes.

## 16.2 Settings and secrets

| Key | Schema | Default | Scopes |
|---|---|---|---|
| `kvvideo.narration.service` | `'elevenlabs' \| 'openai' \| 'piper' \| null` | `null` | global, workspace |
| `kvvideo.narration.voice` | `string \| null` (1 to 500 characters) | `null` | global, workspace |
| `kvvideo.narration.model` | `string \| null` (1 to 100 characters) | `null` | global, workspace |
| `kvvideo.narration.pronunciations` | `{ word, say }[]` (0 to 200; `word` 1 to 100 characters, `say` 1 to 200) | `[]` | global, workspace |
| `kvvideo.brand` | `{ logo, colors: { primary, background, text }, font } \| null` | `null` | workspace |
| `kvvideo.browser` | `'auto' \| 'chrome' \| 'msedge'` | `'auto'` | global |
| `kvvideo.programs.ffmpeg` | `string` (1 to 1000 characters) | `'ffmpeg'` | global |
| `kvvideo.programs.ffprobe` | `string` (1 to 1000 characters) | `'ffprobe'` | global |
| `kvvideo.programs.piper` | `string` (1 to 1000 characters) | `'piper'` | global |

- **Voice and model.** A `null` voice is the service's default: ElevenLabs `JBFqnCBsd6RMkjVDRZzb`, OpenAI `alloy`; Piper has none, and its voice is the path of a voice's `.onnx` file. A `null` model is `eleven_multilingual_v2` for ElevenLabs and `gpt-4o-mini-tts` for OpenAI; Piper has no model.
- **Pronunciations** (ADR 0115, 15). Each `word` is replaced by its `say` in what is sent to the service, as a whole word (not inside a longer word), ignoring case; the captions keep the text as written.
- **The brand** (ADR 0115, 21 and 43). `logo` is a `.png`, `.svg`, `.jpg`, or `.webp` file in the workspace, or `null`; each colour is `#RRGGBB`; `font` is a bundled font's name, a `.ttf` or `.otf` file in the workspace, or `null`.
- **Programs** (ADR 0107, 20) are a name looked up on the PATH, or a full path.
- **Secrets** (ADR 0107, 21): `elevenlabs.apiKey` and `openai.apiKey`, which the person adds on kvvideo's extension page (plan 06 §6.6). They are read only where a request is made, and never logged, stored elsewhere, or returned.
- **Configuration** (`kvvideo.ui.get`, plan 06 §6.3): four cards, Narration (`service`, `voice`, `model`, `pronunciations`), Brand (`brand`), Recording (`browser`), and Programs (`ffmpeg`, `ffprobe`, `piper`), each a `setting` row. `ui.get` has no pages, nav, panels, or status items.

## 16.3 The `video` connector

| Call | Kernel job | Does |
|---|---|---|
| `video check {}` | `kvvideo.setup.get` (query) | what is ready (§16.4) |
| `video fonts {}` | `kvvideo.font.list` (query) | the bundled fonts: `[{ name, scripts: ('latin' \| 'arabic')[] }]`, by name |
| `video brand {}` | `kvvideo.brand.get` (query) | the workspace's `kvvideo.brand` |
| `video brand-set { logo, colors, font }` | `kvvideo.brand.set` | sets the workspace's `kvvideo.brand`, answers `{}` |
| `video record { url \| page, steps?, file, width?, height?, device?, narration?, replace? }` | `kvvideo.clip.record` | records the app or a page (§16.5) |
| `video narrate { text, file, tone?, speed?, replace? }` | `kvvideo.narration.make` | narrates text (§16.6) |
| `video voice { lines, file, clean?, replace? }` | `kvvideo.voice.make` | makes a narration from the person's takes (§16.7) |
| `video compose { file, scenes, width?, height?, extraSizes?, captions?, direction?, sounds?, replace? }` | `kvvideo.video.compose`, card `kvvideo.player` | composes the scenes into an MP4 (§16.8) |
| `video review { file }` | `kvvideo.video.review`, `images: true` | measures a video and shows its frames (§16.10) |

- Every job is public and has `retries: 0` (ADR 0107, 16). Timeouts: `record` 10 minutes, `narrate` and `voice` 5, `compose` 60, `review` 10, and `check`, `fonts`, `brand`, and `brand-set` 1.
- None asks the person (ADR 0107, 17; ADR 0115, 43). A read-only worker's helper has `check`, `fonts`, and `brand`, the queries (plan 08 §8.5).
- Each command has an example in its connector entry.
- **Progress** (ADR 0115, 46). `record`, `narrate`, `voice`, `compose`, and `review` send progress chunks `{ text }` (at most 200 characters) as they go: "Recording step 3 of 9", "Narrating sentence 2 of 5", "Cleaning take 1 of 4", "Scene 3 of 8", "Final pass, 40%", "Sheet 2 of 5".

**Paths.** Every `file`, `page`, `clip`, `narration`, `take`, `background`, `logo`, and `font` resolves against the workspace folder and must stay inside it, through `..` or a symlink (`VALIDATION_FAILED`). An input that doesn't exist fails `NOT_FOUND`. An output whose extension isn't its command's (`.mp4` for `record` and `compose`, `.mp3` for `narrate` and `voice`, in any case) fails `VALIDATION_FAILED`, and so does one that exists when `replace` isn't `true`. An output's parent folders are created; it is written beside its path under a temporary name and renamed over it, so a failed call leaves no file and the old one in place. The files a command writes beside its output (its sidecar, and `compose`'s `.srt`, poster, and other sizes) follow the same rules and are replaced with it.

**The sidecar** (ADR 0115, 31). `record`, `narrate`, `voice`, and `compose` write `<file>.kvvideo.json` beside their output: `record` `{ kind: 'app' | 'page', source, width, height, device, scale: 2, durationMs, steps, actions }` (`source` the `url` or `page`, `steps` the call's steps, `actions` its answer's steps), `narrate` and `voice` `{ kind: 'narration', durationMs, captions }`, and `compose` `{ kind: 'video', durationMs, width, height, scenes: [{ startMs, endMs }], captions }` (on the video's time line). A command that reads one validates it with zod, and treats a missing or invalid one as absent.

**Programs.** A program runs with an empty stdin, in its own process group on Linux and macOS, and its tree is killed when the job is cancelled or times out: the group on Linux and macOS, `taskkill /PID <pid> /T /F` on Windows. A program that can't be started fails `kvvideo/PROGRAM_MISSING { program, setting }`, where `program` is `ffmpeg`, `ffprobe`, or `piper` and `setting` its key.

## 16.4 `check`, `fonts`, and the brand

`kvvideo.setup.get {}` → `{ ffmpeg, browser, narration }`:

- `ffmpeg: { ready, version, missing }`: runs `<ffmpeg> -hide_banner -version`, `-encoders`, and `-filters`, and `<ffprobe> -hide_banner -version`, 5 s each. `version` is the third word of ffmpeg's first line, or `null`. `missing` lists, in this order, what isn't there: `ffmpeg`, `ffprobe`, the encoders `libx264`, `aac`, and `libmp3lame`, and the filters `subtitles` (ffmpeg built with libass), `xfade`, `loudnorm`, and `afftdn`. `ready` is `missing` being empty.
- `browser: { ready, channel }`: starts the browser of `kvvideo.browser` headless and closes it: `auto` tries `chrome`, then `msedge`. `channel` is the one that started, or `null`.
- `narration: { service, ready, missing }`: `missing` is the first of: `kvvideo.narration.service` when it is `null`; the secret `elevenlabs.apiKey` or `openai.apiKey` that the service needs and that isn't set; `piper` when `<piper> --help` doesn't exit 0 in 5 s; `kvvideo.narration.voice` when Piper's is `null`. It is `null` when nothing is missing, and `ready` is `missing` being `null`. No service is called. A video in the person's own voice needs no service but for its examples.

`kvvideo.font.list {}` lists the bundled fonts (ADR 0107, 24): `Amiri`, `IBM Plex Sans Arabic`, `Lato`, and `Poppins`; the two Arabic ones have both scripts.

`kvvideo.brand.get {}` → the workspace's `kvvideo.brand`, or `null`. `kvvideo.brand.set { logo, colors, font }` checks the brand's files (§16.3 Paths) and a font's name (§16.8 Captions), and sets the workspace's `kvvideo.brand`.

## 16.5 `record`

`kvvideo.clip.record { url | page, steps?, file, width?, height?, device?, narration?, replace? }` → `{ file, durationMs, steps: [{ do, atMs, actMs?, endMs, box? }] }`. It needs ffmpeg as `compose` does. Exactly one of `url` and `page` is given (`VALIDATION_FAILED` otherwise).

- **The app** (ADR 0107, 18). `url`, and the `url` of each `goto`, is http or https on `localhost`, `127.0.0.1`, or `[::1]`, with no user name or password; anything else fails `VALIDATION_FAILED`.
- **A page** (ADR 0115, 3, 4, and 32). `page` is an `.html` or `.htm` file in the workspace. It is opened at `http://page.kvvideo.invalid/<its file name>`, and each request to that origin is answered with the file at that path under the page's folder, with the content type of its extension; a path that leaves the folder, or a file that doesn't exist, is answered 404. A page may load anything from the internet. A `goto` in a page's steps fails `VALIDATION_FAILED`.
- **kvman's own address**, the port in `<KVMAN_HOME>/kvman.lock` on the local hosts, fails `VALIDATION_FAILED` as a `url`, and every request the recorded page makes to that port is aborted whatever its host, since other names of this computer (`0.0.0.0`, `127.0.0.2`, `[::ffff:127.0.0.1]`) reach kvman too.
- **Steps** (0 to 200), each an object with `do`, and each but `wait` may have `atLine` (§16.5 Narration):

  | Step | Does |
  |---|---|
  | `{ do: 'goto', url }` | opens the address and waits for its load |
  | `{ do: 'click', target }` | moves to the target and clicks it (taps it on a phone) |
  | `{ do: 'type', target, text }` | moves to the target, clicks it, and types `text` (1 to 2000 characters) |
  | `{ do: 'press', key }` | presses a key or a combination, as `Enter` or `Control+A` |
  | `{ do: 'hover', target }` | moves to the target |
  | `{ do: 'scroll', pixels }` | scrolls down by `pixels` (−20 000 to 20 000; negative scrolls up) |
  | `{ do: 'wait', ms }` | holds the picture for `ms` (0 to 60 000) |
  | `{ do: 'waitFor', target }` | waits until the target is visible |

  A `target` is a Playwright selector (CSS, `text=Save`, or `role=button[name="Save"]`, 1 to 500 characters), and its first match is used once visible, within 10 s.
- **The page's size** (ADR 0115, 8 and 35). `device` is `'desktop'` (the default) or `'phone'`. The viewport is `width` × `height` CSS pixels (each even, 320 to 1920): 1280 × 720 by default on a desktop, and 390 × 844 on a phone, which is a touch screen. The page is drawn at 2× density, so the file is `2 × width` by `2 × height`.
- **The picture.** Once the page has loaded, all its fonts are loaded (`document.fonts.ready`), and the network has been idle for 500 ms (at most 10 s), the page is shown 500 ms before the first step, 400 ms after each step but `wait` and `waitFor`, and 1000 ms after the last. Scroll bars are hidden.
- **Motion** (ADR 0115, 9). Before it acts on a target, the pointer moves to the target's center along a gentle curve, easing in and out, over 300 ms plus 0.6 ms per pixel of distance, from 400 to 900 ms. On a desktop the page draws an arrow pointer (white, with a dark outline) that follows the mouse; a press shrinks it to 85% for 120 ms and shows a ring that grows and fades over 500 ms. On a phone the page draws a round touch mark at each tap instead. `type` types each character after 35 to 110 ms, with 150 ms more after a space or a punctuation mark, from a sequence seeded by the text, so a recording is the same each time. `scroll` scrolls smoothly, easing in and out, over 400 ms plus 0.5 ms per pixel, at most 3 s.
- **Narration** (ADR 0115, 16 and 41). `narration` is an audio file with a sidecar from `narrate` or `voice` (`VALIDATION_FAILED` without one). A step with `atLine: n` (from 1, at most the number of caption lines, `VALIDATION_FAILED` otherwise) starts no earlier than 300 ms plus line `n`'s `startMs` after the recording's start, and at once when that time has passed. The recording lasts at least 300 ms plus the narration's length plus 300 ms, holding the last picture. A step with `atLine` and no `narration` fails `VALIDATION_FAILED`.
- **The answer** (ADR 0115, 33). `durationMs` is the recording's length. Each step answers `atMs`, when it started; `actMs`, when the pointer arrived and the click, typing, or hover began (`click`, `type`, and `hover`); `endMs`, when it finished; and `box`, `{ x, y, width, height }` in CSS pixels of the viewport, the target's box when it acted (`click`, `type`, and `hover`). All are from the recording's start.
- **Failures.** A page that doesn't load fails `kvvideo/STEP_FAILED { step: 0, reason }`, and a step that fails, `{ step: <its number from 1>, reason }`, where `reason` is the first line of the browser's message. No browser fails `kvvideo/BROWSER_MISSING { channels }`, the channels it tried. Nothing is written when it fails.
- **The capture** (ADR 0107, 25). Once the page is ready, kvvideo starts the page's screencast (JPEG frames at quality 95, at most the file's size) and pipes the frames to `<ffmpeg> -f image2pipe -framerate 30 -c:v mjpeg -i -`, which writes the file as H.264 (`libx264 -preset veryfast -crf 14`, `yuv420p`, scaled and padded to the file's size, no sound, `+faststart`). The screencast sends a frame only when the picture changes, so each frame is written again until the next one comes, one copy every 1/30 s; the last is written until the recording ends. The recording's start, its length, and each step's times are all on the same clock. An ffmpeg exit other than 0 fails `kvvideo/RENDER_FAILED { reason }` with the last 20 lines of its output.
- The browser is started headless for the call and closed when it ends, fails, or is cancelled, and ffmpeg is stopped with it.

## 16.6 `narrate`

`kvvideo.narration.make { text, file, tone?, speed?, replace? }` → `{ file, durationMs, captions: [{ text, startMs, endMs, words? }], reused }`.

- `text` is 1 to 4000 characters; `tone` 1 to 300 characters; `speed` 0.7 to 1.2 (1 by default). A `null` service fails `kvvideo/NARRATION_NOT_SET { setting: 'kvvideo.narration.service' }`, and Piper with a `null` voice `{ setting: 'kvvideo.narration.voice' }`. A missing key fails `kvvideo/NARRATION_KEY_MISSING { service, secret }`.
- **Sentence by sentence** (ADR 0115, 17 and 41). The text is cut into sentences as the captions are (below), and each sentence is spoken alone, with `kvvideo.narration.pronunciations` applied. The sentences are joined in order with 250 ms of silence between them, and encoded as MP3 (`libmp3lame`, 192 kb/s).
- **ElevenLabs**: `POST https://api.elevenlabs.io/v1/text-to-speech/<voice>/with-timestamps?output_format=mp3_44100_128` with the header `xi-api-key` and `{ text, model_id, previous_text?, next_text?, voice_settings?: { speed } }`: `previous_text` and `next_text` are the sentences before and after it, and `voice_settings` is sent when `speed` isn't 1. The answer is `{ audio_base64, alignment: { characters, character_start_times_seconds, character_end_times_seconds } }`.
- **OpenAI**: `POST https://api.openai.com/v1/audio/speech` with `Authorization: Bearer <key>` and `{ model, voice, input, response_format: 'mp3', instructions?, speed? }`: `instructions` is `tone`, and `speed` is sent when it isn't 1.
- **Piper**: `<piper> -m <voice> -f <temporary .wav> --length-scale <1 ÷ speed> -- <sentence>`. `tone` is used by OpenAI only (ADR 0115, 39).
- A request gets 60 s. An answer other than 2xx fails `kvvideo/NARRATION_FAILED { service, status, reason }` with the first 300 characters of its body as `reason`; a request that fails or passes its 60 s fails `{ service, reason }`. Piper's exit other than 0 fails `{ service: 'piper', reason }` with the last 20 lines of its output.
- **The cache** (ADR 0115, 40). kvvideo's workspace collection `narrations` holds `{ key, fileId, durationMs, alignment, createdAt }` (index `key`), the audio in the kernel's files. `key` is the SHA-256 of the JSON of the service, voice, model, `tone`, `speed`, and the sentence as spoken. A sentence with a row is taken from it and not sent; one without is sent and stored. Past 2000 rows, the oldest are deleted with their files. `reused` is the number of sentences taken from the cache.
- `durationMs` is the file's length, read with `<ffprobe> -v error -show_entries format=duration -of csv=p=0`.
- **Captions** (ADR 0107, 7; ADR 0115, 17). The text is cut at line breaks, and runs of white space within a line become one space. Each line is cut into sentences after `.`, `!`, `?`, `؟`, and `…` followed by a space; empty ones are dropped. A sentence over 42 characters is cut into lines of whole words, each line as long as it can be up to 42 characters; a word over 42 characters is a line of its own. A sentence's lines cover its own audio: with ElevenLabs each line starts at its first character's time and each word (`words`, `{ text, startMs, endMs }`) runs from its first character's start to its last character's end, a word replaced by a pronunciation taking the time of what was said in its place; with the other services each line lasts the sentence's length × its characters ÷ the sentence's characters. Lines follow each other with no gap, a sentence's last line ends where the next sentence starts, times are whole milliseconds rounded down, and the last ends at `durationMs`.

## 16.7 `voice`

`kvvideo.voice.make { lines: [{ take, text }], file, clean?, replace? }` → `{ file, durationMs, captions }` (ADR 0115, 28 and 50).

- `lines` is 1 to 20, each `take` an audio file (`.webm`, `.ogg`, `.m4a`, `.mp4`, `.mp3`, `.wav`), as `ask record` wrote it (plan 08 §8.5), and its `text` the sentence said in it (1 to 500 characters).
- **The cleanup**, with `clean` `true` (the default), each take through `highpass=f=80`, `afftdn=nr=12:nf=-30`, trimming silence below −45 dB at both ends down to 150 ms, and `loudnorm=I=-16:TP=-1.5:LRA=11`; with `clean` `false`, each take is only converted. The takes are never changed.
- The cleaned takes are joined in order with 250 ms of silence between them and encoded as MP3 (`libmp3lame`, 192 kb/s). Each take's captions are its `text` cut as §16.6 cuts a sentence, lasting the take's length in proportion to their characters.
- An ffmpeg exit other than 0 fails `kvvideo/RENDER_FAILED { take, reason }` (`take` from 1, or `null` while joining).

## 16.8 `compose`

`kvvideo.video.compose { file, scenes, width?, height?, extraSizes?, captions?, direction?, sounds?, replace? }` → `{ file, durationMs, bytes, fileId, poster, others: [{ file, bytes }] }`.

- **Scenes** (1 to 100), each `{ clip, from?, to?, narration?, captions?, durationMs?, frame?, background?, camera?, overlays?, transition?, sounds? }`:
  - `clip`: a video (`.webm`, `.mp4`, `.mov`, `.mkv`) or an image (`.png`, `.jpg`, `.jpeg`, `.webp`);
  - `from` and `to`: where the video's part starts and ends, in milliseconds (`to` after `from`; an image's fail `VALIDATION_FAILED`);
  - `narration`: an audio file (`.mp3`, `.wav`, `.m4a`);
  - `captions`: up to 200 `{ text, startMs, endMs, words? }` from the narration's start (`text` 1 to 200 characters, `endMs` after `startMs`, up to 40 `words`); left out, the narration's sidecar's;
  - `durationMs`: 100 to 600 000;
  - `frame`: `'window'`, `'phone'`, or `'none'`; left out, `window` for a recording of the app on a desktop, `phone` for one on a phone, else `none`;
  - `background`: `#RRGGBB` or an image file; left out, the brand's;
  - `camera`: `'auto'` or `'none'`; left out, `auto` for a recording of the app, else `none` (a page is never moved);
  - `overlays`: up to 20 (§16.8 Overlays);
  - `transition`: into the next scene, `{ kind, toward?, ms? }` (§16.8 Transitions);
  - `sounds`: `false` turns the scene's sound effects off.
- **A scene's length** (ADR 0115, 41) is its `durationMs`; else 300 ms plus its narration's length plus 300 ms; else its video part's length. An image with neither fails `VALIDATION_FAILED`. The narration starts 300 ms into the scene. A video part shorter than the scene holds its last frame; a longer one is cut.
- **The picture** is `width` × `height`, each even, 320 to 1920 (1920 × 1080 by default), at 30 frames a second. `direction` is `'ltr'` or `'rtl'`; left out, `rtl` when a caption has an Arabic letter, else `ltr`.
- **The camera** (ADR 0115, 7 and 34), with `auto`, from the clip's sidecar's `actions`: each `click` or `type` step, with its `box`, is a stop. The view zooms to 1.6× (to `0.8 ×` the viewport ÷ the box when that is smaller, and never below 1), centred on the box's center and kept inside the page. It starts easing in at the step's `atMs` and is there at its `actMs`; a stop whose `atMs` is within 2.5 s of the last stop's `endMs` is reached by panning, eased, over 600 ms; 1.5 s after the last stop's `endMs` of a run, the view eases out over 800 ms. The easing is cubic in and out. A clip without a sidecar, or one of a page, has no stops.
- **The frame** (ADR 0115, 10 and 36). Behind the clip is the `background`: an image fills the frame, cropped; a colour, or the brand's `background` without one, is a diagonal gradient from it to the same colour mixed with 18% of the brand's `primary`; with no brand, from `#0F172A` to `#1E293B`. `window`: the clip in rounded corners (1.5% of the frame's shorter side) with a soft shadow, as large as fits inside margins of 6% of the shorter side, and 14% at the bottom when the captions are at the bottom, so the captions sit on the background. `phone`: the clip in a dark phone outline, 88% of the frame's height. `none`: the clip as large as fits, on the background. The background, the shadow, the corners, and the outline are drawn once per scene by the browser as images at the picture's size, and ffmpeg places the clip in them.
- **Overlays** (ADR 0115, 11), each `{ kind, step?, box?, text?, fromMs, toMs }`: `kind` is `'callout'`, `'highlight'`, or `'blur'`; exactly one of `step` (a step of the clip's sidecar, from 1, which must have a `box`) and `box` (`{ x, y, width, height }` in CSS pixels of the recorded page) places it (`VALIDATION_FAILED` otherwise); `fromMs` and `toMs` are from the scene's start (`toMs` after `fromMs`). `callout` has `text` (1 to 80 characters, required): a rounded label in the brand's `primary` colour, its text white or near-black, whichever contrasts more, in the brand's font or the captions' default, with an arrow to the box, above it when there is room and else below; it fades in and out over 200 ms. `highlight` dims everything but the box (12 px more on each side, rounded) to 55% black. `blur` blurs the box with a strength of 20 px. Overlays are applied to the page, before the camera and the frame, and a callout is drawn as an image by the browser.
- **Captions** are burned in (ADR 0107, 6; ADR 0115, 18 and 42), from an ASS file per scene, centered, each line in the direction of its own text (the style's encoding is -1, so an Arabic line reads right to left), one line at a time. `captions.style`: `'boxed'` (the default: white text on black at 65% opacity, with padding of a third of the text's size), `'outline'` (white text with a black outline of 3 px), `'highlight'` (as `boxed`, and the words already spoken coloured in the brand's `primary`, or `#FFD54A` with no brand, for a line with `words`; a line without is `boxed`), or `'off'` (no captions and no `.srt`). `captions.position` is `bottom` (the default) or `top`, 6% of the height from the edge, at `captions.size` px (12 to 200, the height ÷ 18 by default). `captions.font` is a bundled font's name or a `.ttf` or `.otf` file in the workspace, named by its family from the file's own name table; left out, the brand's font, else IBM Plex Sans Arabic when a caption has an Arabic letter, else Poppins (ADR 0107, 24). An unknown name fails `VALIDATION_FAILED` with the bundled names. The characters `{`, `}`, and `\` are left out of a caption.
- **Transitions** (ADR 0115, 12). `kind` is `'cut'`, `'crossfade'` (the default), `'fade-black'`, or `'slide'`; `ms` is 0 to 2000 (500 by default, 0 for a cut), and at most half of each of the two scenes' lengths (`VALIDATION_FAILED` otherwise). A `slide` has `toward`: `'start'` (the default), `'end'`, `'up'`, or `'down'`; `start` is left in an `ltr` video and right in an `rtl` one. A transition overlaps the two scenes by its `ms`, and their sound crossfades over the same time. The last scene's `transition` fails `VALIDATION_FAILED`.
- **Sound effects** (ADR 0115, 14 and 38), unless `sounds` is `false` for the video or the scene: a click at each `click` step's `actMs`; key taps from each `type` step's `actMs` plus 120 ms to its `endMs`; a whoosh at each `slide`; a pop as each callout appears. They are bundled with kvvideo, under CC0, with a `SOURCES.md` naming each file's source and licence, and mixed 18 dB below the narration (24 dB for the key taps).
- **The render** (ADR 0107, 23; ADR 0115, 2 and 37). ffmpeg runs in a temporary folder, where each scene's ASS file, the caption font, and the drawn images are, so filters name them by their relative paths. Each scene becomes a part there: H.264 (`libx264`, `-preset veryfast -crf 14`, `yuv420p`) with PCM sound (48 kHz, stereo), its narration placed at 300 ms or silence, with 20 ms fades at both ends, in a `.mkv`. The final pass joins the parts with `xfade` and `acrossfade` (a cut is a transition of 0 ms), mixes the sound effects, measures the loudness with `loudnorm` (`I=-14:TP=-1:LRA=11`, printing JSON), and then encodes once with the measured values (`linear=true`): H.264 (`libx264`, `-preset medium -crf 18`, `yuv420p`) with AAC sound (192 kb/s, 48 kHz, stereo), `+faststart` (ADR 0115, 19). The temporary folder is deleted when the call ends, in every case. An ffmpeg exit other than 0 fails `kvvideo/RENDER_FAILED { scene, reason }` (`scene` from 1, or `null` in the final pass) with the last 20 lines of its output.
- **Beside the video.** The `.srt` file `<name>.srt` holds the captions on the video's time line, unless the style is `off`; the poster `<name>.jpg` is the frame in the middle of the first scene, 1280 px on its longer side, JPEG quality 90 (ADR 0115, 45); the sidecar is §16.3's.
- **Other sizes** (ADR 0115, 44). `extraSizes` is up to 2 `{ width, height }`, each as `width` and `height`, each different from the main size and from each other (`VALIDATION_FAILED` otherwise). Each is composed from the same scenes into `<name>-<width>x<height>.mp4`, with its own `.srt` and poster, and listed in `others`. A scene whose clip is a recorded page with a different shape is recorded again for it, in the temporary folder, with the same steps, at that shape with its shorter side 720 CSS pixels; this needs the browser, and fails `kvvideo/BROWSER_MISSING` without one.
- **The answer.** `durationMs` is the video's length, the scenes' lengths less their transitions' overlaps, and `bytes` the file's size. `poster` is the poster's path.
- **The player's copy** (ADR 0107, 13 and 14). A file of at most 512 MiB is copied into the kernel's files as `<file name>` (`video/mp4`), with its poster as `<poster name>` (`image/jpeg`), and `fileId` is the video's copy's id, else `null`. kvvideo's workspace collection `players` holds `{ path, fileId, posterFileId, createdAt }` (index `path`): a new copy of a path unlinks the old ones, and past 10 the oldest copies are unlinked and their rows deleted.

## 16.9 The player card

`compose`'s connector entry has `card: 'kvvideo.player'` (ADR 0082, 13), so a successful call shows kvvideo's component with `{ payload, output }`:

- the file's path and the video's length (`m:ss`), and the other sizes' paths;
- a `<video>` with controls, `preload="metadata"`, its poster from `/api/files/<posterFileId>?workspaceId=<the tab's workspace>`, at most 360 px high, from `/api/files/<fileId>?workspaceId=<the tab's workspace>`;
- with `fileId` `null`, or when the video can't load, "This video can't play here. Open `<file>` in the workspace." (`kvvideo.player.unavailable`) in its place.

The component is `kvvideo/web/components/player.vue`, built as kvcoder's are (plan 08 §8.7), with logical CSS and kvwebui's variables.

## 16.10 `review`

`kvvideo.video.review { file }` → `{ durationMs, loudness: { integratedLufs, truePeakDb }, problems: [{ kind, atMs, lengthMs }], images: [{ fileId, name }] }` (ADR 0115, 20 and 48). `file` is an `.mp4` in the workspace.

- **Problems**, in time order: `silence`, sound below −50 dB for 3 s or more (`silencedetect`); `black`, a black picture for 0.5 s or more (`blackdetect`); `frozen`, a picture unchanged for 6 s or more (`freezedetect`); `loudness`, an integrated loudness outside −15 to −13 LUFS or a true peak above −1 dBTP (`ebur128`), at `atMs` 0 for the whole video.
- **Contact sheets.** The frames are taken, from the video's sidecar, at the middle of each scene, 400 ms after each transition, and at the middle of each caption line; without a sidecar, every 5 s. Frames within 500 ms of an earlier one are dropped; past 96, 96 are kept, evenly spread. Each sheet is 3 columns × 4 rows of frames 480 px on their longer side, each labelled with its time (`m:ss.s`), as JPEG, quality 85; at most 8 sheets. They are stored in the kernel's files as `review-<n>.jpg`, and listed in `images`, which the model sees (plan 08 §8.4). kvvideo's workspace collection `reviewSheets` holds `{ fileId, createdAt }`; past 24, the oldest are deleted with their files.

## 16.11 Errors

`kvvideo/PROGRAM_MISSING`, `kvvideo/BROWSER_MISSING`, `kvvideo/STEP_FAILED`, `kvvideo/NARRATION_NOT_SET`, `kvvideo/NARRATION_KEY_MISSING`, `kvvideo/NARRATION_FAILED`, and `kvvideo/RENDER_FAILED`, each with `kvvideo.errors.<CODE>` in `en` and `ar`. A `check` reports what is missing in its answer and fails for none of them.

## 16.12 Testing

- Pure parts (captions and their times from an alignment, pronunciations, the ASS file in each style, the `.srt`, the camera's stops and its expressions, the transitions' offsets, each scene's and the final pass's ffmpeg arguments, the cache's key, addresses, the page's routing, the font name table, the kill per OS) are unit tests.
- The commands run with `createTestKernel` and kvcoder's `runConnector`, with stand-in `ffmpeg`, `ffprobe`, and `piper` programs named by the `kvvideo.programs.*` settings, which record their arguments and write their outputs.
- The two services are tested with a stand-in `fetch`; no test reaches the network.
- `record` (the app and a page, a desktop and a phone, with a narration), the drawn frames and callouts, and `compose`'s final pass run end to end with the installed Chrome and the ffmpeg on the PATH against local pages, in the e2e project.
- The card is mounted in `happy-dom`.
- By hand: a real ffmpeg (with libass) composes a video of an app with a title page, a window and a phone recording, the camera, overlays, every transition, sound effects, and English and Arabic captions in each style; `review` finds a planted silence and black frame; each service narrates once with the owner's keys (OpenAI's `instructions` and `speed`, ElevenLabs's timestamps); the owner records a scene with `ask record` in the browser, the desktop app on each OS, and VS Code.
