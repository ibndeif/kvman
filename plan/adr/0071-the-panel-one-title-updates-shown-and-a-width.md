# ADR 0071 — the panel: one title with a list, updates that show themselves, a width the person drags, and a thinking list that opens upward

Status: accepted by the product owner on 2026-10-13, before source. It amends ADR 0036, 15, ADR 0009, 140, 177, and 182, ADR 0017, 3, and ADR 0064 (the person's view).

## Context

The owner sent two pictures of the running app and asked for four things.

- The panel's header, in an Arabic chat with a map and one artifact: the row of titles showed one title cut after a few words over a sideways scrollbar (the row ADR 0036, 15 made). "I need no horizontal scroll."
- "When updating artifact then it must auto shown and on updating execution map it must be auto show as well." The panel opened only for an artifact whose id was new and for a map's first appearance.
- The thinking levels of the send box: the browser's own list of a `<select>` opened downward from the bottom of the window, and "High" fell outside it.
- Asked what a map stage too wide for the panel should do, the owner answered: keep the sideways scroll there, "and also allow user to resize the panel".

## Decisions

1. **The header's title is one title with a list** (asked; chosen over titles that wrap onto more lines and titles that share one line). When the panel has more than one thing to show (the map counts as one), the title is a button with the shown thing's title on one line, cut with an ellipsis, and a chevron. A press opens a list under it: the execution map first, then the artifacts in the order of `kvcoder.artifact.list`, each on one line with its whole title as tooltip and a check on the shown one. Up and Down move, Enter picks, Escape and a press outside close. The list is never wider than the panel and scrolls down when it is long. With one thing to show, the title is plain text as before. The row of titles and its sideways scroll are removed.
2. **An update shows itself.** After the chat's first read, which still opens nothing:
   - an artifact whose id is new, or whose `version` or `updatedAt` changed, opens the panel on it, also when the person had closed the panel or was looking at another artifact or the map; when several changed in one read, the one with the latest `updatedAt`;
   - a map that appears, or whose `version` changed, opens the panel on the map in the same way;
   - when a map and an artifact both changed, the one with the later `updatedAt` is shown, whichever read answers first; with the same `updatedAt`, the artifact (my own choice for a case that needs the same millisecond).

   The Preview and Source switch keeps its place when the shown artifact is updated, as before.
3. **A map stage wider than the panel still scrolls sideways** (asked; the owner's own answer). The diagram is unchanged: steps from 104 to 172 px, fitted to the panel's width again whenever it changes.
4. **The person drags the panel's width.** The panel's edge beside the conversation is a handle (a `separator` with the label "Resize the panel").
   - Dragging it sets the panel's width; the Left and Right arrow keys move it 16 px toward the side they point to; a double-click returns to the starting width.
   - **Limits** (asked; chosen over the whole chat area and over 50%): from 20 rem to 70% of the chat area. The starting width stays 40% of the chat area, 32 rem at most.
   - **Where it is kept** (asked; chosen over nothing kept and over a kvman setting): in the browser's `localStorage` under `kvcoder.panelWidth`, a whole number of CSS pixels, as kvwebui keeps the collapsed navigation. It is the same in every chat. A stored value that isn't a whole number is not used, and one outside the limits is shown at the nearest limit.
   - Below 48 rem of chat width, where the panel lies over the conversation, there is no handle and the width is as before.
5. **The thinking level is kvcoder's own list** (asked with the picture). In the send box of a chat and of the Chat page's start, the thinking control is a button with the level's name and a chevron; a press opens the five levels above the box, as the model list opens, with a check on the chosen one and the same keys as decision 1. It replaces the `<select>` there. The thinking selects of a worker's form are on a settings page and stay.

## Verification

Scenarios QA50-H1 to H9 and QA50-E1 to E7, written before source.
