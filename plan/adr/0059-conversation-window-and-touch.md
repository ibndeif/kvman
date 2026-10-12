# ADR 0059 — a bounded conversation window, touch targets, and pages that work in the preview

Status: accepted by the product owner by choice on 2026-10-12, before source. This records KVC-23, 26, and 27.

## Decisions

1. **The window (KVC-23).** The conversation holds a window of the newest 200 stored messages, as it loads today. While the person is at the latest, a new message drops the oldest shown one, which is then counted as earlier. While they have scrolled up, or after they loaded an earlier page, nothing is dropped. "Show N earlier messages" loads the page before the first message shown and puts it above, and the place the person is reading stays where it is. "Jump to latest" returns to the newest window. Nothing is deleted from the store, and the export stays beside the new button.
2. `kvcoder.message.list` takes an optional `beforeSeq`: it then gives the newest `limit` messages whose `seq` is below it, in order, with `omitted` the count of those older still, and no waiting messages.
3. **Touch (KVC-26).** Where the pointer is a finger (`pointer: coarse`), kvcoder's buttons, icon buttons, text buttons, switches, and an attachment's remove control have a touch area of at least 44 px. With a mouse the sizes are as before. Keyboard focus shows an outline on kvcoder's buttons, and on the send box and the search box, whose fields drop their own. No layout changes, and nothing outside kvcoder.
4. **Pages in the preview (KVC-27).** The `artifact` connector's description says that a form can't be submitted in the panel, to act on a button's click and the Enter key in JavaScript, and to say that a page's interaction is unchecked unless it was tested. The sandbox is unchanged.

## Verification

Scenarios M2.4-E187 to E191, written before source.
