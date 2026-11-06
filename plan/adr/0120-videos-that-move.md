# ADR 0120 — Videos that move: scenes drawn frame by frame, a motion kit, 3D, brand files at a fixed address, and fixes from the KVCare promotion

Status: accepted by the product owner on 2026-11-06. The owner made a promotional video of their KVCare app with
`/video` and called it "crap", with "many issues", and asked for kvvideo to "produce high quality videos with proper
visualizations and effects and smoothness". Decisions 1 to 12 were asked, the recommended option chosen each time but
3 (the owner chose effects without music) and 1 (the owner added 3D: "three.js or whatever needed to produce the
perfect video"). Decisions 13 to 30 are the implementer's, overrulable. It amends plan 16 and plan 08 §8.5 and §8.7
(`ask record`), and ADR 0107, 3 and 25, ADR 0115, 7, 8, 13, 14, 18, and 58, ADR 0117, 3 and 5, and ADR 0119, 1.

## Context

The chat "KVCare Arabic Promotional Video Planning" (2026-11-06, 16:25 to 17:24) made a 29 s, 1920 × 1080 Arabic
promotion in the owner's own voice. What went wrong:

- **Setup took 40 minutes.** The owner chose their own voice, but the guide's Ready stage required a narration
  service for the examples; the owner asked "why api keys are needed while i want to record my voice". The lead then
  installed Piper into the video's folder (170 MB) and its voices there (61 MB), installed it again for the user, and
  asked the owner three times to paste paths into kvvideo's settings.
- **`ask record` failed twice**: `stress` takes single words, and the lead sent phrases ("الفريق الطبي").
- **The timing was a guess.** The treatment timed the script at 2 words a second (45 s); the owner spoke it in 21 s.
  The lead kept the treatment's lengths, so the first cut had silences of 3.6 to 7.8 s, then cut it to 29 s.
- **The scenes were still slides.** Each scene was a card that faded in once and then nothing moved for 3 to 8 s
  (review found 7.5 s frozen); half of each frame was empty; a page is never moved by the camera, and sound effects
  come only from clicks, typing, slides, and callouts, so the video had none.
- **The font and the logo were missing, silently.** `style.css` loaded the app's Tajawal from
  `../../dashboard/public/fonts/`, outside the page's folder, which is answered 404, and nothing said so: every scene
  fell back to a default font. The brand's logo sat outside the folder too, so the scenes wrote "KVCare" as text.
- **The captions** were a grey box in IBM Plex Sans Arabic, repeating each scene's heading, cut greedily at 42
  characters ("…بيانات الزيارة في" / "السجل الطبي للمريض."), and `voice` joined a take's two sentences into one.
- **The owner agreed to a look they never saw**: the style frames were static HTML artifacts drawn in Arial.
- **Loudness.** `compose` aims at a true peak of −1 dBTP; the AAC encode overshot to −0.7, so `review` flagged
  `compose`'s own output. `review` gave no measure in the problem, so the lead ran its own ffmpeg `loudnorm`, delivered
  `kvcare-final.mp4` (96 kHz sound, −16 LUFS, flagged again), outside kvvideo's sidecar and player.
- **`review` flagged the end card's silence**, which was meant.
- **Smoothness.** A recording is the page's real-time screencast, which drops frames when the computer is busy.

## Decisions

1. **Motion.** kvvideo ships a motion kit, `motion.css`, that every HTML scene may link: entrances, exits, emphasis,
   slow ambient motion, word by word text, numbers that count, and SVG lines that draw. A recorded page's `auto`
   camera is a slow push-in from 1× to 1.05× over the scene. `review` reports a picture unchanged for 3 s or more.
   HTML scenes may use 3D, with three.js (chosen over the kit only, and over guide rules only).
2. **HTML scenes are drawn frame by frame at 60 frames a second** (chosen over 30, and over keeping real time): kvvideo
   holds the page's clock, sets it to each frame's time, and shoots the frame, so every frame is exact whatever the
   load. Websites are recorded in real time as before.
3. **Sound effects, no music** (the owner's choice, over a music bed ducked under the voice). ADR 0107, 3 and ADR 0115,
   13 stand.
4. **The person's own voice needs no narration service** (chosen over kvvideo installing Piper, and over keeping the
   requirement). A recording card plays an example only when a service is ready; without one it shows the line with
   its stress and pause marks.
5. **kvvideo drives the clock of a page's scripts** (chosen over a seek function each scene writes): while a page is
   drawn or looked at, kvvideo's clock replaces `requestAnimationFrame`, `performance.now`, `Date`, and the timers,
   and moves only when kvvideo moves it, so three.js, anime.js, Lottie, and canvas drawing are exact at every frame.
   The guide's rule "CSS animations and transitions only, never script timers" is lifted.
6. **three.js, anime.js, and lottie-web are bundled** in kvvideo, pinned (chosen over loading them from the web), and
   served to every scene at a fixed address.
7. **A fixed `kvvideo/` address in every page** (chosen over copying files into each video's folder, and over only
   reporting): `kvvideo/motion.css`, `kvvideo/brand.css` (the brand's colours as CSS variables and its font, and the
   bundled fonts, as `@font-face`), `kvvideo/logo.<ext>`, `kvvideo/fonts/<file>`, and `kvvideo/lib/…`. `record` and
   `look` report every file that failed to load.
8. **The lead sets the narration service, after asking** (chosen over the person editing settings with clearer
   steps): `video narration-set` sets the service, the voice, and the model; the guide calls it only after the person
   agreed in an `ask` card. Keys stay secrets the person adds. Piper and its voices are installed outside the
   workspace, in kvvideo's tools folder.
9. **Captions take the brand** (chosen over always on, and over keeping them grey): `boxed` is the brand's `primary`
   with text in white or near black, whichever contrasts more; with no brand the default style is `outline`. `highlight` keeps its dark box, so its words in the
   brand's colour show. The guide
   turns captions off when every scene shows its words as large on-screen text, and keeps them for spoken
   explanations and social clips watched on mute.
10. **The treatment shows a moving preview** (chosen over still images and over the HTML artifacts): the style frames,
    drawn and composed into a clip of about 6 s, shown in the chat's player.
11. **Sound cues in the scene** (chosen over sounds listed in `compose`, and over transitions only): an element with
    `data-sound="pop"`, `"whoosh"`, or `"click"` sounds when its first animation starts. A crossfade has a soft whoosh,
    a slide its whoosh as before.
12. **Every finished video is 60 frames a second** (chosen over 60 only without websites, and over an option): a
    website recording, at 30, is shown at 60 by repeating each frame.

### The implementer's decisions

13. **Which pages are drawn frame by frame**: a page whose steps are all `wait` (or that has none), which is what an
    HTML scene is. A page with clicks, typing, or scrolling is recorded in real time, as a website is, since its
    pointer, typing, and scrolling move on the real clock.
14. **A drawn page's length** follows the real-time rules (500 ms before the first step, the steps, 1000 ms after the
    last, at least the narration's lead, length, and lead), so a recording's length doesn't change with the way it is
    made.
15. **The frame** is shot with the browser's screenshot at the page's 2× density as a JPEG of quality 92, and piped to
    ffmpeg at 60 frames a second; the answer's `durationMs` is the frames' count × 1000 ÷ 60, rounded.
16. **kvvideo's clock** also seeds `Math.random`, so a scene that uses chance draws the same frames at every call; an
    animation of the document seen first at clock time *b* is paused and set to *t − b* at time *t*, and a `<video>`
    or `<audio>` element of the page is paused and set to its own time likewise.
17. **`look` of a page** moves kvvideo's clock in steps of 1/60 s to each moment, so its scripts run as they would in
    the recording. `look` of a website keeps the held animations of ADR 0117, 4.
18. **`brand.css`** defines `--brand-primary`, `--brand-background`, `--brand-text`, and `--brand-font`; with no brand
    they are `#2563EB`, `#0F172A`, `#F8FAFC`, and the bundled font of the page's language. It declares an
    `@font-face` for each bundled font by its name, and for the brand's font file, served at
    `kvvideo/fonts/brand.<ext>`, by its family name.
19. **The libraries' addresses**: `kvvideo/lib/three/` answers files under three's `build/` and `examples/jsm/`;
    `kvvideo/lib/anime.js` is anime.js's ES module bundle; `kvvideo/lib/lottie.js` is lottie-web's player. A page's own
    file under a `kvvideo/` folder is never served: the address is kvvideo's.
20. **Failed loads**: `record` and `look` answer `failed: [{ url, status }]`, the requests of the page that got an
    HTTP status of 400 or more (`status`) or failed (`status` 0), in order, without repeats, at most 20.
21. **Sound cues are measured as the page is drawn**: an element's cue time is the first frame at which one of its
    animations is past its delay; the drawn recording's sidecar and answer list them as `sounds: [{ sound, atMs }]`.
    Only drawn pages have cues. A pop or a click is mixed 18 dB below the narration, a whoosh of a crossfade 26 dB.
22. **The final pass aims at a true peak of −2 dBTP** (`I=-14:TP=-2:LRA=11`), so the encoded AAC stays at or below
    −1 dBTP, which `review` checks.
23. **`review`'s problems carry a `reason`**, a sentence with what was measured and the bound (for example "The
    integrated loudness is −16.0 LUFS, outside −15 to −13 LUFS."), and a silence that reaches the video's end and
    lasts at most 5 s is not a problem (an end card held to be read).
24. **Captions are cut evenly**: a sentence over 42 characters is cut into the fewest lines of at most 42 characters,
    as even in length as whole words allow, breaking after a comma, an Arabic comma, a semicolon, or a colon when a
    break there keeps every line within 42 characters. `voice` captions each sentence of a take on its own, sharing
    the take's length by characters.
25. **`ask record`'s `stress` and `pauses`** each take a word or a run of consecutive words of the line (1 to 50
    characters), found as whole words in any case; a pause mark goes after the run's last word.
