# QA 7 — a model that leaves out the title (ADR 0009, 186)

Found in the running app: `glm-5.3-flash` often sends a call without `title`; the call failed, the model repeated it, and two or three steps were lost. The product owner chose to derive a missing title and to make every argument error say what the field must be. Every scenario names its test. The pure parts are tested in `extensions/kvcoder/test/unit/shell-args.test.ts`; the turn-level ones run a real turn against the fake model.

## Happy path

- **QA7-H1 A call without a title runs, with the title derived.** *Given* a call with `description`, `command`, and `risky` but no `title`, *then* the command runs, and the result's `details.title` is the description. (`extensions/kvcoder/test/shell-title.test.ts`)
- **QA7-H2 A blank title is treated as missing.** *Given* `"title": "  "`, *then* it is derived the same way. (`extensions/kvcoder/test/unit/shell-args.test.ts`)
- **QA7-H3 A short description is the whole title, a long one is cut.** *Given* a description of 60 characters or fewer, *then* it is the title as it is (trimmed); *given* a longer one, *then* the title is its first 60 characters followed by `…`. (`extensions/kvcoder/test/unit/shell-args.test.ts`)
- **QA7-H4 The model's own title is kept.** (`extensions/kvcoder/test/unit/shell-args.test.ts`)
- **QA7-H5 The derived title is what the person sees.** *Given* `kvcoder.shell.approval` is `ask`, *then* the approval's `title` is the derived one. (`extensions/kvcoder/test/shell-title.test.ts`)
- **QA7-H6 Every argument error says what the field must be.** *Given* a missing or wrong `description`, `command`, `risky`, `mode`, or `timeoutMs`, *then* the message holds `<field>: ` and what that field must be (the texts of ADR 0009, 186), and ends by asking for the call again with every argument it needs. (`extensions/kvcoder/test/unit/shell-args.test.ts`, `extensions/kvcoder/test/shell-title.test.ts`)

## Edge cases

- **QA7-E1 With no description there is nothing to derive from.** *Given* neither `title` nor `description`, *then* the call fails `VALIDATION_FAILED` naming both, and nothing runs. (`extensions/kvcoder/test/unit/shell-args.test.ts`, `extensions/kvcoder/test/shell-title.test.ts`)
- **QA7-E2 `risky` is never defaulted.** *Given* a call without `risky`, *then* it fails naming `risky` and what it must be, and nothing runs. (`extensions/kvcoder/test/shell-title.test.ts`)
- **QA7-E3 A call to a tool that doesn't exist keeps its message.** (`extensions/kvcoder/test/shell.test.ts`)
- **QA7-E4 The tool still lists all four arguments as required.** (`extensions/kvcoder/test/shell-title.test.ts`)
- **QA7-E5 A derived title is not stored over the model's arguments.** *Then* the assistant message keeps the arguments exactly as the model sent them, and only the result's `details` and the approval hold the derived title. (`extensions/kvcoder/test/shell-title.test.ts`)
