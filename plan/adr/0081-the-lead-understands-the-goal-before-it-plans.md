# ADR 0081 — the lead understands the goal before it plans

Status: accepted by the product owner on 2026-10-15, before source. It amends plan 08 §8.2, ADR 0072, 3, and ADR 0075, 4 and 5.

## Context

The owner asked for the lead's prompt to be reviewed so the lead understands what the person needs and intends: what they are really after, how the request affects what exists, the best practical way to do it, what is unclear, which decisions are theirs, what is missing, whether both sides are on the same page, how to break a complex goal down, and which connectors help.

The prompt's Understand part was three sentences, while its Plan part was about 560 words on drawing the map. Real chats on 2026-10-13 and 14 showed the gaps. A person had to bring up file size, model settings, and an accuracy bar one by one, and each forced a new map. Another sent "the export must be a zip" during execution. The lead asked about an AI provider's privacy when an existing extension already settled it ("you should depend on existing kvcoder extension"). It planned a CSV backup until the person asked whether there was a better way. It built a file name pattern the person had spelled out, wrongly, and the person had to say so. It asked questions in three rounds before planning. One person asked "run it so I can try it" five times in one chat, because Finish stopped the app.

## Decisions

1. **Understand finds the goal first.** Before deciding anything, and as far as the task needs, the lead reads everything the person sent, attached images and files too, then looks at what exists, including what already does part of the request, so it builds on it and not beside it.
2. **Understand answers fixed questions.** They are: the outcome the person wants and what they will do with it; what done looks like to them, as examples they would check; what the work changes or must keep working (other callers, stored data, settings, users); whether they asked for a goal or for a particular means, and whether that means serves the goal; what they didn't say that changes the result (who uses it, how much data or load, platforms and languages, privacy and security, how good is good enough); and which connectors and workers help, and what is missing. The method doesn't name MCP servers: the `mcp` connector's entry lists them, and a chat with no server reads nothing about MCP (ADR 0020, QA29-E1).
3. **Clarify sorts what is open into three kinds.** The lead looks up a fact that looking would answer. It decides an ordinary detail that is easy to change, and says what it chose. It asks before any work about a decision only the person can make, or a gap that changes the result, the design, or stored data. When the means the person asked for works against their goal, or a clearly better way exists, the lead says so and offers both before it builds theirs.
4. **Questions come in one round when they can.** They come after looking and before planning, one question per `ask` call, all in one reply. With `ask choice`, the recommended option comes first and each option says what it leads to.
5. **The plan's confirmation says back what was understood** (amends ADR 0072, 3). The `ask choice` that confirms the map first says in a few lines the goal, what done looks like, what stays as it is, and the choices the lead made for the person. Then it asks whether to start. The map's `goal` is the outcome the person wants, in their own terms. It stays one sentence of at most 300 characters, so the data shape is unchanged, and "what done looks like" goes in the question, not in `goal`.
6. **Guides and documentation are read through a connector.** The method no longer names `docs get`, which most chats don't have (the `docs` connector is kvbuilder's and opt-in). It says to read a guide, or a library's or service's current documentation, through a connector that reaches it rather than from memory.
7. **What the person will try stays running** (asked; chosen over stopping it and offering to run it, and over keeping the rule). Finish still stops background work that is no longer needed. It leaves running the app or page the person will try themselves, with its address in a `url` artifact when it has one. The final answer already says what still runs.
8. **Repeated sentences are cut.** These are removed from the lead's method because another sentence of the prompt says the same: "A worker starts with none of this conversation, so give it a step only when …, and never a small change." The Plan part now says the lead takes "an ordinary or small change", and Delegate still says not to delegate what a few calls would do. "so delegate only what is worth that" in Delegate is cut. "Write each file in its own call" is cut from Execute, since the shared rule on one reply and the `fs` entry say it. The worker's method keeps its own sentence. No decision of ADR 0075 changes.

## Limits

This is a prompt rule: kvman checks none of it. The lead's method grows from about 2,280 to 2,550 words (decision 8 removes about 45).

## Verification

`extensions/kvcoder/test/unit/prompt-method.test.ts`:

- M2.4-E307: the Understand part (decisions 1, 2, and 6).
- M2.4-E308: Clarify (decisions 3 and 4).
- M2.4-E309: the confirmation and the goal (decision 5).
- M2.4-E310: Finish (decision 7).
- M2.4-E311: the cut sentences, and the worker's method unchanged (decision 8).

The tests pinning the old sentences were updated: QA33-H3, M2.4-E227, E256, E280, the base-prompt test in `prompt-build.test.ts`, `prompt.test.ts`, and `read-unchanged.test.ts`.
