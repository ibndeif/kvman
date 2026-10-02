# QA 11 — calls the model gets wrong (ADR 0009, 212–213)

Found by using the app: a model that kept sending `bash` calls without `title` and `description`, `artifact write '{"name":"todo-app"}'` with a 16 KB page, and `ask choice` with the wrong field names; each refusal cost a whole new reply and named the wrong fields without naming the right ones. The product owner chose: `title` and `description` optional, and a call without `risky` asks the person. Every scenario names its test. Backend tests use the test kernel and the fake model; `test/web/` mounts components in happy-dom.

## Happy path

- **QA11-H1 A call with only a command runs.** *Given* `kvcoder.shell.approval` `auto` and a call `{ command: 'echo hi', risky: false }`, *then* it runs and returns `hi`, and the result's `details` hold the command and no `title` or `description`. (`extensions/kvcoder/test/shell-title.test.ts`)
- **QA11-H2 The tool lists only `command` as required.** *Then* the tool the model gets has `required: ['command']`, its properties in the order title, description, command, risky, mode, timeoutMs, and the descriptions of `title` and `description` begin with "Optional." (`extensions/kvcoder/test/shell-title.test.ts`)
- **QA11-H3 A blank title or description is missing.** *Given* `title: '  '` and `description: ''`, *then* the arguments parse, with neither set; with `title: '  '` and a description, the title is derived from the description (ADR 186). (`extensions/kvcoder/test/unit/shell-args.test.ts`)
- **QA11-H4 A call without `risky` asks the person.** *Given* `auto` and a call `{ command: 'echo hi' }`, *then* the turn suspends on an approval whose command is `echo hi`, nothing runs until it is allowed, and after Allow it runs; `risky: false` still runs at once. (`extensions/kvcoder/test/risky-approval.test.ts`)
- **QA11-H5 The approval and the card show the command when there are no words.** *Given* an approval question with only `command`, *then* the approval card shows the command and no empty title or description line; a result card for such a call shows the command as its only text (QA9-E7). (`extensions/kvcoder/test/web/question-card.test.ts`)
- **QA11-H6 A built-in connector's invalid input says what the command takes.** *Given* `artifact write '{"name":"todo-app"}'` with a body, *then* the error holds `id: `, `title: `, and `input: Unrecognized key: "name"`, then `` `artifact write` takes '{ "id", "title", "format"?, "content" }' ``; likewise `ask choice` with `question` and `choices` names `prompt` and `options`, `fs write` names `path`, and `subagent run` names `task` and `mode`. (`extensions/kvcoder/test/connector-usage.test.ts`)

## Edge cases

- **QA11-E1 `command` is still required.** *Given* a call with no `command`, or an empty one, *then* it fails `VALIDATION_FAILED` naming `command` and what it must be, and ends with "Call bash again with the arguments fixed." (`extensions/kvcoder/test/unit/shell-args.test.ts`, `extensions/kvcoder/test/shell-title.test.ts`)
- **QA11-E2 A wrong type is still an error.** *Given* `title: 5`, `risky: 'yes'`, or `mode: 'later'`, *then* each fails naming the field and what it must be. (`extensions/kvcoder/test/unit/shell-args.test.ts`)
- **QA11-E3 `risky: false` is kept.** *Given* `risky: false`, *then* the parsed arguments have `risky` false, and a missing one parses as true. (`extensions/kvcoder/test/unit/shell-args.test.ts`)
- **QA11-E4 `ask` mode still asks for every call.** *Given* `ask`, *then* a call with `risky: false` and one without both ask. (`extensions/kvcoder/test/risky-approval.test.ts`)
- **QA11-E5 A command with no usage line gets the problems alone.** *Given* an invalid call to a built-in command whose help has no line for it, *then* the error is the problems only. (`extensions/kvcoder/test/connector-usage.test.ts`)
- **QA11-E6 A valid call is untouched.** *Given* valid input to `artifact write`, `fs write`, `ask text`, and `subagent run`, *then* none gets a usage line. (`extensions/kvcoder/test/connector-usage.test.ts`)
