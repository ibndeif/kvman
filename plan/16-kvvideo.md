# 16 — kvvideo (namespace `kvvideo`)

kvvideo makes videos from the person's own app: tutorials that show how to use it, and promotional videos. A video is composed, not generated: pages recorded in the browser already on the computer, narration from a text-to-speech service, captions burned into the picture, joined with ffmpeg (ADR 0107, 2 and 3). kvvideo has no loop of its own: it extends kvcoder (plan 08 §8.4) with the `video` connector, its guide, and the slash command `/video`. The `coder` preset runs it.

## 16.1 In a chat

- **Off until `/video`** (ADR 0107, 11). kvvideo's `kernel.started` handler registers the `video` connector with `optIn: true`, and the slash command `{ name: 'video', description: 'kvvideo.slash.video', command: 'kvvideo.video.start', message: 'kvvideo.slash.video.message' }`.
- **`kvvideo.video.start { sessionId, argument }`** (public command, `retries: 0`) → `{}`: enables `video` in the chat (`kvcoder.connector.enable`), sets the section `{ id: 'guide', title: 'Making videos', order: 30, sessionId }` from `docs/guide.md`, and, the first time in that chat, adds the note `kvvideo.video.started`.
- **The guide** tells the agent how to make a video: run `video check` first, and when something is missing tell the person what to install or set, in plain words; write the script as a Markdown artifact, one scene per section with its narration and what is on screen, and have the person agree to it; for each scene, `narrate` first, then `record` with `wait` steps so the picture lasts as long as the narration; `compose` last, and tell the person where the file is. It says that narration costs money with ElevenLabs and OpenAI, so a scene is narrated again only when its text changed, and that a font the person names is found on the web, saved in the workspace, and named by its path.
- **The connector's description**: "Make videos: record pages of an app running on this computer, narrate a script, and join them with captions into an MP4. Use it when the person asks for a video, a tutorial, a demo, or a promotion."

## 16.2 Settings and secrets

| Key | Schema | Default | Scopes |
|---|---|---|---|
| `kvvideo.narration.service` | `'elevenlabs' \| 'openai' \| 'piper' \| null` | `null` | global, workspace |
| `kvvideo.narration.voice` | `string \| null` (1 to 500 characters) | `null` | global, workspace |
| `kvvideo.narration.model` | `string \| null` (1 to 100 characters) | `null` | global, workspace |
| `kvvideo.browser` | `'auto' \| 'chrome' \| 'msedge'` | `'auto'` | global |
| `kvvideo.programs.ffmpeg` | `string` (1 to 1000 characters) | `'ffmpeg'` | global |
| `kvvideo.programs.ffprobe` | `string` (1 to 1000 characters) | `'ffprobe'` | global |
| `kvvideo.programs.piper` | `string` (1 to 1000 characters) | `'piper'` | global |

- **Voice and model.** A `null` voice is the service's default: ElevenLabs `JBFqnCBsd6RMkjVDRZzb`, OpenAI `alloy`; Piper has none, and its voice is the path of a voice's `.onnx` file. A `null` model is `eleven_multilingual_v2` for ElevenLabs and `gpt-4o-mini-tts` for OpenAI; Piper has no model.
- **Programs** (ADR 0107, 20) are a name looked up on the PATH, or a full path.
- **Secrets** (ADR 0107, 21): `elevenlabs.apiKey` and `openai.apiKey`, which the person adds on kvvideo's extension page (plan 06 §6.6). They are read only where a request is made, and never logged, stored elsewhere, or returned.
- **Configuration** (`kvvideo.ui.get`, plan 06 §6.3): three cards, Narration (`service`, `voice`, `model`), Recording (`browser`), and Programs (`ffmpeg`, `ffprobe`, `piper`), each a `setting` row. `ui.get` has no pages, nav, panels, or status items.

## 16.3 The `video` connector

| Call | Kernel job | Does |
|---|---|---|
| `video check {}` | `kvvideo.setup.get` (query) | what is ready (§16.4) |
| `video fonts {}` | `kvvideo.font.list` (query) | the bundled fonts: `[{ name, scripts: ('latin' \| 'arabic')[] }]`, by name |
| `video record { url, steps?, file, width?, height?, replace? }` | `kvvideo.clip.record` | records a page (§16.5) |
| `video narrate { text, file, replace? }` | `kvvideo.narration.make` | narrates text (§16.6) |
| `video compose { file, scenes, width?, height?, captions?, replace? }` | `kvvideo.video.compose`, card `kvvideo.player` | joins the scenes into an MP4 (§16.7) |

