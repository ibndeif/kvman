# QA 6 — an expert workflow, and the artifact connector that shows the plan (ADR 0009, 173–181)

The product owner asked for the main agent to work like an expert (understand from facts, resolve gaps and conflicts, plan, execute step by step, delegate to specialists) and for an `artifact` connector that shows the person documents such as the plan, in Markdown or HTML. Every scenario names its test. Backend tests run a real turn against the fake model in a test kernel; `test/web/` mounts components in happy-dom with a fake `kvman`; `test/e2e/` drives Chromium against a real kvman. The scenarios marked R need a real model and are run by the product owner.

## Happy path

- **QA6-H1 `artifact write` creates an artifact.** *Given* a chat with no artifacts, *when* the agent runs `artifact write` with a Markdown plan, *then* the result is `{ "id": "plan", "version": 1, "created": true, "bytes": <UTF-8 length> }` and `kvcoder.artifact.get` returns the same title, format `markdown`, and content. (`extensions/kvcoder/test/artifact-connector.test.ts`)
- **QA6-H2 `artifact write` replaces an artifact.** *Given* an existing artifact, *when* the agent writes the same id with a new title, format, and content, *then* version is 2, `created` is `false`, and all three are the new ones. (`extensions/kvcoder/test/artifact-connector.test.ts`)
- **QA6-H3 `artifact edit` changes only the named text.** *Given* a plan with three `☐` steps, *when* the agent edits one `☐` to `☑`, *then* the result is `{ "id", "version": 2, "replacements": 1, "firstChangedLine": <line> }`, the other lines are unchanged, and the title and format are kept. (`extensions/kvcoder/test/artifact-connector.test.ts`)
- **QA6-H4 `artifact get` reads an artifact.** *Then* it prints `{ "id", "title", "format", "version", "content" }`. (`extensions/kvcoder/test/artifact-connector.test.ts`)
- **QA6-H5 The format defaults to Markdown and HTML is accepted.** *Given* a write without `format`, *then* it is `markdown`; with `"format": "html"` it is `html`. (`extensions/kvcoder/test/artifact-connector.test.ts`)
- **QA6-H6 `-h` lists the commands.** *When* the agent runs `artifact -h`, *then* the text names `write`, `edit`, and `get`, the limits, the two formats, and that HTML runs in an isolated frame with no network; `runConnector` answers `artifact runs only inside a turn` for a real call. (`extensions/kvcoder/test/artifact-connector.test.ts`, `extensions/kvcoder/test/run-connector.test.ts`)
- **QA6-H7 The JSON may come on stdin.** *Given* a heredoc with a long HTML document, *then* the write works. (`extensions/kvcoder/test/artifact-connector.test.ts`)
- **QA6-H8 A subagent's artifact belongs to the chat at its root.** *Given* a child that writes the artifact `review`, *then* `kvcoder.artifact.list` of the parent chat holds it, and of the child's own session id answers with the parent's list. (`extensions/kvcoder/test/artifact-api.test.ts`)
- **QA6-H9 The public queries list and get.** *Then* `kvcoder.artifact.list` gives `[{ id, title, format, version, size, updatedAt }]`, newest change first, `size` the content's bytes, and an extension may call both. (`extensions/kvcoder/test/artifact-api.test.ts`)
- **QA6-H10 The tool result carries the card's details.** *Then* the stored toolResult of a successful write or edit has `details: { artifact: { id, title, format, version } }`, and its text is the printed JSON; a `get` has no such details. (`extensions/kvcoder/test/artifact-connector.test.ts`)
- **QA6-H11 Deleting the chat deletes its artifacts.** *Then* after `kvcoder.session.delete`, no artifact of the chat or of its subagent sessions remains in the store. (`extensions/kvcoder/test/artifact-api.test.ts`)
- **QA6-H12 Export includes artifacts; fork doesn't copy them.** *Then* the export file has an `artifacts` array with each artifact's fields, and the fork has none. (`extensions/kvcoder/test/artifact-api.test.ts`)
- **QA6-H13 Artifacts survive a restart.** (`extensions/kvcoder/test/artifact-api.test.ts`)
- **QA6-H14 A write or edit shows as a card.** *Given* a toolResult with `details.artifact`, *then* the conversation shows a card with the title, `Version N`, and an Open button, not the shell-result card and not the content. (`extensions/kvcoder/test/web/artifact-card.test.ts`)
- **QA6-H15 The panel opens for a new artifact and shows it.** *Given* a chat whose artifact list gains the id `plan`, *then* the panel is open beside the conversation, showing its title, `Version N`, and its Markdown rendered through the sanitized `markdown` view. (`extensions/kvcoder/test/web/artifact-panel.test.ts`)
- **QA6-H16 Clicking a card opens the panel on that artifact.** (`extensions/kvcoder/test/web/artifact-panel.test.ts`)
- **QA6-H17 With several artifacts the panel has a row of titles.** *Then* clicking a title switches the artifact shown. (`extensions/kvcoder/test/web/artifact-panel.test.ts`)
- **QA6-H18 The panel follows updates.** *Given* the panel open on `plan` at version 1, *when* the next read gives version 2 with new content, *then* it shows version 2 and the new content. (`extensions/kvcoder/test/web/artifact-panel.test.ts`)
- **QA6-H19 An HTML artifact is a sandboxed frame with the policy first.** *Then* its iframe has `sandbox="allow-scripts"` (and no other token), `referrerpolicy="no-referrer"`, and a `srcdoc` that is a wrapper (`<!doctype html>`, then the policy `<meta>` exactly as plan 08 §8.7 lists it) holding the artifact in an inner iframe with the same `sandbox` and `referrerpolicy`, whose `srcdoc` starts with the policy `<meta>` too. (`extensions/kvcoder/test/web/artifact-document.test.ts`, `extensions/kvcoder/test/web/artifact-panel.test.ts`)
- **QA6-H20 An HTML artifact runs its scripts and is walled in.** *Given* an artifact whose script edits its own page and then tries a `fetch` of `/api/health`, a read of `parent.document`, `document.cookie` and `localStorage`, a form submit, an external image, a script from another origin, `window.open`, and `top.location`, *then* in Chromium the first shows in the page, and every attempt after it fails. (`extensions/kvcoder/test/e2e/artifact-isolation.test.ts`)
- **QA6-H21 The panel sits beside the conversation on a wide window and over it on a narrow one.** (A 1400 px window with the nav open: beside, the conversation at least 480 px; a 900 px window: over it; ADR 0009, 184.) (`extensions/kvcoder/test/e2e/artifact-panel.test.ts`)
- **QA6-H22 The base prompt gives the expert workflow.** *Then* it contains each step: scale to the task, understand from facts and never assume or invent, resolve gaps and conflicts with `ask` (all questions in one reply, the recommended option first), plan as the artifact `plan` with `☐` and `☑`, `ask confirm` for a large, ambiguous, or risky task, execute step by step with `artifact edit`, delegate with a role brief, and "do that task and return the result" for a subagent. (`extensions/kvcoder/test/unit/prompt-build.test.ts`, `extensions/kvcoder/test/prompt.test.ts`)
- **QA6-H23 The index says what `artifact` is for.** *Then* its entry is the sentence of ADR 0009, 181, with its commands and the `-h` hint. (`extensions/kvcoder/test/prompt.test.ts`)
- **QA6-H25 The header button opens and closes the panel.** *Given* a chat with artifacts, *then* the header shows `Artifacts (N)`; pressing it opens the panel, pressing it again closes it; with no artifact there is no button. (`extensions/kvcoder/test/web/artifact-panel.test.ts`)
- **QA6-H24 Every new text is translated.** *Then* `en` and `ar` hold the same keys, with the same placeholders, for the card, the panel, the formats, the frame's label, and the two new query descriptions. (`extensions/kvcoder/test/locales.test.ts`)

