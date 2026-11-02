# ADR 0115 — kvvideo makes professional videos, and the person can record the narration

Status: accepted, 2026-11-02. It changes plan 16 throughout, plan 01 §1.5, plan 08 §8.4, §8.5, and §8.7, plan 14 §14.6 and §14.10, plan 15 §15.4, and adds milestones M5.5 to M5.11 to plan 13.

The product owner asked (2026-11-02) for suggestions so kvvideo can make "professional, rich, clean, qualified" videos, and for a way to record their own voice: "it should show the user the sentence and how to say it and record button in the conversation". They then gave a list of 52 production rules and asked whether kvcoder follows them. It followed the general ones (the person's instructions, no invented facts, their language) and few of the production ones, and about half of them needed tools kvvideo didn't have: compose ran a fixed recipe (scale, pad with black, hold, captions), joined the scenes without encoding again, had one sound input per scene, and `record` answered when each step happened but not where. The owner asked for every question to be resolved one by one; decisions 1 to 30 are their answers. Decisions 31 to 52 are the smallest way to carry them out; the product owner may overrule any of them.

## Decisions

### Asked

1. **Polished by default.** In a chat with `/video`, a plain "make a demo video" gets a finished video: a title, transitions, camera moves, framing, styled captions, and sound effects. The script artifact has a "Look and sound" section that lists these choices, so the person's agreement to the script covers them, and the person's instructions override any of them (chosen over polished without listing them, and over plain unless asked). kvcoder's "add nothing that wasn't asked" is unchanged: in a video chat a polished video is what was asked.
2. **Each scene rendered alone, then one final pass** over the joined parts for transitions, sound effects, and loudness (chosen over joining without encoding again, ADR 0107, 23, and over one large ffmpeg graph). An error still names its scene.
3. **HTML scenes, loaded by kvvideo.** The agent writes an HTML file in the workspace (a title, a diagram, a chart, animated text, an end card), and `record` records it from the workspace through the browser's request routing, with no server and no port (chosen over the agent serving it with `shell`, and over still images only).
4. **An HTML scene may load from the internet** (chosen over the workspace only, and over the workspace and a list of CDNs). kvman's own address stays blocked, as for every recorded page (ADR 0107, 18).
5. **No AI images** (chosen over OpenAI images with the key kvvideo has, and over a service setting). Pictures are drawn in HTML, CSS, and SVG, recorded from the app, or given by the person.
6. **No AI video yet** (ADR 0107, 2 stands). The rules about characters, anatomy, and natural movement are left out of the guide.
7. **The camera zooms automatically** to what is clicked or typed in, and back out when the page is idle; the agent writes no camera moves (chosen over automatic and manual moves, and over manual only).
8. **Recordings at 2× density, videos 1920 × 1080 by default, 30 frames a second** (chosen over adding a 60 fps option, and over 1× density). A zoomed page stays sharp.
9. **Natural motion**: an arrow pointer, eased and slightly curved moves, a press and a ripple on each click, typing at a varying pace, and smooth eased scrolling (chosen over keeping the dot, and over fixing scrolling only).
10. **Framing**: a scene of the app is shown in a window (rounded corners and a soft shadow on a background, the default), in a phone (the page recorded as a phone), or filling the frame (chosen over window or full only, and over full only).
11. **Overlays on a recording**: a callout (a short label pointing at a target), a highlight (everything but the target dimmed), and a blur (for emails, keys, and personal data on screen); the guide tells the agent to blur anything private (chosen over blur only, and over none).
12. **A small set of transitions**: cut, crossfade (the default, 500 ms), fade through black, and slide, mirrored for a right-to-left video (chosen over crossfade and cut only, and over all of ffmpeg's).
13. **No music** (ADR 0107, 3 stands for music; chosen over the person's or free-licensed tracks, the person's files only, and generated music).
14. **A small bundled set of sound effects**: a click on each click, key taps while typing, a whoosh on a slide, and a pop when a callout appears, quiet, and turned off per scene or per video (chosen over adding the person's files, and over none). This changes ADR 0107, 3 for sound effects.
15. **The generated voice is directed**: `speed`, `tone`, a workspace pronunciation list applied to what is spoken but not to the captions, and ElevenLabs given the neighbouring sentences so the scenes sound like one take (chosen over a pronunciation list only, and over nothing new).
16. **Steps wait for a caption line**: `record` takes the scene's narration, and a step may start at a caption line, so a click lands as the voice says it (chosen over steps that wait for a time, and over `wait` steps only).
17. **Narration is made sentence by sentence**, so every sentence's start is exact with all three services, and ElevenLabs's character times make every line and word exact there (chosen over ElevenLabs's times only, local speech recognition, and keeping ADR 0107, 7). This changes ADR 0107, 7.
18. **Caption styles and an `.srt` file**: `boxed` (the default), `outline` (the style before), `highlight` (word by word where word times exist), or off, and an `.srt` beside the MP4 (chosen over the styles burned in only, and over no change). This changes ADR 0107, 6.
19. **The mix is levelled to −14 LUFS**, its peaks under −1 dBTP, with short audio fades at each cut and a short pause before and after each scene's narration (chosen over −16 LUFS, and over no levelling).
20. **The agent reviews the video and sees its frames.** `video review` measures the video and makes contact sheets, and kvcoder gains a general rule: a registered command may return images that the model sees (chosen over a text report only, and over no review command).
21. **A brand saved per workspace**: logo, colours, and font, taken from the app for the first video, shown in the script, and saved once the person agrees (chosen over choosing them per video, and over none).
22. **Four extras**: progress while recording and rendering, a poster image, several shapes from one `compose`, and a narration cache.
23. **The 52 rules are condensed into the guide**, about 15 grouped rules, each tied to the command that carries it out (chosen over the list as written, and over adding the full list as a file).
24. **The record card is kvcoder's `ask record`** (chosen over kvvideo's own question card, and over recording on kvvideo's extension page). Any product can ask for a voice recording.
25. **The card guides the person**: stressed words in bold, pause marks, the tone, pace, and target length, a 3-2-1 countdown, a level meter and a timer while recording, an example to listen to, and "Upload a file" and "Skip" (chosen over no example, and over a plain sentence and a note).
26. **Examples are narrated up front** by the agent with `narrate`, cached, and passed to the card (chosen over only when asked, and over a choice in the script). They cost what a generated narration costs, are listed in the script, and are the fallback when a line is skipped.
27. **One card per scene, one take per sentence** (chosen over a card per sentence, and over a take per scene).
28. **Each take is cleaned**: low rumble removed, steady noise reduced, silence at both ends trimmed, the level evened out; the person's takes are kept as they were recorded (chosen over trim and level only, and over no cleanup).
29. **The microphone in all three hosts**: the browser, the desktop app on Linux, macOS, and Windows, and VS Code's frame; where it still can't open, the card says so and offers to open the chat in a browser and to upload a file (chosen over the browser and desktop only, and over the browser only).
30. **No voice cloning** (ADR 0107, 3 stands for cloning).

### The smallest way to carry them out

31. **A sidecar per output.** `record`, `narrate`, `voice`, and `compose` write `<file>.kvvideo.json` beside their file, with what they answered and what a later command needs (the captions, the steps and their boxes, the scenes' times). A later command reads it instead of the agent copying numbers between calls (ADR 0113, 3). A sidecar is validated with zod when read; one that is missing or invalid is treated as absent.
32. **Pages and apps are recorded the same way.** `record` takes exactly one of `url` (the app, on this computer) or `page` (an HTML file in the workspace). A page is opened at `http://page.kvvideo.invalid/<its name>`, a name that never resolves, and each request to that origin is answered from the page's folder and below.
33. **Times in a recording.** Each step answers `atMs` (it started), `actMs` (the pointer arrived and the action began) for `click`, `type`, and `hover`, `endMs` (it finished), and `box` (its target's place in the page) for `click`, `type`, and `hover`. The camera, the overlays, and the sound effects are placed from these.
34. **The automatic camera** zooms to 1.6× (less when the target is larger than the zoomed view), centred on the target and kept inside the page; it eases in while the pointer travels, follows the next action within 2.5 s by panning, and eases out 1.5 s after the last one. It applies to a recording of the app, never to a page.
35. **Phone recordings** are `record`'s `device: 'phone'`: a 390 × 844 touch screen, taps in place of clicks, and a round touch mark in place of the arrow.
36. **Frames and overlays are drawn by the browser.** The background, the window's shadow and corners, the phone's outline, and each callout are drawn once per scene as images by the browser kvvideo already uses, with the brand's colours and font, and ffmpeg places the recording in them.
37. **The final pass** joins the parts with ffmpeg's `xfade` and `acrossfade`, mixes the sound effects, measures the loudness, and encodes once more with that measure. The parts are encoded near-losslessly so the second encode loses little. `compose` gets 60 minutes in place of 30 (ADR 0107, 12), for that pass and for the other sizes.
38. **The sound effects** are four short files under CC0 (Kenney's audio packs are the first place to look), bundled with a `SOURCES.md` that names each file's source and licence.
39. **Voice direction per service.** `speed` (0.7 to 1.2) is sent to all three: ElevenLabs's `voice_settings.speed`, OpenAI's `speed`, and Piper's `--length-scale`. `tone` reaches OpenAI only, as its `instructions`: ElevenLabs's multilingual model takes no spoken direction, and Piper has none. ElevenLabs gets `previous_text` and `next_text`.
40. **The narration cache** is per sentence, in kvvideo's workspace collection `narrations` with the audio in the kernel's files, keyed by the service, voice, model, speed, tone, and the spoken sentence; the newest 2000 sentences are kept.
41. **A pause around the voice.** A scene's narration starts 300 ms into the scene, and a scene whose length comes from its narration lasts 300 ms past it. Sentences are joined with 250 ms between them.
42. **The caption box** is white text on black at 65% opacity, one line at a time as before; the highlight colours the words already spoken in the brand's primary colour, or amber without a brand.
43. **The brand** is the workspace setting `kvvideo.brand`, read with `video brand` and set with `video brand-set`, without asking, since the person agreed to it in the script (ADR 0107, 17).
44. **Several shapes**: `compose`'s `extraSizes` (up to 2) writes `<name>-<width>x<height>.mp4` beside the main file. A recording of the app is framed again for each shape, and a page is recorded again at that shape, with its shorter side 720 px, so its layout fits.
45. **The poster** is the frame in the middle of the first scene, saved as `<name>.jpg` and kept with the player's copy.
46. **Progress.** kvvideo sends `{ text }` progress chunks ("Scene 3 of 8"), and kvcoder shows the newest one on the running call's card. Effects run one after another (ADR 0046), so a chunk belongs to the one running call of its extension.
47. **Images for the model** (kvcoder §8.4). A command entry with `images: true` may answer `images` (up to 8 PNG or JPEG kernel files of at most 5 MiB each); kvcoder adds them to the tool result for a model that takes images, and says they weren't shown to one that doesn't. A cleared result loses its images too.
48. **`video review`** reports the loudness, silences of 3 s or more, black pictures of 0.5 s or more, and pictures unchanged for 6 s or more, and makes up to 8 contact sheets of 12 frames: the middle of each scene, just after each transition, and the middle of each caption line. The newest 24 sheets per workspace are kept.
49. **`ask record`** answers `{ takes: [{ file, durationMs }] }`, one per line, written as `<folder>/line-<n>.<ext>`. The card uploads each take to the kernel's files, kvcoder writes it into the workspace and deletes the upload. A take is at most 60 s; the browser's own recording format is kept (WebM or Ogg with Opus, MP4 with AAC).
50. **`video voice`** cleans a scene's takes, levels each to −16 LUFS so they match, joins them as `narrate` joins sentences, and times the captions sentence by sentence. With `clean: false` it only converts and joins them, which undoes a cleanup that was too strong.
51. **The microphone is granted only to kvman's own page.** The desktop app grants it to kvman's origin after the operating system asks the person, and refuses it to every other origin, such as an artifact's frame; the camera is never granted. VS Code's frame adds `microphone` to its `allow` list.
52. **The guide** has the production rules in seven groups (story, look, motion, text, sound, accuracy and licences, review), then the steps of making a video.

### Asked while building

53. **The pointer shows from its first move** (asked at M5.5; chosen over showing it from the first frame, and over that for the app only). It is hidden until a step moves it, then stays, so a page with no clicks never shows one.
54. **Progress is a translation key** (asked at M5.5, since decision 46's `{ text }` broke the rule that every text the person sees has `en` and `ar`; chosen over English text only). A chunk is `{ key, params? }` in the sending extension's catalog, and kvcoder shows it translated.
55. **kvvideo is a generic video maker** (the owner, at M5.5: "the user can make any type of videos based on his needs"). A lesson, an explainer, a tutorial, a promotion, an announcement, a story, or a social clip; a tutorial of the person's app is one kind among them. The plan's purpose, the connector's description, and the guide say so, and nothing assumes an app of the workspace.
56. **`record` opens any website** (chosen over websites outside the private network, and over this computer only). It changes ADR 0107, 18: any http or https address without credentials, in a fresh browser with no saved sign-ins; kvman's own address stays refused, and the recorded page's requests to kvman's port stay aborted. A recording's sidecar kind is `site`.
57. **Still no music** (asked again for a generic maker; chosen over the person's or free-licensed music, and over the person's files only). Decision 13 stands.
58. **The person's media and licensed web media** (chosen over the person's media only, and over decision 5 as it was). Still no generated images; a scene may use the person's images and clips, and images and clips the agent finds on the web under a licence that allows their use, saved in the video's folder and named with their source and licence in the script, with a credit in the end scene when the licence asks. An image scene's camera zooms slowly from 1× to 1.08×.

## Plan changes

- `16-kvvideo.md`: rewritten for decisions 1 to 58.
- `01-overview.md`: §1.5 kvvideo makes any kind of video.
- `08-kvcoder.md`: §8.4 `images` on a command entry and progress on a running call; §8.5 `ask record`; §8.7 the record card and its answered card.
- `14-desktop.md`: §14.6 the microphone; §14.10 what the shell grants.
- `15-vscode.md`: §15.4 the frame's `allow`.
- `13-milestones.md`: M5.5 to M5.11.
- `README.md`: this ADR, and plan 16's row.