- Every job is public and has `retries: 0` (ADR 0107, 16). Timeouts: `record` 10 minutes, `narrate` 2, `compose` 30, and `check` 1.
- None asks the person (ADR 0107, 17). A read-only worker's helper has `check` and `fonts`, the queries (plan 08 §8.5).
- Each command has an example in its connector entry.

**Paths.** Every `file`, `clip`, `narration`, and `font` resolves against the workspace folder and must stay inside it, through `..` or a symlink (`VALIDATION_FAILED`). An input that doesn't exist fails `NOT_FOUND`. An output whose extension isn't its command's (`.mp4` for `record` and `compose`, `.mp3` for `narrate`, in any case) fails `VALIDATION_FAILED`, and so does one that exists when `replace` isn't `true`. An output's parent folders are created; it is written beside its path under a temporary name and renamed over it, so a failed call leaves no file and the old one in place.

**Programs.** A program runs with an empty stdin, in its own process group on Linux and macOS, and its tree is killed when the job is cancelled or times out: the group on Linux and macOS, `taskkill /PID <pid> /T /F` on Windows. A program that can't be started fails `kvvideo/PROGRAM_MISSING { program, setting }`, where `program` is `ffmpeg`, `ffprobe`, or `piper` and `setting` its key.

## 16.4 `check` and `fonts`

`kvvideo.setup.get {}` → `{ ffmpeg, browser, narration }`:

- `ffmpeg: { ready, version, missing }`: runs `<ffmpeg> -hide_banner -version`, `-encoders`, and `-filters`, and `<ffprobe> -hide_banner -version`, 5 s each. `version` is the third word of ffmpeg's first line, or `null`. `missing` lists, in this order, what isn't there: `ffmpeg`, `ffprobe`, the encoders `libx264`, `aac`, and `libmp3lame`, and the filter `subtitles` (ffmpeg built with libass). `ready` is `missing` being empty.
- `browser: { ready, channel }`: starts the browser of `kvvideo.browser` headless and closes it: `auto` tries `chrome`, then `msedge`. `channel` is the one that started, or `null`.
- `narration: { service, ready, missing }`: `missing` is the first of: `kvvideo.narration.service` when it is `null`; the secret `elevenlabs.apiKey` or `openai.apiKey` that the service needs and that isn't set; `piper` when `<piper> --help` doesn't exit 0 in 5 s; `kvvideo.narration.voice` when Piper's is `null`. It is `null` when nothing is missing, and `ready` is `missing` being `null`. No service is called.

`kvvideo.font.list {}` lists the bundled fonts (ADR 0107, 24): `Amiri`, `IBM Plex Sans Arabic`, `Lato`, `Poppins`, and `Tajawal`; the three Arabic ones have both scripts.

## 16.5 `record`

`kvvideo.clip.record { url, steps?, file, width?, height?, replace? }` → `{ file, durationMs, steps: [{ do, atMs }] }`. It needs ffmpeg as `compose` does.

- **Addresses** (ADR 0107, 18). `url`, and the `url` of each `goto`, is http or https on `localhost`, `127.0.0.1`, or `[::1]`, with no user name or password; anything else fails `VALIDATION_FAILED`. kvman's own address, the port in `<KVMAN_HOME>/kvman.lock` on those hosts, fails `VALIDATION_FAILED` too, and the recorded page's requests to it are aborted.
- **Steps** (0 to 200), each an object with `do`:

  | Step | Does |
  |---|---|
  | `{ do: 'goto', url }` | opens the address and waits for its load |
  | `{ do: 'click', target }` | moves to the target and clicks it |
  | `{ do: 'type', target, text }` | moves to the target, clicks it, and types `text` (1 to 2000 characters) one character every 50 ms |
  | `{ do: 'press', key }` | presses a key or a combination, as `Enter` or `Control+A` |
  | `{ do: 'hover', target }` | moves to the target |
  | `{ do: 'scroll', pixels }` | scrolls down by `pixels` (−20 000 to 20 000; negative scrolls up), in steps of 100 |
  | `{ do: 'wait', ms }` | holds the picture for `ms` (0 to 60 000) |
  | `{ do: 'waitFor', target }` | waits until the target is visible |

  A `target` is a Playwright selector (CSS, `text=Save`, or `role=button[name="Save"]`, 1 to 500 characters), and its first match is used once visible, within 10 s.
