# QA 4 — the agent writes and edits files (ADR 0009, 157–161)

The product owner asked for a file-system connector inspired by pi's `write` and `edit` tools, with approval automatic unless a call is risky. Every scenario names its test. Tests of the pure parts are in `extensions/kvcoder/test/unit/`; the rest run a real turn against the fake model and the real file system in the workspace folder.

## Happy path

- **QA4-H1 `fs write` creates a file.** *Given* a workspace with no `notes/todo.md`, *when* the agent runs `fs write '{"path":"notes/todo.md","content":"- one\n"}'`, *then* the file exists with that content, its parent folder was created, and the result is `{ "path": "notes/todo.md", "created": true, "bytes": 6 }`. (`extensions/kvcoder/test/fs-connector.test.ts`)
- **QA4-H2 `fs write` replaces a file.** *Given* an existing file, *when* the agent writes new content to it, *then* the file holds only the new content and `created` is `false`. (`extensions/kvcoder/test/fs-connector.test.ts`)
- **QA4-H3 `fs edit` changes only the named text.** *Given* a file of five lines, *when* the agent edits one line, *then* the other lines are unchanged and the result is `{ "path", "replacements": 1, "firstChangedLine": <line> }`. (`extensions/kvcoder/test/fs-connector.test.ts`, `extensions/kvcoder/test/unit/edit-text.test.ts`)
- **QA4-H4 Several edits apply together against the original.** *Given* two edits whose `newText` of the first contains the second's `oldText`, *when* the call runs, *then* each was matched in the original file, and both replacements are applied. (`extensions/kvcoder/test/unit/edit-text.test.ts`)
- **QA4-H5 Line endings and the BOM are kept.** *Given* a CRLF file with a BOM, *when* an `oldText` written with `\n` is edited, *then* it matches, and the file still has CRLF endings and its BOM. (`extensions/kvcoder/test/unit/edit-text.test.ts`, `extensions/kvcoder/test/fs-connector.test.ts`)
- **QA4-H6 Absolute paths inside the workspace work.** *Given* the absolute path of a file in the workspace folder, *then* write and edit work on it. (`extensions/kvcoder/test/unit/workspace-path.test.ts`)
- **QA4-H7 `fs -h` lists the commands.** *When* the agent runs `fs -h`, *then* the result names `write` and `edit`, and `runConnector` answers `fs runs only inside a turn` for a real call. (`extensions/kvcoder/test/fs-connector.test.ts`, `extensions/kvcoder/test/run-connector.test.ts`)
- **QA4-H8 The shell tool needs `risky`.** *Then* the tool's schema lists `title`, `description`, `command`, `risky`, `mode`, `timeoutMs` in that order with `risky` required, and a call without it fails `VALIDATION_FAILED` naming `risky`. (`extensions/kvcoder/test/shell-title.test.ts`)
- **QA4-H9 `auto` asks only for a risky call.** *Given* `kvcoder.shell.approval` is `auto` (the default), *when* a reply has a shell call with `risky: false` and one with `risky: true`, *then* the first runs at once, and the second waits as an approval; allowing it runs it. (`extensions/kvcoder/test/risky-approval.test.ts`)
- **QA4-H10 `ask` asks for every call.** *Given* `ask`, *then* a call with `risky: false` asks too, and so does an `fs` call. (`extensions/kvcoder/test/risky-approval.test.ts`)
- **QA4-H11 An `fs` call follows the same approval.** *Given* `auto`, *then* a `fs write` with `risky: false` runs at once and one with `risky: true` waits; denying it writes nothing and returns `denied by the user`; allowing it writes. (`extensions/kvcoder/test/risky-approval.test.ts`)
- **QA4-H12 Two edits of one file in one reply both land.** *Given* a reply with two `fs edit` calls on the same file, *then* both changes are in the file, whichever the order of their reads. (`extensions/kvcoder/test/fs-connector.test.ts`)
- **QA4-H13 The default is `auto`.** *Given* no setting, *then* `kvcoder.shell.approval` reads `auto`, and the `dev` preset still gives `ask`. (`extensions/kvdev/test/e2e/presets.test.ts`)

