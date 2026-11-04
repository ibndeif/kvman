# QA 78 — A video with no voice, slash commands the lead knows, number limits in signatures, and a link card that opens a tab (ADR 0119)

**Asked.** The owner asked to review their latest video chat ("got tools error, investigate and fix") and to fix the
other issues found in the same release. The four chats and the answers are ADR 0119.

Paths are relative to the repository root.

## Happy path

- **QA78-H1 the guide lets a video have no voice.** *Given* a chat after `/video`, *when* its prompt is read, *then*
  the guide's Ready stage stops for ffmpeg and the browser, and for a narration service only when the video has a
  voice; the Brief asks for the voice as generated, the person's own, or none; and the guide says how a video with no
  voice is made (on-screen text, `durationMs`, no captions, sound effects) and that `silence` and `loudness` problems
  are expected then. Test: `extensions/kvvideo/test/registration.test.ts`.
- **QA78-H2 a voiceless video composes.** *Given* the stand-in ffmpeg, *when* `compose` gets an image and a clip,
  each with `durationMs` and no `narration`, *then* it answers the file with the scenes' length
  and writes no captions. Test: `extensions/kvvideo/test/compose.test.ts`.
- **QA78-H3 the lead's prompt lists the slash commands.** *Given* kvvideo started, *when* a chat's prompt is read
  before `/video`, *then* it ends with `## Slash commands`, its sentence, and
  `- /video: Starts making videos in one chat: gives the chat kvvideo's connector and guide.`, and nothing else of
  kvvideo. Test: `extensions/kvvideo/test/registration.test.ts`.
- **QA78-H4 a number's range is in its signature.** *Given* payload schemas with integers bounded 1 to 60, a number
  bounded only above by 5, a plain integer, and a non-negative integer, *when* their signatures are written, *then*
  they read `a (1–60)`, `b? (≤5)`, `c`, and `d`. Test: `extensions/kvcoder/test/unit/payload-signature.test.ts`.
- **QA78-H5 the delegate entry shows maxSteps' range.** *Given* a worker, *when* the lead's prompt is read, *then*
  `delegate run`'s signature has `maxSteps? (1–60)`. Test: `extensions/kvcoder/test/prompt-index.test.ts`.
- **QA78-H6 a link card opens a tab.** *Given* an `artifact write` result of a `url` artifact whose call wrote
  `http://127.0.0.1:8765/v.mp4`, *when* the card is shown, *then* its Open is a link to that address with
  `target="_blank"` and `rel="noopener noreferrer"`, and pressing it emits no `openArtifact`. Test:
  `extensions/kvcoder/test/web/artifact-card.test.ts`.

## Edge cases

- **QA78-E1 a helper isn't told the slash commands.** *Given* a helper of a chat, *when* its prompt is read, *then* it
  has no `## Slash commands`. Test: `extensions/kvcoder/test/prompt-slash-commands.test.ts`.
- **QA78-E2 no slash commands, no block.** *Given* no extension registered a slash command, *when* a chat's prompt is
  read, *then* it has no `## Slash commands`. Test: `extensions/kvcoder/test/prompt-slash-commands.test.ts`.
- **QA78-E3 the description is the command's, in name order.** *Given* two slash commands registered by the todo
  fixture, `b` and `a`, running its `todo.list.start`, *when* a chat's prompt is read, *then* the
  block lists `/a` then `/b`, each with its command's English description, not the translation key. Test:
  `extensions/kvcoder/test/prompt-slash-commands.test.ts`.
- **QA78-E4 a link card on kvman's own port, or not local, opens the panel.** *Given* `url` artifact cards whose call
  wrote kvman's own address, and `https://example.com/`, *when* Open is pressed, *then* each emits `openArtifact` with
  its id and has no link. Test: `extensions/kvcoder/test/web/artifact-card.test.ts`.
- **QA78-E5 a link card without its address opens the panel.** *Given* a `url` artifact card whose call isn't known (an
  `artifact edit`, or a call not in the chat's calls), *when* Open is pressed, *then* it emits `openArtifact`. Test:
  `extensions/kvcoder/test/web/artifact-card.test.ts`.
- **QA78-E6 other formats still open the panel.** *Given* a `markdown` artifact card, *when* Open is pressed, *then* it
  emits `openArtifact` with its id. Test: `extensions/kvcoder/test/web/artifact-card.test.ts` (QA6-H14).
- **QA78-E7 an integer's safe bounds are no bounds.** *Given* `z.number().int()`, `z.number().int().positive()`, and
  `z.number().int().max(5)`, *when* their signatures are written, *then* the first two show no range and the third
  `(≤5)`. Test: `extensions/kvcoder/test/unit/payload-signature.test.ts`.