- **The picture.** The viewport and the recording are `width` × `height` (each even, 320 to 1920, 1280 × 720 by default). The page is shown 500 ms after it loads before the first step, 400 ms after each step but `wait` and `waitFor`, and 1000 ms after the last. Before it acts on a target, the mouse moves to the target's center over 600 ms. A dot follows the mouse, and a click shows a ring around it (ADR 0107, 19).
- **The answer.** `durationMs` is the recording's length; each step's `atMs` is when it started, from the recording's start, so a narration can be matched to it.
- **Failures.** A page that doesn't load fails `kvvideo/STEP_FAILED { step: 0, reason }`, and a step that fails, `{ step: <its number from 1>, reason }`, where `reason` is the first line of the browser's message. No browser fails `kvvideo/BROWSER_MISSING { channels }`, the channels it tried. Nothing is written when it fails.
- **The capture** (ADR 0107, 25). Once the page has loaded, kvvideo starts the page's screencast (JPEG frames at quality 90, at most `width` × `height`) and pipes the frames to `<ffmpeg> -f image2pipe -framerate 30 -c:v mjpeg -i -`, which writes the file as H.264 (`libx264 -preset veryfast -crf 18`, `yuv420p`, scaled and padded to the size, no sound, `+faststart`). The screencast sends a frame only when the picture changes, so each frame is written again until the next one comes, one copy every 1/30 s; the last is written until the recording ends. The recording's start, its length, and each step's `atMs` are all on the same clock. An ffmpeg exit other than 0 fails `kvvideo/RENDER_FAILED { reason }` with the last 20 lines of its output.
- The browser is started headless for the call and closed when it ends, fails, or is cancelled, and ffmpeg is stopped with it.

## 16.6 `narrate`

`kvvideo.narration.make { text, file, replace? }` → `{ file, durationMs, captions: [{ text, startMs, endMs }] }`.

- `text` is 1 to 4000 characters. A `null` service fails `kvvideo/NARRATION_NOT_SET { setting: 'kvvideo.narration.service' }`, and Piper with a `null` voice `{ setting: 'kvvideo.narration.voice' }`. A missing key fails `kvvideo/NARRATION_KEY_MISSING { service, secret }`.
- **ElevenLabs**: `POST https://api.elevenlabs.io/v1/text-to-speech/<voice>?output_format=mp3_44100_128` with the header `xi-api-key` and `{ text, model_id }`.
- **OpenAI**: `POST https://api.openai.com/v1/audio/speech` with `Authorization: Bearer <key>` and `{ model, voice, input: text, response_format: 'mp3' }`.
- **Piper**: `<piper> -m <voice> -f <temporary .wav> -- <text>`, then `<ffmpeg> -i <wav> -codec:a libmp3lame -b:a 128k` to the file.
- A request gets 60 s. An answer other than 2xx fails `kvvideo/NARRATION_FAILED { service, status, reason }` with the first 300 characters of its body as `reason`; a request that fails or passes its 60 s fails `{ service, reason }`. Piper's exit other than 0 fails `{ service: 'piper', reason }` with the last 20 lines of its output.
- `durationMs` is the file's length, read with `<ffprobe> -v error -show_entries format=duration -of csv=p=0`.
- **Captions** (ADR 0107, 7). Runs of white space in the text become one space. The text is cut into sentences after `.`, `!`, `?`, `؟`, and `…` followed by a space, and at line breaks. A sentence over 42 characters is cut into lines of whole words, each line as long as it can be up to 42 characters; a word over 42 characters is a line of its own. Each line lasts `durationMs` × its characters ÷ all lines' characters, the lines follow each other from 0 with no gap, times are whole milliseconds rounded down, and the last ends at `durationMs`.

## 16.7 `compose`

`kvvideo.video.compose { file, scenes, width?, height?, captions?, replace? }` → `{ file, durationMs, bytes, fileId }`.