## Edge cases

- **QA4-E1 A path outside the workspace is refused.** *Given* `/etc/passwd`-style absolute paths and `../outside.txt`, *then* write and edit fail `VALIDATION_FAILED` and nothing is written. (`extensions/kvcoder/test/unit/workspace-path.test.ts`, `extensions/kvcoder/test/fs-connector.test.ts`)
- **QA4-E2 A symlink out of the workspace is refused.** *Given* a folder inside the workspace that is a symlink to a folder outside it, *then* writing `link/file.txt` is refused, and so is writing to a symlinked file that points out. (`extensions/kvcoder/test/unit/workspace-path.test.ts`)
- **QA4-E3 A new file's parent is checked on its nearest existing ancestor.** *Given* `a/b/c.txt` where only `a` exists and is a symlink out, *then* it is refused before any folder is created. (`extensions/kvcoder/test/unit/workspace-path.test.ts`)
- **QA4-E4 Editing a missing file fails `NOT_FOUND`.** (`extensions/kvcoder/test/fs-connector.test.ts`)
- **QA4-E5 Text that isn't found writes nothing.** *Given* an `oldText` not in the file, *then* the error says `edits[0]` was not found and the file is unchanged; with two edits, the second one's index is named. (`extensions/kvcoder/test/unit/edit-text.test.ts`)
- **QA4-E6 Text found twice writes nothing.** *Then* the error says it was found 2 times and asks for more context. (`extensions/kvcoder/test/unit/edit-text.test.ts`)
- **QA4-E7 Overlapping edits write nothing.** *Given* two `oldText`s that share characters, *then* the error names both edits. (`extensions/kvcoder/test/unit/edit-text.test.ts`)
- **QA4-E8 An empty `oldText` is refused.** (`extensions/kvcoder/test/unit/edit-text.test.ts`)
- **QA4-E9 An edit that changes nothing is refused.** *Given* `newText` equal to `oldText`, *then* the error says nothing changed and the file is untouched, with its modification time unchanged. (`extensions/kvcoder/test/unit/edit-text.test.ts`, `extensions/kvcoder/test/fs-connector.test.ts`)
- **QA4-E10 Bad input fails `VALIDATION_FAILED`.** *Given* an unknown command, a missing `path`, an empty `edits`, an extra key, or input that isn't JSON, *then* the error names the problem and exit code is 1. (`extensions/kvcoder/test/fs-connector.test.ts`)
- **QA4-E11 A file that isn't UTF-8 text is not edited.** *Given* a binary file, *then* `fs edit` is refused and the file is unchanged. (`extensions/kvcoder/test/fs-connector.test.ts`)
- **QA4-E12 Writing onto a folder fails clearly.** *Given* a path that is a folder, *then* `fs write` fails `VALIDATION_FAILED` saying it is a folder. (`extensions/kvcoder/test/fs-connector.test.ts`)
- **QA4-E13 A subagent without `fs` can't use it.** *Given* a subagent started with `connectors: ["jobs"]`, *then* its `fs` call returns `fs isn't available in this subagent`. (`extensions/kvcoder/test/subagent-rules.test.ts`)
- **QA4-E14 `fs -h` never asks.** *Given* `ask`, *then* `fs -h` returns its help with no approval. (`extensions/kvcoder/test/risky-approval.test.ts`)
- **QA4-E15 Other built-in connectors never ask.** *Given* `ask`, *then* `jobs list` returns at once. (`extensions/kvcoder/test/risky-approval.test.ts`)
- **QA4-E16 A risky async call asks too.** *Given* `auto` and `mode: 'async'` with `risky: true`, *then* it waits for approval and starts only when allowed. (`extensions/kvcoder/test/risky-approval.test.ts`)
- **QA4-E17 An `fs` call cancelled with the turn writes nothing.** *Given* a turn cancelled while a `fs write` waits for approval, *then* the file doesn't exist. (`extensions/kvcoder/test/risky-approval.test.ts`)
