# ADR 0119 — A video with no voice, slash commands the lead knows, number limits in signatures, and a link card that opens a tab

Status: accepted by the product owner on 2026-11-05. The owner asked to review their latest chat ("I'm trying to
create video but got tools error, investigate and fix") and then "check if there are another issues to fix them in this
release as well". Every decision below was asked, with the recommended option chosen each time; decision 5 is the
owner's own ("it doesn't work on all, also make it open in new tab"). It amends plan 16 §16.1, plan 08 §8.2 (the prompt
and the signatures) and §8.7 (the artifact card), and ADR 0117, 21.

## Context

Four chats of the owner's `faculty` workspace (2026-11-03 and 04) showed:

- **"Statistics Chapter Video Setup"** (after `/video`): the owner asked for a 3-minute video of a statistics chapter,
  then said "no need for voice at all, you can generate simple effects sound only". The lead stopped twice and asked
  for a narration service. The guide's Ready stage said to stop until ffmpeg, a browser, *and* a narration service are
  there, for every video. The tools already make a video with no voice: `compose` takes scenes without `narration`
  (each as long as its `durationMs`, its sound silence), `record` takes no `narration` without `atLine`, and the sound
  effects are mixed either way. Only the guide blocked it.
- **"Animated Statistics Lesson for Beginners"** (no `/video`): the owner asked for a creative video. kvvideo was
  hidden there (ADR 0117, 21), so the lead wrote its own Python and ffmpeg slideshow; the owner called it "crap"
  ("no creativity at all, no effects and visuals"). The lead couldn't know `/video` existed.
- The same chat: the video was a `url` artifact on a local address. The owner pressed the card's Open, which opens the
  side panel, and its frame couldn't play the MP4 in the hosts whose web engine lacks H.264 (VS Code's, and WebKitGTK
  without its codecs); the owner said the link didn't work "on all".
- **"إعادة كتابة دروس الإحصاء وتبسيطها"**: the lead sent four `delegate run` calls with `maxSteps` 65 in one reply, and
  all four failed `VALIDATION_FAILED`. The signature showed `maxSteps?` with no range; a string field shows its limit
  (`goal (≤300)`, ADR 0090, 4), a number field didn't.

## Decisions

1. **A voice of "none" is a choice.** The brief asks for the voice as generated, the person's own, or none (on-screen
   text and sound effects only). Ready stops for ffmpeg and the browser; a missing narration service stops the work
   only when the video has a voice (generated, or the person's own, whose examples are generated), so with only the
   service missing the lead goes on and settles the voice in the brief. With no voice: the on-screen text carries the
   words, each scene lasts long enough to read its text and is given its `durationMs`, the whole within 10% of the
   length asked; Voice first is skipped; an HTML scene's elements are timed from the recording's start; a website is
   recorded with `wait` steps between its actions and no `narration` or `atLine`; there are no captions; the sound
   effects stay. Only the guide and plan 16 §16.1 change; no code of kvvideo changes (chosen over keeping captions
   written by hand, and over always requiring a voice).
2. **Review's silence and loudness are expected without a voice.** The guide tells the lead that in a video with no
   voice, `video review`'s `silence` and `loudness` problems are expected and aren't faults; `review`'s shape doesn't
   change (chosen over a `voice` input to `review`).
3. **The lead knows the slash commands.** A lead's prompt (not a helper's) ends, after the connector index, with the
   block `## Slash commands`: "The person can type these in the send box to turn on more in this chat. When they ask for
   what one of them is for and it isn't on in this chat, tell them to type it instead of doing that work another way.",
   then a line per slash command of `kvcoder.slash.list`, by name, `- /<name>: <description>`, where the description is
   the English description of the command the slash command runs (its registration's, read from
   `kernel.extensions.list` once when the slash command is registered and kept on its record, so building a prompt reads
   no schema), since a slash command's own `description` is a translation key. An entry stored before reads as none and
   isn't listed; 0.4.16 required it, so kvcoder's start failed to clear the old entries and `/video` and
   `/build-kvman` were gone until 0.4.17. No block when there are none. Nothing else of an
   opted-in connector or its guide is in a chat before it is turned on, so ADR 0117, 21 stands but for this line
   (chosen over a visible kvvideo connector, and over leaving it).
4. **A number field shows its range in a signature.** A number or integer field with a `maximum` is followed by
   ` (<minimum>–<maximum>)` when it also has a `minimum`, as `maxSteps? (1–60)`, and by ` (≤<maximum>)` otherwise. A
   bound of ±`Number.MAX_SAFE_INTEGER`, which zod writes for every integer, is no bound, and a field with only a
   minimum shows none, so `(≥0)` doesn't crowd the index (chosen over leaving it).
5. **A link card opens a tab.** In the conversation, the Open of a `url` artifact's card opens its address in a new tab,
   as the panel's "Open in a new tab" does (a link with `target="_blank"`, so the desktop app and an embedded kvwebui
   hand it to the system's browser), when the card's call wrote the address and the panel would offer that link (an
   http or https address on `localhost` or `127.0.0.1`, not kvman's own port). Otherwise, and for every other format,
   Open opens the panel as before. The panel stays reachable from the header's artifacts button.

Scenarios: `milestones/QA78-TEST-CASES.md`, written before source.
