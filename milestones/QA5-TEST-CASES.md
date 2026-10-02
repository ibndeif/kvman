# QA 5 — connectors first, and a working method (ADR 0009, 166–171)

The product owner asked for a prompt that prioritizes connectors and makes the model prefer them, and for the prompt to be better in general. The fast tests below prove what the model is told; the real-model scenarios (R) prove what it does. Tests of the pure parts are in `extensions/kvcoder/test/unit/`; the rest read the prompt a real session sends to the fake model.

## Happy path

- **QA5-H1 The base prompt says connectors come first.** *Given* any session, *then* the system prompt says that when a connector covers a task the model uses it instead of doing the same through the shell, that the shell is for what no connector does, that `<connector> -h` shows what one does, and that `--async` runs it in the background. (`extensions/kvcoder/test/unit/prompt-build.test.ts`, `extensions/kvcoder/test/prompt.test.ts`)
- **QA5-H2 The base prompt has the working method.** *Then* it tells the model to look before changing and make the smallest change, to check its work with the project's own check or tests before saying it is done, that the calls of one reply run at the same time so dependent calls go in separate replies, to call `ask` (and never end a reply by promising something still to come), and to keep replies short. (`extensions/kvcoder/test/unit/prompt-build.test.ts`)
- **QA5-H3 The connector index starts with a lead line.** *Then* `## Connectors` is followed by `Use these before the shell, whenever one covers the task.` and then the entries. (`extensions/kvcoder/test/unit/prompt-build.test.ts`, `extensions/kvcoder/test/prompt.test.ts`)
- **QA5-H4 The shell tool repeats the rule and explains connectors.** *Then* the tool's description, for `bash` and for `powershell`, says what a connector is, that it is typed alone on its line, shows one example call, says `<connector> -h` lists a connector's commands, and says to use a connector instead of the shell whenever one covers the task; the `command` argument is described as a shell command or a connector call. (`extensions/kvcoder/test/unit/shell-tool.test.ts`)
- **QA5-H9 The description's example is a valid connector call.** *Then* the example in the tool's description parses with kvcoder's line parser as a standalone `fs` call with the command `write`, and its JSON is an object with `path` and `content`, so the example can't drift from what kvcoder accepts. (`extensions/kvcoder/test/unit/shell-tool.test.ts`)
- **QA5-H5 `fs` is for every file.** *Then* its index entry says to use it for every file the model creates or changes, and still names `write`, `edit`, and the `-h` hint. (`extensions/kvcoder/test/prompt.test.ts`)
- **QA5-H6 The experience line is gone.** *Then* the base prompt has no "20 years" line. (`extensions/kvcoder/test/unit/prompt-build.test.ts`)
- **QA5-H7 kvdev's connectors say when to use them.** *Then* `kvcoder.connector.list` gives `ext` a description that says to run `check`, then `test`, after changing an extension; `preset` one that says to check a preset before running it; `preview` one that says to stop it when done; and `docs` one that says to read it before writing an extension, preset, view, or component. (`extensions/kvdev/test/registration.test.ts`)
- **QA5-H8 kvdev's guide sends file edits to `fs`.** *Then* the `guide` section says to use the `ext`, `preset`, `preview`, and `docs` connectors for everything they cover, and to edit a project's files with `fs`, and no longer says "with the shell". (`extensions/kvdev/test/registration.test.ts`)

## Edge cases

- **QA5-E1 PowerShell gets the same rule.** *Given* the Windows platform, *then* the prompt has the connectors-first paragraph and the working method, and names PowerShell and the here-string. (`extensions/kvcoder/test/unit/prompt-build.test.ts`)
- **QA5-E2 No connectors, no lead line.** *Given* a prompt built with no connectors, *then* it has no `## Connectors` heading and no lead line. (`extensions/kvcoder/test/unit/prompt-build.test.ts`)
- **QA5-E3 The words ADR 163 fixed are unchanged.** *Then* `in the folder <path> on <OS>.` is followed by `Reply in <language> (code) unless the person writes in another language.`, `Your one tool is <tool>: it runs a <shell> command. Each call starts in the workspace folder, so cd doesn't carry over to the next call.` is present, and so is the sentence about `ask`. (`extensions/kvcoder/test/prompt.test.ts`, `extensions/kvcoder/test/unit/prompt-build.test.ts`)
- **QA5-E4 The section cap does not count the base prompt.** *Given* sections totalling 64 KB, *then* all are kept, since only sections count toward the cap. (`extensions/kvcoder/test/unit/prompt-build.test.ts`)
- **QA5-E5 Binary connectors still show only when their check passed.** *Then* the lead line is the same, and a failing check's connector is still absent. (`extensions/kvcoder/test/prompt.test.ts`)
- **QA5-E6 Nothing enforces the rule.** *Given* `auto` and a shell call that writes a file with a redirection (`printf hi > plain.txt`), *then* it runs and the file exists: the rule is advice in the prompt, not a refusal (ADR 0009, 171). (`extensions/kvcoder/test/connectors-first.test.ts`)
- **QA5-E7 A subagent reads the same rule.** *Given* a subagent, *then* its prompt has the connectors-first paragraph, and its index lists only its own connectors under the lead line. (`extensions/kvcoder/test/subagent-rules.test.ts`)

## Real model

Run in the running app (Chat page, `dev` preset for R3 and R4, `coder` preset otherwise), with the model the product owner names, each scenario three times in a fresh chat. The result of each run goes in the table below, with the model's id and the date. A scenario passes when every run does what *Then* says.

- **QA5-R1 A new file goes through `fs write`.** *Given* "create `notes/todo.md` with three todo items", *then* the model's calls use `fs write` (or `fs edit` for a later change), and none writes a file with `cat >`, `echo >`, or `tee`.
- **QA5-R2 A change goes through `fs edit`.** *Given* an existing file and "change the title in it to X", *then* the model uses `fs edit`, and not `sed -i`.
- **QA5-R3 An extension is built with `ext` and checked with it.** *Given* the `dev` preset and "make a notes extension", *then* the model reads `docs get` before writing, scaffolds with `ext new`, and after changing the code runs `ext check` and `ext test`, not `npx tsc` or `npm test`.
- **QA5-R4 A preview is started with `preview`.** *Given* a built extension and "show it to me", *then* the model runs `preview start`, and does not start a kvman or a server itself.
- **QA5-R5 The shell is still used for what no connector does.** *Given* "which files are in this folder, and is git clean?", *then* the model uses the shell (`ls`, `git status`), and does not refuse or search for a connector.
- **QA5-R6 A question is asked in the same reply.** *Given* a request with a missing detail, *then* the model calls `ask` instead of ending its reply with a promise to ask.
- **QA5-R7 Dependent calls are not sent together.** *Given* "write a script that prints hello and run it", *then* the model writes the file in one reply and runs it in a later one.

| Scenario | Model | Date | Runs passing | Notes |
|---|---|---|---|---|
| QA5-R1 | | | | |
| QA5-R2 | | | | |
| QA5-R3 | | | | |
| QA5-R4 | | | | |
| QA5-R5 | | | | |
| QA5-R6 | | | | |
| QA5-R7 | | | | |
