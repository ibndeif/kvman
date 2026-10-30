# How the agent works

This page is for anyone who works with kvcoder's agent and wants to know what it will do. When you finish, you know how it chooses its way through a task, how to read and approve its execution map, which tools it has, when it asks before acting, and how its workers help.

## Its method

The agent is told to work as a lead engineer who owns the result, and to talk to you as it works: every reply that makes a call starts with one short sentence on what it is doing and why, or what it found and what it does next, in plain words with the point first. When you use kvman's own words (extension, preset, setting), it uses them too.

No path is fixed. For each task it takes the lightest path that does the task well:

- a question gets an answer, and nothing changes;
- a small, clear change is made and checked;
- an unclear request gets its questions first;
- work that changes several parts that depend on each other, or that is hard to undo, gets an **execution map** you agree to, and other work, even of a few steps, is just done (a bug fix, or a change to one or two files, never gets a map);
- a result you will look at, such as a page or a design, is shown to you.

A path is made of these parts, used only when the task needs them:

1. **Understand.** It reads everything you sent, attached files too, then looks at what exists, including what already does part of what you asked, so it builds on that. It works out what you want to end up with, what done looks like to you, what must keep working, and what you didn't say that changes the result. It never invents a name, a path, or a behavior.
2. **Clarify.** It looks up what looking would answer. It decides an ordinary detail that is easy to change, and tells you what it chose. It asks you, before any work, about what only you can decide, all its questions in one round, together in one reply, with its recommended option first. When what you asked for works against your goal, or a clearly better way exists, it says so and offers both. Once you said go ahead ("do it", "yes", or the option that starts), it doesn't ask that again.

   **Tests.** kvman doesn't tell the agent to run or write tests. Say in your request, or in the project's `AGENTS.md`, when you want them.
3. **Map.** When the work needs a map, it draws it, only after it understood and has your answers. It says back in a few lines the goal, what done looks like, what stays as it is, and the choices it made. When you already told it to go ahead with that work, it starts; otherwise it asks whether to start, and you can write what to change, and it plans again.
4. **Execute.** It follows the map, marks each step as it starts it, and marks it done only with evidence: what it ran and what that showed.
5. **Stay on the task.** A problem your task doesn't need isn't looked into. It goes on the map's **Noted for later** list and is reported at the end.
6. **Delegate.** It hands a step to a worker when the worker does it better or faster (below).
7. **Show what you will look at.** A screen, a page, or a style is shown in an artifact, and a page is tried before you see it.
8. **Finish.** It cleans up what it left behind, stops what is no longer needed, and leaves running what you will try yourself, with its address. Its last answer starts with the result, in plain words; it tells you what it couldn't check, what still runs, or what it noted for later when that matters for what you do next. When it learned how your project is built, tested, or run and your `AGENTS.md` doesn't say it, it offers to add a short Commands section there: command lines only, at most 15.

These are instructions to a model, not guarantees: read the map and the call cards, and stop the turn when it goes the wrong way. `/prompt` shows the exact text.

## The execution map

The map is the agent's plan for a larger task, drawn in the panel beside the chat. It is the path the agent found, after looking at your project, to be the best and fastest way to do what you asked.

- **Steps.** Each step is one concrete stage: what changes, who does it, and how it will be checked. A map has 1 to 40 steps.
- **Who does a step.** The agent itself, with a connector, for an ordinary change, or a specialist worker when the step needs that skill: whichever worker's description fits, such as a designer, an architect, a tester, or a reviewer.
- **The shape.** The agent's own steps are one line, in the order it does them. Steps side by side are branches: each one is done by a worker at the same time.
- **A step's details.** The agent draws the steps first, then writes each step's details: what it changes and how, as formatted text that can hold lists, tables, diagrams, and charts. It asks you to approve the plan once every step has its details, and a step can't start without them. Press a step to open a dialog with its details, what it comes after and uses, its check, its evidence, and its note. The dialog follows the step while the agent works.
- **Progress.** Each step shows as to do, doing, done, failed, or skipped. If the agent changes files or runs a command while steps are left and none is marked as doing, kvman reminds it to mark one or update the map. Nothing is blocked.
- **Changing it.** Ask the agent. A change to what you get (the goal, what done looks like, what stays as it is, stored data, or what could go wrong) is confirmed with you again; a change inside the plan, such as who does a step or the order, is made and told in one line.

