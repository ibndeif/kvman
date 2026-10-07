# QA 47 — The conversation after 0.3.1 (ADR 0035)

Asked: the text of a chat's page, "to identify issues and fix them".

## Happy path

- **QA47-H1 A running turn shows as it goes.** *Given* an open chat with one ended turn, *when* the person sends a message and the model's reply is held, *then* the message shows within 5 seconds; once the first step ends on a call and the second is held, that call's card shows while the turn still runs; and the answer shows when it comes. `extensions/kvcoder/test/e2e/mid-turn-messages.test.ts`
- **QA47-H2 A turn's totals come after its last call cards.** *Given* a stopped turn whose last step ran a call, *then* the turn's totals come after that call's card and before the notice. `extensions/kvcoder/test/web/turn-totals.test.ts`
- **QA47-H3 The attached-files line is in the page's language.** *Given* a person's message that ends with `Attached files:` and two files, *then* an Arabic page shows `الملفات المرفقة:` above the two lines, and an English page `Attached files:`. `extensions/kvcoder/test/web/turn-totals.test.ts`
- **QA47-H4 A refused edit says nothing was written.** *Then* every refusal of `applyEdits` ends with `Nothing was written.`, and the file is as it was. `extensions/kvcoder/test/unit/edit-text.test.ts`
- **QA47-H5 The header is one line.** *Given* a chat in a window 1280 px wide, *then* the header is at most 48 px high, and its title and its numbers start on the same row. `extensions/kvcoder/test/e2e/chat-header.test.ts`
- **QA47-H6 The header shows the time, the cost, and how full the memory is.** *Then* the header's numbers read `48 s · $0.02 · Memory 43% full`; the first's tooltip is `Turns: 1 · 1.5K tokens used`, and the memory's is `The model now holds 116.3K of its 272K tokens. Older messages are summarized at 80%.`; in Arabic the memory reads `الذاكرة ممتلئة 43%`; and a turn's line reads `12 s · $0.02` with `1.5K tokens used` as its tooltip. `extensions/kvcoder/test/web/context-line.test.ts` and `extensions/kvcoder/test/web/conversation-messages.test.ts`

## Edge cases

- **QA47-E1 A turn that ended on an answer keeps its totals under the answer.** *Then* the totals of a turn whose last message is an answer come right after it. `extensions/kvcoder/test/web/turn-totals.test.ts`
- **QA47-E2 Only the line at the end is replaced.** *Then* a message that says `Attached files:` in its own text, with no list after it at its end, is shown as it is. `extensions/kvcoder/test/web/turn-totals.test.ts`
- **QA47-E3 A narrow window wraps the numbers.** *Given* a window 420 px wide, *then* the numbers are under the title, and nothing in the header is wider than the conversation. `extensions/kvcoder/test/e2e/chat-header.test.ts`
