---
"@kvman/sdk": minor
---

`ext.registerPrompt(name, { description, data, answer, oneOpenPer? })` (M2.13, 05 §5.5, ADR 0167) with `PromptDef` and `PromptHandle`: it registers the prompt's collection, list query, `answer` and `reject` (people only) and `expire` commands, `asked` and `closed` events, and `<namespace>/BUSY`, and returns a handle whose `open(ctx, data)` stores the prompt and defers the command's reply.