26. **`video narration-set { service, voice?, model? }`** (`kvvideo.narration.set`) sets the global
    `kvvideo.narration.service`, `.voice`, and `.model` (left out is `null`); Piper's `voice` is a full path to an
    existing `.onnx` file with its `.onnx.json` beside it, wherever it is. `check`'s `narration` answers `toolsFolder`,
    `<KVMAN_HOME>/kvvideo`, where Piper and its voices go (`null` with no home).
27. **The timing comes from the voice.** After the voice is made, the lead re-times every scene from its measured
    length; when the whole is more than 10% from the length asked, it asks the person once: record again, change the
    words, or accept the new length.
28. **No ffmpeg of the lead's own on a video.** The guide says to fix a fault through kvvideo's calls and compose
    again, never to process a finished video with `shell`.
29. **Designer helpers** get `maxSteps` of at least 30, the scene's narration and caption times, `kvvideo/motion.css`,
    and the motion rules in their brief.
30. **New dependencies** of kvvideo, pinned: `three` 0.187.0, `animejs` 4.5.0, and `lottie-web` 5.13.0, each MIT.

## Consequences

- A scene's motion is exact and smooth at 60 frames a second, whatever the computer's load; a three.js scene renders
  the same at every call. Drawing frames is slower than real time; progress shows each frame.
- Scenes reach the brand's font, logo, the motion kit, and the libraries without copying, and a file that doesn't load
  is reported instead of silently replaced.
- A video in the person's own voice starts without a service; a generated voice is set up by the lead after asking.
- `compose`'s output passes its own `review`, whose problems say what was measured.
