# ADR 0037 — A helper's title, a softer light theme, and output blocks that follow the theme

Status: accepted, 2026-10-07. It changes plan 06 §6.4, plan 08 §8.5 and §8.7, ADR 0021, 2 and 29, ADR 0009, 196, and ADR 0036, 2 where they differ.

After using the cards of ADR 0036, the product owner asked three things: "for shell output, show the first 12 line and some dots then latest 5 lines" (recorded as ADR 0036, 7); "give a subagent a title like 'ui expert, nodejs expert, etc..'"; and "enhance the colors of light mode as they are not comfort for user eyes and looks ugly". Decisions 1 to 4 were asked, the palette with pictures of the real chat page in today's colors and three candidates.

## Decisions

1. **The lead names each run** (asked; chosen over a title in each worker's definition, and over both). `delegate run { worker, title, task, background? }`: `title` is required, 1 to 60 characters, "the role this run plays, in a few words, such as UI expert or Node.js expert". It fits any task, the `general` worker's included, where a worker's own title would name two different runs alike. A call without it fails `VALIDATION_FAILED` like any other invalid payload.
2. **Where the title shows.**
   - A subagent's child session has the run's `title` as its title. Before, it was the first 60 characters of the task.
   - The subagent's card shows the title, the worker's name as a chip, the status, and under the title the first line of its task, from the call that started it.
   - `kvcoder.job.list` and `kvcoder.job.get` give a background subagent's `title` as that title; its `call` stays the call's description.
   - The card of a helper that finished reads `A helper finished: {title}` while its run is among the chat's newest 50 (ADR 0036, 14), and the call's description otherwise, as before.
   - The closed line of a `delegate run` call is `Delegate {worker} · {title}`.
   - A program worker's run keeps its worker's name as its title: it is a program, not a helper with a role. Its approval and its call card show the title in the closed line like any `delegate run`.
   - A run stored before this ADR keeps the title it has.
3. **The light theme is soft slate** (asked with pictures; chosen over a cool gray with white panels and a blue accent, and over today's warm colors softened). Nothing on a light page is pure white or pure black. kvwebui's light colors become: ground `#e9edf2`, surface `#f7f8fa`, sunken `#eff2f5`, text `#242a31`, muted `#5a6470`, line `#d3d9e0`, soft line `#e1e6ec`, primary `#35507a`, accent soft `#dbe5f2`, accent ink `#24385a`, neutral soft `#e1e6ec`, neutral ink `#454c56`, toast `#242a31` with `#f7f8fa` text. The status colors (success, warning, danger) and the whole dark theme are as they were.
4. **A command and its output follow the theme** (asked; chosen over a softer dark block in the light theme, and over keeping the black block). The blocks of a call card, of a background result, and of a job's logs take their colors from the theme: the surface color with the text color, and the border color between them; a job's logs, which sit on the surface, take the background color. So they are light in the light theme and dark in the dark one. Before, they were near-black in both (ADR 0009, 196).
