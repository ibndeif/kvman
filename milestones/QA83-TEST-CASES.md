# QA 83 — Times stay on one line beside a long headline

**Asked.** The owner reported that the time next to the running card showed on several lines. Beside a long headline,
the running line's "Turn: N steps · T" and its seconds, and a running helper's step and time, shrank to their
narrowest width and broke a line at every space. A visual bug against plan 08 §8.7; no decision changed.

Paths are relative to the repository root.

## Happy path

- **QA83-H1 the times keep one line.** *Given* the chat at side-bar width (300 px) with the lead and a helper each
  thinking a long headline, *then* the running line's turn and seconds and the helper card's step and time each take
  one line, and the running line moves them to a row under the headline when the headline needs the width
  (`extensions/kvcoder/test/e2e/helper-card.test.ts`).