## Edge cases

- **QA6-E1 A bad id fails.** *Given* `Plan`, `my_plan`, an empty id, or 51 characters, *then* `VALIDATION_FAILED` and nothing is stored. (`extensions/kvcoder/test/artifact-connector.test.ts`)
- **QA6-E2 A bad title, format, or shape fails.** *Given* an empty title, a title of 101 characters, `"format": "pdf"`, a missing or empty `content`, or an unknown key, *then* `VALIDATION_FAILED` and exit code 1. (`extensions/kvcoder/test/artifact-connector.test.ts`)
- **QA6-E3 Content over 64 KB fails `TOO_LARGE`.** *Given* 65 537 bytes, the size rule fails `TOO_LARGE` with `params.limit` 65536 and counts bytes, not characters; exactly 65 536 bytes passes. A model call can't carry that much (ADR 0009, 183), so this is tested as a function. (`extensions/kvcoder/test/unit/artifact-size.test.ts`)
- **QA6-E4 The 21st artifact fails; replacing one of 20 works.** (`extensions/kvcoder/test/artifact-connector.test.ts`)
- **QA6-E5 An unknown id fails `NOT_FOUND`.** *Given* `edit` or `get` of an id the chat doesn't have, *then* `error NOT_FOUND`; another chat's id is unknown too. (`extensions/kvcoder/test/artifact-connector.test.ts`)
- **QA6-E6 A failed edit changes nothing.** *Given* an `oldText` not found, found twice, empty, overlapping another, or an edit that changes nothing, *then* `VALIDATION_FAILED` naming the edit, and the version and content are unchanged. (`extensions/kvcoder/test/artifact-connector.test.ts`)
- **QA6-E7 An edit that would pass 64 KB fails.** *Given* a 40 KB artifact and an edit that grows it to about 70 KB, *then* `TOO_LARGE`, and the artifact is unchanged. (`extensions/kvcoder/test/artifact-connector.test.ts`)
- **QA6-E8 Two edits of one artifact in one reply both land, in order.** (`extensions/kvcoder/test/artifact-connector.test.ts`)
- **QA6-E9 A write and a get in one reply run in the model's order.** *Then* the get sees the write. (`extensions/kvcoder/test/artifact-connector.test.ts`)
- **QA6-E10 A subagent without `artifact` can't use it.** *Given* a child started with `connectors: ["jobs"]`, *then* its call returns `artifact isn't available in this subagent`, and its prompt has no `artifact` line. (`extensions/kvcoder/test/subagent-rules.test.ts`)
- **QA6-E11 `artifact` never asks.** *Given* `kvcoder.shell.approval` is `ask`, *then* a write runs at once. (`extensions/kvcoder/test/artifact-connector.test.ts`)
- **QA6-E12 An unknown session or id in the queries fails.** *Then* `kvcoder/SESSION_NOT_FOUND`, and `NOT_FOUND` for an unknown id; there is no public command that writes an artifact. (`extensions/kvcoder/test/artifact-api.test.ts`)
- **QA6-E13 A closed panel stays closed on an update.** *Given* the person closed the panel, *when* the artifact shown gets version 2, *then* it stays closed; a card click or a new id opens it again. (`extensions/kvcoder/test/web/artifact-panel.test.ts`)
- **QA6-E24 An artifact already there when the chat is opened doesn't open the panel.** *Then* the panel stays closed, the card and the header button open it, and an id that appears later opens it by itself. (`extensions/kvcoder/test/web/artifact-panel.test.ts`)
- **QA6-E14 A chat with no artifact has no panel.** (`extensions/kvcoder/test/web/artifact-panel.test.ts`)
- **QA6-E15 The policy goes after a leading doctype.** *Given* content starting with `<!DOCTYPE html>` (any case, with leading whitespace), *then* the document is the doctype, the policy `<meta>`, then the rest; with no doctype, the policy is first. (`extensions/kvcoder/test/web/artifact-document.test.ts`)
- **QA6-E16 The content's own markup can't loosen the wall.** *Given* content with its own `<meta http-equiv="Content-Security-Policy">` that allows everything, a `<base href>`, and `<script src="https://…">`, *then* in Chromium the external script doesn't load, the base is ignored, and `fetch` still fails. (`extensions/kvcoder/test/e2e/artifact-isolation.test.ts`)
- **QA6-E17 A nested frame can't load kvman.** *Given* content with `<iframe src="/api/health">` or `<iframe src="/">`, *then* nothing loads in it. (`extensions/kvcoder/test/e2e/artifact-isolation.test.ts`)
- **QA6-E18 A link in an HTML artifact does nothing outside the frame.** *Given* `<a href="https://example.com" target="_blank">` and a click, *then* no page or popup opens, and the app page doesn't navigate. (`extensions/kvcoder/test/e2e/artifact-isolation.test.ts`)
- **QA6-E26 The artifact reaches its frame whole.** *Given* content with quotes, ampersands, and `"><script>` meant to close the wrapper's `srcdoc` attribute, *then* the inner frame's document is exactly the policy plus that content. (`extensions/kvcoder/test/web/artifact-document.test.ts`)
- **QA6-E27 A script that navigates its own frame is stopped.** *Given* content whose script sets `location.href` to another server, *then* the frame never loads it (the browser shows its own error page) and the other server sees no request. (`extensions/kvcoder/test/e2e/artifact-isolation.test.ts`)
- **QA6-E19 A Markdown artifact can't run script.** *Given* Markdown with `<script>`, `<img onerror>`, and `javascript:` links, *then* none runs, and the text is shown as the sanitized renderer shows it. (`extensions/kvcoder/test/web/artifact-panel.test.ts`)
- **QA6-E20 Nothing outside the frame is asked of kvman.** *Given* an HTML artifact open, *then* the only requests are the app's own, and none comes from the frame to `/api`. (`extensions/kvcoder/test/e2e/artifact-isolation.test.ts`)
- **QA6-E21 A subagent's prompt has the same workflow.** *Then* a child's prompt holds the workflow, including "do that task and return the result", and its connector index lists only its connectors. (`extensions/kvcoder/test/subagent-rules.test.ts`)
- **QA6-E22 The words earlier tests pin are unchanged.** *Then* the OS and language lines, `Your one tool is …`, `Connectors come first.`, the `ask` sentence, and the index lead line are as in QA 4 and QA 5. (`extensions/kvcoder/test/prompt.test.ts`, `extensions/kvcoder/test/unit/prompt-build.test.ts`)
- **QA6-E23 The 64 KB cap on sections still counts only sections.** (`extensions/kvcoder/test/unit/prompt-build.test.ts`)

