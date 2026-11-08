# ADR 0121 — Craft notes for better videos: story, scenes, motion, charts, tutorials, and social clips

Status: accepted by the product owner on 2026-11-08. The product owner asked how kvvideo could benefit from OpenMontage
(https://github.com/OpenMontageInc/OpenMontage, read at `356b5fa`), agreed to take its guidance on making better videos,
and chose decision 1. Decisions 2 to 10 are the implementer's, overrulable. It amends plan 16 (§16.1, §16.3, §16.4, and
§16.12) and adds milestone M5.17 to plan 13.

## Context

kvvideo's guide (ADR 0117, ADR 0120) is a sound production workflow: ten stages, the motion kit, the clock, the review.
What it says little about is craft: how to write a script that holds attention, how to design a frame for video rather
than for the web, how to vary motion, how to show numbers, how to cut a tutorial, how to open a social clip.
OpenMontage, an agent-driven video system, carries that craft in guides of its own and in the HyperFrames guides it
vendors, which build videos from HTML scenes as kvvideo does. The useful ones are its storytelling and explainer script
guides, its explainer scene guide, its data visualization guide, its screen demo guides, its short-form guide, and
HyperFrames's motion principles, video composition, house style, beat direction, and narration guides. Most of the rest
assumes generated images and video, music, or avatars, which kvvideo doesn't do (ADR 0107, 2 and 3; ADR 0115, 13 and
57; ADR 0120, 3).

Two facts shaped the answer:

- **The guide is full.** `docs/guide.md` is 14,444 bytes, and a section is at most 16 KB (plan 08 §8.4). The craft
  doesn't fit in it, and a second section would be sent at every step of every `/video` chat.
- **Workers never see the guide.** A worker sees only its brief and the rule files (plan 08 §8.5; ADR 0117), so the
  designer workers that build HTML scenes get the motion rules only as the lead retypes them in each brief.

Three of OpenMontage's rules contradict kvvideo's guide: ambient motion under every scene (HyperFrames: vary it, and let
the scene hold still after a key reveal), one focal point (HyperFrames: two at least, so the eye has a path), and a
crossfade between scenes by default (HyperFrames: a crossfade means "this continues", a cut means a change).

## Decisions

### Asked

1. **The craft is read through `video craft { topic }`** (chosen over a second prompt section set by `/video`, over a
   command that writes the notes into the video's folder for `delegate`'s `context`, and over squeezing the most
   important rules into the guide): a public query answers one bundled note, so the craft is in the prompt only when a
   stage needs it, and a designer worker reads it itself through the `video` connector.

### The implementer's decisions

2. **Six notes**, each a Markdown file of kvvideo, `docs/craft/<topic>.md`, at most 8 KB: `story` (the opening, the
   structure, writing for the ear, the script's self-check), `scenes` (scene patterns, variety, composing the frame,
   sizes, colour), `motion` (a scene's build, hold, and resolve; a verb per element; varied easing, speed, direction,
   and rhythm; text; transitions; sound cues; 3D), `charts` (the form, the build in time, labels, truth), `tutorial`
   (the script by step, attention cues, pace, shapes), and `social` (the first second, pace, the shapes of 15, 30, and
   60 s, words on screen).
3. **`kvvideo.craft.get { topic }` → `{ content }`**, a public query (a query is never retried) with a timeout of 1
   minute, no progress, `topic` one of the six (`VALIDATION_FAILED` otherwise), `content` the note's text. A read-only worker's
   helper has it with the other queries. Its connector entry has an example.
4. **When each note is read.** The guide's Concept stage reads `story`, and `tutorial` or `social` for those kinds; the
   Treatment stage reads `scenes` and `motion`, and `charts` when a scene shows numbers, before the scene table and the
   style frames; a designer's brief tells the worker to read `scenes` and `motion`, and `charts` when its scene shows
   numbers, before it builds, in place of the motion rules the lead used to retype (ADR 0120, 29).
5. **The guide keeps the core rules and points to the notes.** Its Story, Look, and Motion rules stay as short
   summaries; the detail is in the notes. The guide stays under 16 KB.
6. **The key moment holds.** The reveal, the result, or the offer gets its own scene, whose narration ends on it and
   whose `durationMs` is 1 to 2 s longer than 300 ms plus its narration plus 300 ms, with one slow motion and nothing
   new entering; "no 2 s without a change" excepts it. A scene that must hold still has `camera: 'none'`.
7. **Ambient motion, focus, and transitions vary.** Ambient motion differs from scene to scene, or is left out after a
   reveal; a frame has one main focus and a second element for the eye to travel to; `crossfade` is for a thought that
   continues, `slide` for the next step of a sequence, `cut` for a change of register, a surprise, or a fast list, and
   `fade-black` for the end.
8. **Sizes in the frame's height.** A page is recorded at one size and shown at another (§16.5, §16.8), so the notes
   give sizes in `vh`: a headline 6 to 11, body text 2.6 to 4, labels at least 1.8, nothing under 2.2 without a reason.
9. **Numbers are written as said.** The narration's text is what the voice says and the captions show, so it writes
   numbers, symbols, and addresses in words in the video's language ("nearly two trillion dollars"), and the scene shows
   the exact figure.
10. **Written in kvvideo's own words.** OpenMontage is AGPLv3 and kvvideo MIT, and the vendored HyperFrames guides state
    no licence in OpenMontage's copy, so no text is copied: the notes restate the rules and measures for kvvideo's own
    calls (the motion kit's classes, `compose`'s transitions, overlays, and camera, `record`'s steps), and add what
    OpenMontage lacks (Arabic, a page's clock, the kit's stacking).

### Not taken

Prompting for generated images and video, product shots from generated video, music beds and ducking, avatars, and lip
sync: kvvideo composes and doesn't generate, and has no music. The vertical captions' size and place, word timings for
every voice, a scene kit, a check of the treatment, the brand from a site, the review's new problems, a pause per line,
and licensed media search are separate decisions, not this ADR's.

## Consequences

- The lead reads the craft a stage needs, when it needs it, and the prompt grows by nothing until then.
- A designer worker reads the same notes the lead does, and its brief shrinks to the scene's own row, narration, and
  caption times.
- A note can grow without touching the guide's 16 KB, up to its own 8 KB.
