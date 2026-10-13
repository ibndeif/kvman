# ADR 0066 — a summary that carries what the next run needs, and summarizing at 60%

Status: accepted by the product owner on 2026-10-12, before source. It amends ADR 0060, 1 (the instruction), ADR 0032, 2, and the default of `kvcoder.compactAt`.

## Context

A summary was asked for in one general sentence, and nothing but the model's words survived it. In the owner's chats the agent read the `plan` artifact and 4 to 14 files again right after every summary, and a standing instruction the person gave early could be lost. A step's prompt averaged 100 to 120 thousand tokens because summarizing began at 80% of the model's window.

## Decisions

1. **The instruction names what the next run needs.** It asks for the summary under these headings, leaving out one that has nothing: **Request** (what the person asked for and every standing instruction), **State now** (what exists and works, what was verified and how), **Next step**, **Decisions** (each with its reason), **Files** (each path that matters: what is in it and what changed, with the names and lines the next steps need), **Commands that work** (the exact lines to build, test, and run), **What failed** (what was tried and why), and **Waiting on**. The 1,500 words, the folding of an earlier summary, and the last three sentences of ADR 0060, 1 stay. It also says that kvman adds the lists of decision 2 itself, so the model doesn't write them.
2. **kvman adds what it knows for certain**, as `facts`, a text stored in the summary message beside the model's `text` and sent after it:
   - **the person's own messages**, oldest first, each with its time and cut at 1,000 characters: those of the earlier summary and those now summarized, the newest 6,000 characters of them, with a count of the ones left out;
   - **the execution map** (ADR 0064): its goal, progress, the steps doing, ready, waiting, and failed, and the findings noted for later;
   - **the files this chat changed most recently**, from its kept copies (ADR 0053), relative to the workspace folder;
   - **the background runs still running**, each with its id and its call;
   - **the artifacts**, each with its id and title.
   A list with nothing in it is left out, and so is `facts` when every list is.
3. **It is written once.** `facts` is what was true when the summary was stored and never changes after, so the provider's cache of everything after it holds (the owner's rule on ADR 0060, 1). What changes later reaches the model at the end of the context: an `execution-map` result, a background result.
4. **Stored shape.** A summary message's `content` is `{ text, coversThroughSeq, facts?, person? }`: `person` is `[{ at, text }]`, the messages decision 2 listed, kept so the next summary carries them on. A summary stored before this has neither and is sent as before.
5. **`kvcoder.compactAt` is 0.6 by default** (asked; chosen over keeping 0.8, and over 0.5). A workspace that set its own value keeps it.

## Limits

The 6,000 characters are a cut: a long chat's oldest messages from the person leave the list, and only the model's Request heading still holds them. The kept copies name at most the chat's last 20 changes.

## Verification

Scenarios M2.4-E234 to E237, written before source.