## Connectors: what the agent can use

Everything the agent does goes through a **connector**, a named set of commands. It has no other way to touch your files or your machine. Built in:

| Connector | Does |
|---|---|
| `shell` | Runs one line in a real shell in the workspace folder: `bash` on Linux and macOS, PowerShell on Windows. Each line starts fresh, so a `cd` doesn't carry over. A line times out after 120 s by default, up to 600 s. |
| `fs` | Reads, lists, searches, writes, and edits files, inside the workspace folder only. It can read several files in one call, sees each file with its line numbers, and a failed edit tells it where the text was. |
| `artifact` | Stores something for you to read ([coding-app.md](coding-app.md#the-panel-artifacts-and-the-execution-map)). |
| `execution-map` | Draws and updates the plan (above). |
| `ask` | Asks you a question and waits for your answer. |
| `delegate` | Hands a step to a worker (below). |
| `background` | Checks on, waits for, or stops what the agent left running. |
| `mcp` | Uses the tools of the MCP servers you add (below). It is there only while you have one. |

Other extensions add their own: kvbuilder adds `kvman`, `ext`, `preset`, `preview`, and `docs` to a chat where you typed `/build-kvman` ([building-kvman.md](building-kvman.md)). A preset can also add a program on your machine, such as `git` or `gh`, with the `kvcoder.connectors` setting. Every connector is in one list on Coder's page (**Extensions → Coder**), each with a switch. Turn one off and the agent no longer sees it, from its next step.

## Approval

Five kinds of call can change things: a shell line, a program such as `git`, writing a file, editing a file, and an MCP server's tool. The agent judges each call:

- **Not risky:** the ordinary work of the task. Creating or editing a file in the workspace folder that the task needs, running the project's own build, tests, and tools, and anything that only reads.
- **Risky:** what is hard to take back or reaches past the task. Anything outside the workspace folder, deleting files, a file that holds secrets such as `.env`, rewriting Git history or discarding uncommitted work, `sudo` or an install outside the project, and sending anything out (a push, a publish, a deploy, a message). When it can't tell, the call is risky.

The **Approval** setting (`kvcoder.approval`, in the **Agent** card on Coder's page) decides when kvman asks you:

| Mode | Asks before |
|---|---|
| **Ask only for risky calls** (`auto`, the default) | each call the agent judged risky |
| **Ask for every call** (`ask`) | every one of the five kinds |
| **Never ask** (`never`) | nothing |

In `auto` and `ask`, two more kinds always ask: a command an extension marked as needing approval (such as every change `/build-kvman` makes to the app), and a worker program you set to ask before a run.

**Never ask** asks you to confirm first, because the agent then runs commands, changes files, changes kvman, and starts worker programs with nobody looking, and what it reads (a file, a web page, a tool's answer) can steer it. The agent's own questions still wait for you. Approval was never a sandbox: it is a stop before a call, and `never` removes it.

Reading, listing, and searching files never ask.

## Background work

For a dev server or anything else that must keep running, the agent starts the line in the background and goes on. It waits for a run with one call when it needs the result, and a message from you ends that wait at once, so it answers you without delay. When you write to it while runs are going, it is told what still runs. You see the runs in the **Running** chip ([coding-app.md](coding-app.md#background-work)).

## Workers

A worker is another agent that does one focused job in a hidden helper chat. Every worker runs in the background: the agent hands it a brief and goes on with what doesn't need it, or ends its turn, and the worker's answer wakes the chat when it arrives. You can keep writing to the agent meanwhile, and **Stop** ends the agent's turn but leaves its workers running; stop a worker from the **Running** chip. A brief has one kind: **find** (locate or explain code or facts) and **review** (review a finished change) only read, **check** runs commands or tests but changes no file, and **change** makes one change and may change only the files the brief names. It also says the goal, when the job is done, any lines of code to attach, and a step budget (60 at most); a worker that reaches its budget stops and returns where it got. Its card shows its newest headline, `step 12 of 60`, its time so far, and its last call, and its approvals show up in your chat under "A background helper needs your decision." While such a worker waits for you, the **Running** chip shows it as "Waiting for you". The agent can send a worker that has finished a follow-up, and it goes on with what it already did. A worker thinks at **Helpers' thinking** (`kvcoder.delegate.thinking`, Medium by default) unless its own setting names a level, and never above **Helpers' highest thinking** (`kvcoder.delegate.thinkingLimit`, High by default), so helpers stay quick. If the agent writes to a worker that is still busy, the message waits for the worker's next step. A worker asks you nothing and writes no artifact: its answer, with any question it has, goes to the chat's agent, the only one that talks to you. It does the one task it was given, checks it, and returns what it did, the evidence, and what is left.

kvman comes with six workers:

| Worker | Is |
|---|---|
| `general` | for any separate task |
| `ui-ux` | designs the experience and the look of a screen or flow, to usability and accessibility standards (WCAG 2.2 AA) |
| `architect` | designs the structure of a change inside your project's own patterns; it only reads |
| `tester` | a QA engineer: tests the critical flows, security, and performance, automated and by hand, and reports the issues |
| `reviewer` | reports wrong style, needless complexity, and unclear code; it only reads |
| `council` | for complex requests whose approach is open: an engineer, a devil's advocate, a dumb customer, and the best expert for the problem debate it until its fatal flaws are fixed, then a silent Maestro writes the final plan; it only reads, and thinks at High |

To manage them, open **Extensions → Coder** and press the cog on the `delegate` row. There you turn a worker off, edit its instructions, choose its connectors, give it its own model or thinking level, remove it, or add your own. **Reset** brings back the six with the instructions of the version you run; a list you changed keeps your words when kvman is updated. **Model for workers**, in the Agent card, is the model a worker uses when it names none, so workers can run on a cheaper model.

**When the agent calls the council.** The agent decides for each request, apart from whether it makes an execution map. A hard decision with a small change gets the debate and no map; a large change whose way forward is clear gets a map and no debate; complex work whose way forward is open gets both, the debate first, so the map is built on the council's plan; most requests get neither. It never calls the council for a question, a bug fix, or a small, clear change, and calls it once per request. If you saved your own list of workers before this version, it doesn't have `council`: add it with **Add a worker**, or press **Reset**, which also resets your other workers.

**Programs as workers.** A worker can be a coding program installed on this computer: **opencode**, **pi**, or **Claude Code**. It runs the program in your workspace folder, signed in the program's own way and spending on that program's account. You choose whether kvman asks before each run, how long a run may take (1 to 120 minutes), and the program's options, such as its model. The program edits files and runs commands on its own: kvman's approval cards don't cover what it does inside a run. A worker whose program isn't installed says so, and the agent isn't offered it.

## MCP servers

An MCP server gives the agent more tools: your issue tracker, a database, a browser. You add servers yourself; kvman ships with none.

Open **Extensions → Coder** and press the cog beside `mcp`. **Add a server** asks for:

- **Name**, what the agent calls it, such as `github`. It can't be changed later.
- **Description**, what the server is for. The agent reads it to decide when to use the server.
- **Runs as**: **A command on this computer** (a **Command** such as `npx`, with its **Arguments**, one per line) or **A URL**.
- **Environment variables** (for a command) or **Headers** (for a URL). Their values are kept as secrets and never shown again: a stored one shows **Set**, with **Replace**.

Each server says **Ready · N tools**, **Sign-in needed**, or **Could not connect** with the reason. It is checked when you open the list, after you save, and with **Check again**. The list is saved for all workspaces or only this one, as the page's switch says.

**Signing in.** A server that needs your account has **Sign in**. It opens the server's own sign-in in a new tab, which comes back to kvman and says **Signed in to \<name\>. You can close this tab.** **Sign out** forgets it. If no tab opens, allow pop-ups for kvman and press **Sign in** again. The agent never signs in for you.

What to know:

- A command server starts for each call and stops when the call ends, in a temporary folder of its own that kvman deletes, so its logs don't land in your project. It finds your project in the variable `KVMAN_WORKSPACE`. For a server that keeps state across tools, such as a browser, the agent runs several tools in one `mcp run`. With a browser server, the agent tries a page it built before it shows it to you.
- A tool's result goes into the conversation, and so to the model. Only add servers you trust.

## Next

- [coding-app.md](coding-app.md)
- [building-kvman.md](building-kvman.md)
- [privacy-and-security.md](privacy-and-security.md)
