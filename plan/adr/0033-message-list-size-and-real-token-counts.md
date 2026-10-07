# ADR 0033 — A message list that always fits, and compaction by the model's own token count

The product owner reported (2026-10-07): "I think that there is an issue with auto compactation where it is not initiated as I got 'تجاوز الحد المسموح به: 1048576.' … Also I keep getting the message even when i refresh the page. I think also that you need to reveiew my real conversation to verify that the tokens count is correct".

The chat was read through the running kvman's queries: 193 messages on `openai/gpt-6.1-sol`, whose window is 272,000 tokens.

- **The error wasn't compaction.** The conversation asks `kvcoder.message.list` for the newest 200 messages. A query's output is at most 1 MiB of JSON by default (plan 02 §2.13), and this chat's newest 200 are more, so the query failed `TOO_LARGE` with `limit: 1048576` on every load; with `limit: 150` it answered.
- **Compaction did run, but early.** The size was estimated from the stored content's characters / 4. That was 2.76 times the prompt the provider counted (320,615 against 116,285 tokens at the last call before the summary), so the chat was summarized at 43% of the window with `kvcoder.compactAt` at 0.8. Half of a stored tool result is `details`, the copy of the output the conversation shows, which the model is never sent; reasoning signatures and stored metadata are counted too.
- **The token counts are right.** Each turn's usage equals the sum of its model calls, and the turn with two subagents has theirs added, as plan 08 §8.1 says; the chat's totals equal the sum of its turns.

Decisions 1 and 2 were asked with alternatives. Decisions 3 to 6 are the smallest way to carry them out; the product owner may overrule any of them.

## Decisions

1. **`kvcoder.message.list` never fails for its size** (chosen over only raising the limit, and over loading the conversation in pages). Its output limit is 32 MiB, the most a registration may set, and it returns the newest messages that fit in it: fewer than `limit` when they don't, with the others counted in `omitted`.
2. **Compaction measures the prompt by the provider's own count** (chosen over characters / 4 of what is sent, and over leaving it). Cached tokens are part of the prompt, so they count.
3. **What fits.** Messages are taken from the newest back while the whole output, with the queued messages and `omitted`, stays within 32 MiB of JSON, measured as the kernel measures it (UTF-8 bytes). The newest message is always returned. The conversation's "N earlier messages" and its export already cover the ones left out.
4. **The count.** The prompt's size is taken from the chat's last model call that reported one: its `input + cacheRead + cacheWrite`, which is the whole prompt of that call, plus its `output`, plus characters / 4 of what is sent of each message added after it. A call made before the latest summary doesn't count, since its prompt held the messages the summary replaced; neither does a call whose provider reported no prompt tokens.
5. **Without such a call**, the size is characters / 4 of what is sent: the system prompt, the summary's text, and each message.
6. **What is sent of a message**, for this count: a `user` message's and a tool result's text; an assistant message's text, its thinking, and each call's name and arguments as JSON. A tool result's `details`, signatures, and the stored metadata aren't sent and aren't counted. The 10% minimum of a summary (ADR 0019, 7) stays as it is, on the stored content.
