# QA 76 — a helper is told who it is: its run's title (ADR 0116)

**Asked.** The owner said "make sure that kvcoder always gives the subagents an identity on delegate so the subagent be
focused", and chose: the run's `title` is the identity, on the first line of the helper's system prompt, with a
specialist's own instructions kept after it. The answer is ADR 0116.

Paths are relative to `extensions/kvcoder/`.

## Happy path

- **QA76-H1 the helper's first line is its title.** *Given* a `delegate run` to `general` titled "Node.js streams
  expert", *when* the helper's prompt is read (`kvcoder.prompt.get`), *then* it starts with "You are the Node.js
  streams expert, doing one task that the lead agent gave you, in the folder", and has no "You are kvman Coder".
  `test/delegate-identity.test.ts`
- **QA76-H2 the whole title, not the shown name.** *Given* a title of 80 characters, *then* the child session's title
  is its first 59 characters and `…`, its run's `role` is the whole title, and the helper's first line holds the whole
  title. `test/delegate-identity.test.ts`
- **QA76-H3 a specialist keeps its own instructions after it.** *Given* a run to `ui-ux` titled "Vue accessibility
  expert", *then* the prompt starts with "You are the Vue accessibility expert, doing one task" and still has
  "## Worker: ui-ux" with "You are a senior UI/UX designer." after it. `test/delegate-identity.test.ts`
- **QA76-H4 a product's identity, narrowed.** *Given* a profile `identity` "You are Builder, who makes apps for
  people.", *then* a helper's line is "You are Builder, who makes apps for people. Here you are the UI expert, doing one
  task that the lead agent gave you, in the folder …". `test/unit/identity-line.test.ts`
- **QA76-H5 the lead names the expert.** *Then* `delegate run`'s `title` description starts "Who the helper is: the
  expert this run needs", and the lead's Delegate rule says "Name in title the expert the run needs, such as Node.js
  streams expert, not the task: the worker is told it is that expert, which keeps it focused.", with the lead's method
  under 13,900 characters, the bound QA73-H5 now checks (ADR 0116, 5). `test/unit/identity-line.test.ts`

## Edge cases

- **QA76-E1 a helper from before ADR 0116.** *Given* a helper session whose run has no `role`, or no run, *then* its
  first line is the old "You are kvman Coder, working on one task that the lead agent gave you, …" (or, with a
  profile's identity, "<identity> You are doing one task that the lead agent gave you, …"), and its stored run still
  parses. `test/unit/identity-line.test.ts`
- **QA76-E2 the lead's line is unchanged.** *Then* a session with no parent starts "You are kvman Coder, the lead
  engineer on this work", whatever its own title. `test/unit/identity-line.test.ts`
