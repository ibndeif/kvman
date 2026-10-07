# ADR 0035 — The conversation after 0.3.1: totals, the attached-files line, and a refused edit

The product owner pasted the text of a chat's page (2026-10-07) and asked to "identify issues and fix them". The chat is the one ADR 0033 and ADR 0034 read; its database was read beside the page's text.

- A turn's totals stood above the cards of the turn's last calls: the turn that the person stopped showed its three edits, then `5 min · 36.7K tokens · $0.18`, then two more reads, then "You stopped this turn". The totals were put under the turn's last assistant message, and a step's cards are its tool results, which come after it.
- The person's own message, in an Arabic page, ended with the English line `Attached files:`. The line is stored for the model (ADR 0018, 4) and was shown as stored.
- After one of three edits failed, the model read the file twice "to check that the edit wasn't applied in part". The error named the edit and why, and didn't say that nothing was written.
- The page's text ended at the turn the person had stopped, though the header already counted a fifth turn, 40 seconds after its message was stored. This could not be reproduced: the list query answers the new messages (in about 20 ms on this chat), and a browser test of a message sent in an open chat shows it, and each step's cards, while the turn runs. That test is kept (QA47-H1).

Decisions 1 to 3 are the smallest fix of each, and the product owner may overrule any of them. Decisions 4 and 5 were asked.

## Decisions

1. **A turn's totals come after its last message**: its last answer, or the cards of its last calls when it ended on them. Before, they came under its last assistant message.
2. **The attached-files line is shown in the page's language.** What is stored and sent to the model stays `Attached files:` (ADR 0018, 4); the conversation shows `kvcoder.ui.attachedFiles` in its place, "Attached files:" in English.
3. **A refused edit says that nothing was written.** Each refusal of `fs edit` and `artifact edit` ends with `Nothing was written.`
4. **The chat's header is one line** (asked with mockups; chosen over two lines, and over the numbers behind a button). It was three lines and about 100 px high. The title and the numbers share a row, with 4 px above and below, which makes it 45 px high; the numbers wrap under the title only when the row is too narrow. The count of turns leaves the row and is in the totals' tooltip.
5. **The header shows the time, the cost, and how full the memory is; tokens are in tooltips** (asked with mockups, after a first wording, "373.8K tokens used" beside "Context 15%", was still "very confusing"; chosen over time and cost alone, and over both numbers with names). The product owner had read "373.8K tokens" beside "Context 20% of 272K" as a wrong total. Neither was wrong: the first is what every model call of the chat used, input and output, and the second is the size of the prompt now, which a summary had made smaller. Two token figures side by side read as one fact, so only one stays, as a share with a plain name.
   - The header's numbers are `{time} · {cost}`, then `Memory {percent}% full` ("الذاكرة ممتلئة {percent}%"), which isn't shown when the model's window isn't known.
   - The tooltip of the time and cost is `Turns: N · {tokens} tokens used`. The tooltip and accessible name of the memory is `The model now holds {tokens} of its {window} tokens. Older messages are summarized at {at}%.`
   - A turn's line under its last message is `{time} · {cost}` too, with `{tokens} tokens used` as its tooltip (asked; chosen over keeping its tokens).
   - This replaces the text of ADR 0034, 9 and the tokens in the totals of ADR 0009, 147.
6. **A long word never widens the message list.** The product owner asked "Why there is a horizontal scroll in the chat view". With the artifact panel open, the list was 739 px wide and its content 895 px: a message that pasted an error held a URL and file paths with no spaces, and text in the conversation broke only at spaces. Text in the message column now breaks inside a word when it has no other place to break (`overflow-wrap: anywhere`). A code block and a call's output keep their own sideways scroll.
7. **A finished background job's card says which one it was.** The product owner reported that a completed background job "doesn't show a name in chat", only "انتهت مهمة خلفية". The result is stored as a message that starts `The background call \`<call>\` (job <id>) finished:`, and the card's title was a fixed text. The title is now `Background job finished: {name}` ("انتهت المهمة الخلفية: {name}"), and for a subagent `A helper finished: {name}` ("أنهى الوكيل المساعد عمله: {name}"), with `<call>` as the name. A message with no such first line keeps the fixed title.