- **Scenes** (1 to 100), each `{ clip, from?, to?, narration?, captions?, durationMs? }`:
  - `clip`: a video (`.webm`, `.mp4`, `.mov`, `.mkv`) or an image (`.png`, `.jpg`, `.jpeg`, `.webp`);
  - `from` and `to`: where the video's part starts and ends, in milliseconds (`to` after `from`; an image's fail `VALIDATION_FAILED`);
  - `narration`: an audio file (`.mp3`, `.wav`, `.m4a`);
  - `captions`: up to 200 `{ text, startMs, endMs }` from the scene's start, as `narrate` answers (`text` 1 to 200 characters, `endMs` after `startMs`);
  - `durationMs`: 100 to 600 000.
- **A scene's length** is its `durationMs`; else its narration's length; else its video part's length. An image with neither fails `VALIDATION_FAILED`. A video part shorter than the scene holds its last frame; a longer one is cut.
- **The picture** is `width` × `height`, each even, 320 to 1920 (1280 × 720 by default). Each clip is scaled to fit it, keeping its shape, on black, at 30 frames a second.
- **Captions** are burned in (ADR 0107, 6), from an ASS file per scene: white text with a black outline of 3 px, centered, `captions.position` `bottom` (the default) or `top`, 6% of the height from the edge, at `captions.size` px (12 to 200, the height ÷ 18 by default). `captions.font` is a bundled font's name or a `.ttf` or `.otf` file in the workspace, named by its family from the file's own name table; left out, it is IBM Plex Sans Arabic when a caption has an Arabic letter, else Poppins (ADR 0107, 24). An unknown name fails `VALIDATION_FAILED` with the bundled names. The characters `{`, `}`, and `\` are left out of a caption.
- **The render** (ADR 0107, 23). Each scene becomes a part in a temporary folder: H.264 (`libx264`, `-preset medium -crf 20`, `yuv420p`) with AAC sound (160 kb/s, 48 kHz, stereo), its narration or silence. The parts are joined with ffmpeg's concat demuxer without encoding again, with `+faststart`. The temporary folder is deleted when the call ends, in every case. An ffmpeg exit other than 0 fails `kvvideo/RENDER_FAILED { scene, reason }` (`scene` from 1, or `null` while joining) with the last 20 lines of its output.
- **The answer.** `durationMs` is the sum of the scenes' lengths, and `bytes` the file's size.
- **The player's copy** (ADR 0107, 13 and 14). A file of at most 512 MiB is copied into the kernel's files as `<file name>` (`video/mp4`), and `fileId` is the copy's id, else `null`. kvvideo's workspace collection `players` holds `{ path, fileId, createdAt }` (index `path`): a new copy of a path unlinks the old one, and past 10 the oldest copies are unlinked and their rows deleted.

## 16.8 The player card

`compose`'s connector entry has `card: 'kvvideo.player'` (ADR 0082, 13), so a successful call shows kvvideo's component with `{ payload, output }`:

- the file's path and the video's length (`m:ss`);
- a `<video>` with controls, `preload="metadata"`, at most 360 px high, from `/api/files/<fileId>?workspaceId=<the tab's workspace>`;
- with `fileId` `null`, or when the video can't load, "This video can't play here. Open `<file>` in the workspace." (`kvvideo.player.unavailable`) in its place.

The component is `kvvideo/web/components/player.vue`, built as kvcoder's are (plan 08 §8.7), with logical CSS and kvwebui's variables.

## 16.9 Errors

`kvvideo/PROGRAM_MISSING`, `kvvideo/BROWSER_MISSING`, `kvvideo/STEP_FAILED`, `kvvideo/NARRATION_NOT_SET`, `kvvideo/NARRATION_KEY_MISSING`, `kvvideo/NARRATION_FAILED`, and `kvvideo/RENDER_FAILED`, each with `kvvideo.errors.<CODE>` in `en` and `ar`. A `check` reports what is missing in its answer and fails for none of them.

## 16.10 Testing

- Pure parts (captions, the ASS file, each scene's ffmpeg arguments, addresses, the font name table, the kill per OS) are unit tests.
- The commands run with `createTestKernel` and kvcoder's `runConnector`, with stand-in `ffmpeg`, `ffprobe`, and `piper` programs named by the `kvvideo.programs.*` settings, which record their arguments and write their outputs.
- The two services are tested with a stand-in `fetch`; no test reaches the network.
- `record` runs end to end with the installed Chrome and the ffmpeg on the PATH against a local page, in the e2e project.
- The card is mounted in `happy-dom`.
- By hand: a real ffmpeg (with libass) composes a recorded, narrated video with English and Arabic captions, and each service narrates once with the owner's keys.
