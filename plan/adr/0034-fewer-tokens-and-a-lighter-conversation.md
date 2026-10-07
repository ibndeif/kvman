# ADR 0034 — Fewer tokens in a chat, and a lighter conversation page

The product owner asked (2026-10-07): "you must fix all identified issues Also before start fixing, can you review kvcoder and give suggessions for optimizations specially in minimizing token usage and user experience?", and then chose every suggestion "but confirm that there is no any side effects".

The review read one real chat: 64 steps and 116 calls on `openai/gpt-6.1-sol`, with 234,269 input tokens paid in full, 4,173,952 read from the cache, and 275,574 characters of tool results. A step sends the whole history again, so what stays in it is paid for at every later step.

- Repeat reads of files the chat already held were 91,528 of those 275,574 characters: one file was read 6 times, since an edit's result (about 85 characters) doesn't show what it changed.
- Two review subagents cost 85,907 of the 234,269 input tokens, since each starts with nothing and reads the files again.
- Indentation was 4% of the JSON results, and a search repeated each match's path.
- A stored tool result held its output twice (491,812 of 974,754 stored characters), the second copy for the conversation.
- The conversation asked for its newest 200 messages again after every step: 773 KB each time.
- A person couldn't tell how full the model's window was, or whether a summary had happened.
- When the conversation's query failed, the page showed the error's text alone.

Decisions 1 to 9 were asked. What follows each is the side effect that was looked for.

## Decisions

1. **`fs edit` shows what it changed.** Its output gains `fromLine` and `content`: the file's lines from 3 before the first changed line to 3 after the last, at most 80 lines, as `fs read` gives them. *Side effect:* an edit's result is longer, by far less than the read it saves.
2. **`fs read` says when nothing changed.** When the chat's messages after its latest summary hold an `fs read` result with exactly the text this read would return, the call returns `<path> is unchanged since you read these lines earlier in this conversation; that result is above.` in its place. It is worked out from the stored messages, so a summary, a fork, and a subagent's own chat need no bookkeeping. *Side effect:* the model is pointed at the earlier result and not given the text again; a file that changed in any way is returned in full.
3. **A subagent is briefed with what the lead knows.** The lead's Delegate step gains: `A worker sees none of this conversation and reads again every file it needs, so delegate only what is worth that, and put the paths, the lines that matter, and what you already found in the brief.` *Side effect:* a chat that started before this change rewrites its cache once, as with any change of the system prompt (ADR 0032, 4).
4. **A connector command's JSON output isn't indented** (it was indented by 2 spaces, ADR 0011, 11). The call card indents a JSON output for the person, so a card looks as it did. *Side effect:* none for the model; an extension that calls `kvcoder.connector.call` gets the same JSON without the line breaks.
5. **`fs search` groups its matches by file**: `{ "files": [{ "path", "matches": [{ "line", "text" }] }], "truncated" }`. The limit of 200 matches stays; a tighter one would hide matches, so it wasn't made. *Side effect:* none beyond the shape, which only the model and the card read.
6. **The chat's title keeps the chat's own model.** Writing it with the cheapest model was dropped: a custom or local model costs 0 and would be chosen, a cheap model may write a poor title in the person's language, and another provider can fail where the chat's works.
7. **A tool result keeps its output once.** `details.output` is left out when it is exactly the text the model gets, which is every result but a shell line's and a binary's, whose text also has the exit code and notes. The conversation already shows the text when `details.output` is absent; it now removes a trailing `[exit code N]` only from a result with no `details`, which is an old shell result. *Side effect:* none; chats stored before this change read as before.
8. **The conversation fetches only what is new.** `kvcoder.message.list` takes `afterSeq?`: with it, only messages whose `seq` is greater are returned, still the newest `limit` that fit. The page loads the whole list once, then asks with the `seq` of its last stored message and adds what comes back; when the first one returned isn't the next `seq`, it loads the whole list again. Stored messages never change, so nothing is missed. *Side effect:* a chat left open holds more than 200 messages on the page until it is reloaded.
9. **The header says how full the context is**, as a line of text (chosen over a bar, and over a notice only near the limit): `Context {percent}% of {window} · summary at {at}%`, with its Arabic entry, under the chat's totals. It comes from the new public query `kvcoder.context.get { sessionId } → { tokens, window, compactAt }`: `tokens` is compaction's own count (ADR 0033, 4 and 5), `window` is the model's context window or `null` when the model isn't known, and `compactAt` is the setting in effect. With a `null` window the line isn't shown. *Side effect:* one more query after each step.
10. **A conversation that can't load says so and offers the export.** The page keeps the chat's header, shows `This chat couldn't be loaded: {error}` with a Try again button and the Export button, and no longer shows the error's text alone.
11. **The 10% minimum of a summary counts what is sent** (it counted the stored content, ADR 0019, 7, which was 2.76 times too much): the older messages' characters / 4 of what is sent of them (ADR 0033, 6).

The one cache miss that ADR 0032 couldn't explain stays unexplained: nothing stored says what a past request held.