## Real model

Run by the product owner in the running app, with a model they choose, each scenario three times in a fresh chat. A scenario passes when every run does what *Then* says.

- **QA6-R1 A large task gets questions, a plan, and a confirmation.** *Given* "build a notes app with login", *then* the agent first looks at the workspace, asks its questions in one reply with a recommended option first, writes the artifact `plan` as a checklist, and calls `ask confirm` before executing.
- **QA6-R2 A small task gets none of that.** *Given* "rename `foo` to `bar` in `a.ts`", *then* the agent does it, with no questions and no plan.
- **QA6-R3 A conflict is raised, not resolved silently.** *Given* a request that contradicts the code (for example "use the `title` field" when the model has `name`), *then* the agent says so and asks.
- **QA6-R4 A missing fact is looked up, not invented.** *Given* a task that needs a file's contents, *then* the agent reads it first, and invents no path, API, or name.
- **QA6-R5 The plan is ticked as work proceeds.** *Then* the agent edits `plan` with `artifact edit` after each step, and the panel shows it.
- **QA6-R6 A review goes to a subagent with a brief.** *Given* a finished change, *then* the agent runs a reviewer with its role, the goal, the facts, its limits, and what to return.
- **QA6-R7 A UI mockup is an HTML artifact.** *Given* "show me a login screen design", *then* the agent writes an `html` artifact, self-contained, with no external resources.
- **QA6-R8 A subagent given a task does that task.** *Then* a child neither re-plans nor asks the person unless blocked.

| Scenario | Model | Date | Runs passing | Notes |
|---|---|---|---|---|
| QA6-R1 | | | | |
| QA6-R2 | | | | |
| QA6-R3 | | | | |
| QA6-R4 | | | | |
| QA6-R5 | | | | |
| QA6-R6 | | | | |
| QA6-R7 | | | | |
| QA6-R8 | | | | |
