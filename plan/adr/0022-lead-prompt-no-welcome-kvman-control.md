# ADR 0022 — The lead agent's prompt, no welcome, and an agent that controls kvman

The product owner asked (2026-10-06) to "remove the welcome note entirely", to "make the main agent as the big brain that decide, plans and execute": one that understands the request, develops "an execution plan with a clear steps which depends on the available connectors", "knows how to executes in parallel", gets the work done "ready for production" in "the best simpler and practical way", acts "as an expert with a long long experience", clarifies with the person when needed, and "never assumes or invent but it operate based on facts and evidence"; and to "check and review the part where the agent can contols everything in kvman including developing extensions and optimize and enhance it properly".

The review of that part found four defects, each checked in the code, and the product owner chose to fix all four:

- A change to the running app was never confirmed. Only kvcoder's own commands could ask the person, so `kvman settings-set`, `model-set`, `extensions-install`, and `extensions-uninstall` ran at once, and the agent could change any setting: its own approval mode, the workers, the commands of the MCP servers.
- Installing a project the agent had just built pointed at the wrong folder. A `path:` source is resolved against the preset's folder (plan 02 §2.9), which is `<home>/presets/` after the first edit, and the install checked nothing, so `path:notes` was accepted and failed at the next start.
- The `kvman` connector was nine commands. The agent saw no workspaces, jobs, processes, or health, and couldn't call a command or query of an extension that is installed or that it built.
- The guide section listed commands and gave no method.

Decisions 1 to 8 were asked with alternatives. Decisions 9 to 15 are the smallest way to carry them out, were listed for the product owner with the plan, and were approved with it.

It lands in two passes: QA 33 is decisions 1 to 4 and 9, and QA 34 is the rest.

## Decisions

1. **The welcome is removed** (asked for). The setting `kvcoder.welcome`, the `kernel.workspace.opened` handler that made the welcome session, its catalog keys, and its row in the Chats card are gone. Notes (`kvcoder.note.add`) stay. The handler point `kernel.workspace.opened` stays the kernel's. This changes ADR 0008, 75, ADR 0009, 193, and ADR 0013, 7.
2. **The agent is a lead engineer with long, deep experience, with no count of years** (asked; chosen over a line with a number such as "more than 20 years", which QA 5 removed, and over expressing the expertise through the rules alone). A number would read as a fact nobody checked.
3. **The main agent and a subagent get different working methods** (asked; chosen over one method for both). A session with no parent gets the lead's method: understand, clarify, plan, execute, delegate, finish. A subagent gets a worker's method: understand the task, do it, return the result. A worker no longer reads plan and delegate steps it can't use. Both keep the same paragraphs about the `run` tool and the connectors, and the same closing rules. This changes ADR 0009, 180, and ADR 0021, 28.
4. **The plan stays scaled to the task** (asked; chosen over a plan for every task, sized to fit, and over the `plan` artifact for every task). A task of one file or a few steps skips the plan and delegate steps.
5. **A registered command may ask the person first** (asked; chosen over the same flag on settings and extensions only, leaving `model-set` free, and over a rule in the prompt alone, which nothing enforces). A command entry of `kvcoder.connector.register` takes `asks: true`. kvcoder then makes each call of it an approval question, as a risky `fs write` is, whatever `kvcoder.shell.approval` says, since a registered command has no `risky` field. Any extension may use it. kvcustomizer marks `model-set`, `settings-set`, `settings-reset`, `extensions-install`, and `extensions-uninstall`.
6. **`kvman extensions-install` resolves `path:` from the workspace** (asked; chosen over a second payload form `{ folder }`, and over documentation alone). The payload stays `{ name, source }`. kvcustomizer resolves the `path:` folder against the workspace folder, where it must stay as every folder of kvcustomizer does, and stores it absolute; the folder must hold a package.json with a `kvman` field (`kvcustomizer/NOT_A_PROJECT`) whose `name` is the `name` given (`VALIDATION_FAILED`). The kernel's command is unchanged.
7. **The `kvman` connector reads the app's state** (asked; chosen over the three reads that diagnose a failure, and over none). Five commands: `workspaces-list`, `jobs-list { status?, limit }`, `jobs-get { id }`, `processes-list`, and `health-get`, each wrapping the kernel query of that name. There is no `registrations-list`: `extensions-list` already names every command and query.
8. **The agent calls queries in the app, and commands and queries in the preview** (asked; chosen over also a generic command runner in the running app, over the preview alone, and over no calls). `kvman query-get { name, input }` runs any public query of the running app and never asks. `preview query-get` and `preview command-run { name, input }` call the preview kvman over its HTTP API, and never ask, since its home is temporary. The running app has no generic command runner: a key sent in a payload would be stored in the chat, against the secrets rule (`CLAUDE.md` §6), so a command of the app is reached only through a connector that names it.

9. **A session's title is a string.** The `{ key }` form existed only for the welcome session, and `kvcoder.session.create` takes a string. A session stored with a `{ key }` title, in a home where the welcome was set by hand, no longer parses; no preset ever set it.
10. **A denied call of a command that asks returns "denied by the user"**, as a denied `fs write` does. The payload isn't checked before the person is asked: the kernel validates it when the call runs.
11. **`help` says that a command asks.** The help of a command registered with `asks: true` adds the sentence "The person is asked before this runs."
12. **The names.** The new registrations are `kvcustomizer.app.workspaces.list`, `kvcustomizer.app.jobs.list`, `kvcustomizer.app.jobs.get`, `kvcustomizer.app.processes.list`, `kvcustomizer.app.health.get`, `kvcustomizer.app.query.get`, `kvcustomizer.preview.query.get`, and `kvcustomizer.preview.command.run`.
13. **`kvman query-get` fails with the kernel's codes.** A name that is a command fails `VALIDATION_FAILED`, and one that no public query has fails `NOT_FOUND`; the query's own Problem passes through. A name under `kernel.secrets.` fails `VALIDATION_FAILED`, so the connector lists no secret's name either, as ADR 0010, 6 asks and QA17-E15 checks.
14. **A preview call answers the HTTP envelope.** `{ ok: true, output }` or `{ ok: false, problem: { code, message, params? } }`, so the agent reads a failure of its own extension as data. With no preview running the call fails `NOT_FOUND`, as `preview stop` does.
15. **Left out.** There is no command that restarts kvman, so a change to the extensions still needs the person to restart it, and none that opens or closes a workspace.

## Consequences

- Plan 08 §8.1 to §8.5 and §8.7, plan 09 §9.1, §9.3, and §9.4, and plan 13 (M2.4) are corrected.
- `kvcoder.welcome` and its catalog keys are removed; `kvcoder.delegate.workers` joins kvcoder's `Settings` type, where it was missing.
- No new dependency. The kernel is unchanged.
