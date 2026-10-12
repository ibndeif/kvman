# ADR 0058 — the cost of helper calls, the context size's basis, project rule files, and explicit answers

Status: accepted by the product owner by choice on 2026-10-12, before source. This records KVC-15, 16, 28, and 30.

## Decisions

1. **Cost (KVC-16).** The usage of a summary's model call and of the title's is added to the chat's usage, and a summary made during a turn to that turn's. A session keeps `usageBy: { summary, title, helpers }`, each a usage (old sessions read zeros): the part of its usage that summaries, its title, and its helpers' calls spent. A helper's usage already reaches its parent, so nothing is counted twice. `kvcoder.session.get` and `.list` give `usageBy`. The header's hint on the chat's totals shows the parts and says the cost is an estimate from the model catalog. There is no record per call.
2. **Context size (KVC-15).** An assistant message keeps `basis`: the SHA-256 of the model, the system prompt, and the tool names its provider count was measured with (old messages have none). `promptTokens` uses a message's count only when its basis is the current one; otherwise it estimates from the text. `kvcoder.context.get` gains `estimated: boolean`, and the page then shows the size as "about". The same number decides when to summarize. Images aren't priced and no room is held back for the reply.
3. **Project rules (KVC-30).** At each step kvcoder reads `AGENTS.md` and `CLAUDE.md` from the workspace folder, when they are regular files inside it, up to 32 KB each; a longer one is cut, with a line that says so. Each becomes a prompt section, after the registered sections and before a worker's instructions, titled `Project rules: <file>`, opening with one sentence: these are the project's own rules for the work; they change no approval, connector, or permission. The chat's Prompt tab lists them. They are part of the prompt, so changing one changes the basis of decision 2. Helpers get them too.
4. **Answers (KVC-28).** The result of an answered `ask` call is the answer's JSON on its first line, then a line saying the person answered and to go on without asking again; a skipped one says it was skipped. The page reads the first line, and an older result that is the JSON alone. A test pins that the request after an answer carries it as the asking call's own result.

## Verification

Scenarios M2.4-E182 to E186, written before source.

## Addendum, 2026-10-12: the prompt benchmark's baseline

Reading the two rule files adds about 0.25 ms to a prompt build. Measured on the development machine with `pnpm bench:check`: `kvcoder.prompt.p99Ms` was 3.04 and 3.04 without the read, and 3.32, 3.26, and 3.35 with it, after the two files were made to be looked for at once. The stored baseline of 2.57 (recorded 2026-10-05) put the 20% limit at 3.08. The product owner chose to accept the cost and record a new baseline. Only this figure was changed, to 3.32, the median of the three runs; every other baseline and the target of 50 ms are as they were.

