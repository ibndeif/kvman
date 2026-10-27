# ADR 0107 — kvvideo: videos made from the person's app, with narration and captions

Status: accepted, 2026-10-27. It adds plan 16, a `kvvideo` row to plan 01 §1.4 and §1.5 and to plan 11, byte ranges to plan 04 §4.1, and milestones M5.1 to M5.4 to plan 13.

The product owner asked (2026-10-27): "What if we want to implement a new connector for kvcoder to generate videos (eg. videos targeted to user to teach them how to use the app that the user is developing using kvman, promotion videos for marketing, any kind of videos based on user request)?", then "the video can include audio", then "plan it and implement it".

Decisions 1 to 14 were asked with alternatives. Decisions 15 to 24 are the smallest way to carry them out; the product owner may overrule any of them.

## Decisions

### Asked

1. **A new extension, `@kvman/kvvideo`, namespace `kvvideo`**, that extends kvcoder as kvbuilder does (plan 08 §8.4): no change to the kernel's concepts or to kvcoder.
2. **Composed video only** in this phase (chosen over AI-generated clips, and over both): screen recordings of a page driven in a browser, narration, and captions, joined with ffmpeg. Generated video is a later decision.
3. **Narration is the only audio** (chosen over adding music, and over music and sound effects). Music, sound effects, and voice cloning are out.
4. **Three narration services, chosen by the person**: ElevenLabs, OpenAI, and Piper (local). The owner asked for the costs first: about $0.05 to $0.09 per narrated minute with ElevenLabs, about $0.015 with OpenAI's `gpt-4o-mini-tts`, and nothing with Piper.
5. **No service until the person chooses one** (chosen over defaulting to ElevenLabs or Piper): `narrate` fails, naming the setting and the three services.
6. **Captions are burned into the picture** (chosen over a subtitle track and a `.vtt` file, and over both).
7. **Captions are timed in proportion to their length**, the same for all three services (chosen over each service's own timings where it has them): a scene's narration is cut into caption lines, and each line gets the share of the narration's length that its characters have.
8. **Fonts are bundled, and the agent may use another one.** kvvideo ships good English and Arabic fonts; when the person asks for a font, the agent finds it, saves the font file in the workspace, and names that file.
9. **The browser is the Chrome or Edge already installed**, driven with `playwright-core` (chosen over downloading Chromium on first use). No browser is downloaded.
10. **ffmpeg is found on the PATH** (chosen over bundling it).
11. **Bundled in the `coder` preset, off until `/video`** (chosen over a separate install): the `video` connector is `optIn`, and the slash command `/video` turns it on in a chat.
12. **A render runs inside its call** (chosen over a new kvcoder option that tells a registered command its chat; changes the earlier "background job and a message" answer, which needs that option): `compose` runs to its end in the call, up to 30 minutes, as a running call that Stop cancels.
13. **The player in the chat** is a card of `compose` (ADR 0082, 13), which plays a copy of the video kept in the kernel's files, and the kernel's file route answers byte ranges so the player can seek.
14. **The newest 10 copies per workspace are kept** (chosen over a number of days, and over forever). Rendering the same file again replaces its copy; past 10, the oldest copy is deleted, and its card says to open the file.

### The smallest way to carry them out

15. **The connector's commands** are `check`, `fonts`, `record`, `narrate`, and `compose`. The agent writes the script itself, in a Markdown artifact; kvvideo calls no model.
16. **Every command has `retries: 0`**: a retry would only run the program, or pay the service, again.
17. **Nothing asks the person.** `record` drives only a local page, `narrate` costs cents, and the outputs are new files in the workspace; an existing file is replaced only with `replace: true`.
18. **`record` reaches only this computer**: its page and every `goto` are http or https on `localhost`, `127.0.0.1`, or `[::1]`, without credentials. kvman's own address is refused, and every request to it from the recorded page is blocked, since that page would act as the person on kvman's API.
19. **The recording shows a cursor**: the mouse moves to each target before it acts, a dot follows it, and a click shows a ring, since a browser's recording has no pointer.
20. **The programs are settings**: `kvvideo.programs.ffmpeg`, `.ffprobe`, and `.piper`, a name looked up on the PATH by default, or a full path, as `kvcoder.shell.path` is.
21. **The services' keys are kvvideo's secrets** `elevenlabs.apiKey` and `openai.apiKey`, set on kvvideo's extension page. A key is never logged, stored elsewhere, or returned.
22. **Piper 1.3 or later** (`pip install piper-tts`), with the voice a path to its `.onnx` file.
23. **Each scene is rendered on its own**, to the same size, frame rate, and codecs, then the scenes are joined without encoding again: one short ffmpeg command per scene, in place of one large filter graph.
24. **The bundled fonts** are Poppins and Lato (English), and IBM Plex Sans Arabic, Tajawal, and Amiri (Arabic, each with Latin letters), each in its bold weight under the SIL Open Font License. Captions with Arabic letters use IBM Plex Sans Arabic unless a font is named; others use Poppins.

### Asked while building

25. **kvvideo captures the page itself** (asked at M5.2; chosen over downloading Playwright's own ffmpeg build). Playwright's recording needs a separate ffmpeg build that a fresh computer lacks. kvvideo instead takes the browser's screen frames (Chrome's screencast, which Playwright's recording also uses) and encodes them with the ffmpeg kvvideo already needs, as H.264 at 30 frames a second. Nothing is downloaded, there is one ffmpeg, text is sharper than Playwright's 1 Mbit VP8, and `record` writes an `.mp4`.

## Plan changes

- `16-kvvideo.md`: new.
- `01-overview.md` §1.4 and §1.5: kvvideo.
- `04-http-api.md` §4.1: `GET /api/files/:id` answers one byte range.
- `11-presets.md`: kvvideo in `coder`.
- `13-milestones.md`: M5.1 to M5.4.
- `README.md`: the new files.
