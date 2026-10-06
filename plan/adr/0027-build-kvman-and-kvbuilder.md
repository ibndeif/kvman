# ADR 0027 — `/build-kvman` in place of `kvman init`, and kvcustomizer becomes kvbuilder

The product owner looked for the command that starts customizing in release 0.1.1 and didn't find it (2026-10-06): ADR 0023 made it `kvman init`, a connector command the agent calls when the `kvman` connector's description tells it to. The product owner then decided:

- The agent must not call it. The person starts building kvman, with a slash command of the send box.
- Until the person does, nothing about building kvman is in a chat's prompt, the five connectors included.
- The extension is renamed to "kvman builder".

Decisions 1 to 7 were asked with alternatives and mockups. Decisions 8 to 17 are the smallest way to carry them out; the product owner may overrule any of them.

## Decisions

1. **The command is `/build-kvman`** (chosen after `/customize`, and over `/init` and `/kvman`).
2. **What it does** (chosen over loading the guide without a turn, and over sending the guide as a message): the guide becomes a section of that chat's prompt, so a summary of the chat never drops it; a note line says "Building kvman is on for this chat"; and a turn starts. `/build-kvman <request>` starts on the request.
3. **The first message is the person's own** (chosen over a message marked as the extension's): the text after the command is sent as the person's message, and a bare `/build-kvman` sends a short translated line, "I want to change this app.", as theirs.
4. **Before the command, a chat knows nothing about building kvman** (chosen over keeping the connectors with a pointer to the command, and over keeping them as they were): the `kvman`, `ext`, `preset`, `preview`, and `docs` connectors are absent from the chat. This reverses what ADR 0023 weighed and declined ("connectors hidden until a customizing mode is switched on").
5. **kvcoder gains a registry of slash commands** (chosen over a fixed entry in kvcoder's own list, which would make kvcoder know the extension that depends on it). This reverses ADR 0017, 6, which chose a fixed list over a registry.
6. **Connectors are hidden with `optIn`** (chosen over registering a connector for one session, which would make the owner remember every such chat and register again at each start): a connector registered with `optIn: true` is off in every chat until its owner switches it on for that chat with `kvcoder.connector.enable`.
7. **The extension is kvbuilder** (chosen over `kvmanbuilder`, and over changing the shown name only): the package `@kvman/kvbuilder`, the folder `extensions/kvbuilder`, the namespace `kvbuilder`, its commands `kvbuilder.*`, its errors `kvbuilder/*`, and the title "kvman builder".
8. **The slash registry's shapes.**
   - `kvcoder.slash.register { commands: [{ name, description, command, message? }] }` → `{}`. `name` is lowercase kebab case. `description` and `message` are translation keys of the caller's catalog, since a person reads them. `command` is a public command of the caller that takes `{ sessionId, argument }`, where `argument` is the text after the command's name, `''` when there is none; any other `command` fails `VALIDATION_FAILED`. Every entry is checked before any is stored, and a name given twice fails `VALIDATION_FAILED`.
   - `kvcoder.slash.unregister { name }` → `{}`: the owner only; a missing name does nothing.
   - `kvcoder.slash.list {}` → `[{ name, description, command, message?, owner }]`, by name.
   - kvcoder's own six names (`compact`, `export`, `fork`, `new`, `prompt`, `rename`), and a name another extension owns, fail `kvcoder/NAME_TAKEN`.
   - Ownership and lifetime are the connectors' (plan 08 §8.4): the caller owns what it registers, kvcoder clears the registry in its `kernel.started` handler and each extension registers again in its own, and an entry whose owner isn't loaded is ignored.
9. **The send box.** The list shows kvcoder's six, then the registered commands by name, each with its translated `description`. Running a registered command calls its `command` with the chat's id and the argument. When it succeeds and the entry has `message`, the send box sends the argument, or with none the translated `message`, with `kvcoder.message.send`, as a message the person typed. A command that fails shows its Problem as a toast and sends nothing. With no chat yet the list stays greyed and nothing runs (ADR 0018, 5).
10. **`optIn`'s shapes.**
    - A connector entry, of either kind, may have `optIn: true`, the only value the field takes. `kvcoder.connector.list` rows gain `optIn: boolean`.
    - `kvcoder.connector.enable { sessionId, names }` → `{}`: each name must be an `optIn` connector the caller owns, else `VALIDATION_FAILED`; an unknown session fails `kvcoder/SESSION_NOT_FOUND`, and a subagent session `VALIDATION_FAILED`, as every command that names one does. The names are kept on the session record (`optedIn`, `[]` at first), so they outlast a restart, and enabling one twice does nothing.
    - An `optIn` connector that isn't enabled in a chat is, there, as one that `kvcoder.connectors.disabled` names (plan 08 §8.4): it isn't in the prompt's connector index or the `run` tool's enum, and a call to it gets the answer for a connector that doesn't exist. A setting that turns it off still wins.
    - A subagent follows its chat: it has an `optIn` connector only when its top-level session enabled it, and its worker lists it.
    - A fork starts with none enabled, as per-session sections aren't copied.
11. **There is no command that switches building off.** A chat stays a building chat, and a new chat starts clean.
12. **kvbuilder's `kvbuilder.build.start { sessionId, argument }` → `{}`** is the command behind `/build-kvman`. It sets the session section `guide` (title "Building kvman", order 20) to the guide's text, enables its five connectors for the session, and, only when the section wasn't there before, adds the note `kvbuilder.build.started`. So a second `/build-kvman` in a chat renews the guide and sends the message, and adds no second note. It is public, since the web page calls it.
13. **`kvman init` is gone**, with the query `kvcustomizer.app.guide.get`; the `kvman` connector's description no longer opens with "Call `init` first". The guide's file is `docs/guide.md` (it was `docs/init.md`), still not a docs page, and it no longer says to call `init` again.
14. **kvbuilder's `kernel.started` handler** registers its five connectors, each with `optIn: true`, and its slash command `{ name: 'build-kvman', description: 'kvbuilder.slash.build-kvman', command: 'kvbuilder.build.start', message: 'kvbuilder.slash.build-kvman.message' }`. It no longer removes the global section `guide` of versions before ADR 0023: that section's owner is `@kvman/kvcustomizer`, which no longer loads, so kvcoder ignores it.
15. **The docs page `customizing` is `building`** (`kvbuilder.docs.get { topic: 'building' }`), and the user guide's page is `building-kvman.md`.
16. **The rename is a clean break**, as kvdev's was (ADR 0010). The `coder` preset lists `@kvman/kvbuilder`. A personal preset that names `@kvman/kvcustomizer` fails at start until the person edits it; settings and stored data had none under `kvcustomizer`, so nothing is migrated. Earlier ADRs and changelog entries keep the old name.
17. **On npm**, `@kvman/kvbuilder` is a new package published with the next release, and `@kvman/kvcustomizer` is removed entirely (the product owner's decision, over deprecating it). Both are the product owner's steps (ADR 0026), in this order: the release with kvbuilder first, since `kvman` 0.1.0 and 0.1.1 depend on `@kvman/kvcustomizer` and installing them fails once it is gone; then `npm unpublish @kvman/kvcustomizer --force`, which npm allows within 72 hours of the first publish (2026-10-06 05:08 UTC) and only when no package in the registry depends on it. What becomes of `kvman` 0.1.0 and 0.1.1 is open.

## Consequences

- Plan 08 (§8.2, §8.4, §8.6, §8.7) and plan 09, now `09-kvbuilder.md` (intro, §9.1, §9.4, §9.5), are corrected, with plans 01, 02, 07, 10, 11, and 13, and `CLAUDE.md` §3.
- This replaces ADR 0023 (decisions 2, 3, 5, and 6) and ADR 0017, 6, and changes ADR 0010 (the name) and ADR 0022 (the method is the guide section's, no longer `init`'s).
- Scenarios that described `kvman init` (QA 35) are replaced by QA 39's.
- No new dependency. The kernel is unchanged.
