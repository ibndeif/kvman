# QA 45 — A message list that always fits, and compaction by the model's own token count (ADR 0033)

Reported: "I got 'تجاوز الحد المسموح به: 1048576.' … I keep getting the message even when i refresh the page … verify that the tokens count is correct".

The tests use the fake model, whose replies can report a usage. Its models have a window of 128,000 tokens, so the default `kvcoder.compactAt` of 0.8 is 102,400 tokens.

## Happy path

- **QA45-H1 A chat of more than 1 MiB opens.** *Given* a chat whose messages are more than 1 MiB of JSON together, *when* `kvcoder.message.list` is asked for the newest 200, *then* it answers with all of them and `omitted: 0`. `extensions/kvcoder/test/message-list-size.test.ts`
- **QA45-H2 Compaction follows the provider's count, cached tokens included.** *Given* a chat whose messages are under `kvcoder.compactAt` by their characters, and whose last model call reported `input: 60000`, `cacheRead: 45000`, and `output: 10`, *when* the next message is sent, *then* the older messages are summarized before the step. `extensions/kvcoder/test/compaction-count.test.ts`
- **QA45-H3 A chat the provider counts as small isn't summarized.** *Given* `kvcoder.compactAt` at 0.3 (38,400 tokens), a chat whose stored characters / 4 are more than that, and a last model call that reported `input: 1000` and `cacheRead: 20000`, *when* the next message is sent, *then* no summary is asked for and the step runs. `extensions/kvcoder/test/compaction-count.test.ts`

## Edge cases

- **QA45-E1 The newest messages that fit.** *Then*, of messages of 400 bytes each and room for three, the newest three are kept; a queued message's size takes from the room; and with room for none, the newest one is still kept. `extensions/kvcoder/test/fitting-messages.test.ts`
- **QA45-E2 A call from before the summary doesn't count.** *Given* the chat of QA45-H2 after its summary, *when* another message is sent, *then* no second summary is asked for, though the kept messages still hold the call that reported 105,010 tokens. `extensions/kvcoder/test/compaction-count.test.ts`
- **QA45-E3 What is sent of a message.** *Then* a tool result counts its text and not its `details`; an assistant message counts its text, its thinking, and each call's name and arguments, and not its signatures; a `user` message counts its text. `extensions/kvcoder/test/sent-size.test.ts`
- **QA45-E4 A provider that reports no tokens.** *Given* a chat whose model calls reported no usage and whose messages pass `kvcoder.compactAt` by characters / 4 of what is sent, *when* the next message is sent, *then* the older messages are summarized. `extensions/kvcoder/test/compaction-count.test.ts`
