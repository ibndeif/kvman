# ADR 0089 — a conversation that reads like a colleague: no call description, short narration, a map only for large or risky work

Status: accepted by the product owner on 2026-10-18. It amends plan 08 §8.1, §8.2, §8.3, §8.5, and §8.7, and
supersedes the `description` argument of ADR 0011, 1 and the "talk briefly" rule of ADR 0078 where they differ.

## Context

The owner found that a kvcoder chat reads like a procedure, not like a colleague who works alongside them, as Claude Code
does. The owner's busiest chat (1,065 replies, gpt-6.1-sol) showed why:

- **922 replies held only calls, no text.** The rule "leave out your inner steps" kept the model silent between calls,
  so the person read a column of call captions with a status report every few dozen calls.
- **Every call carried a caption.** `run`'s required `description` ("One sentence… for a person who knows nothing about
  how you work… Write it first") gave each call a formal line such as "Locating indexing, page retrieval, and text
  quality logic.", which the call card showed as its title. The card already has its own line, built from the call
  (`Read src/app.ts · lines 1–80 of 200`, `$ npm test`, ADR 0036, 2).
- **The method was followed as a checklist.** "Work in several parts… needs an execution map the person agreed to"
  made 173 map calls and 40 `ask choice` calls in that chat, and seven questions came one reply each.
- The rule "say what you are about to do in the same reply as the call" gave formulaic openers ("I'll first review…").

## Decisions

1. **`run` has no `description`** (asked; recommended: remove it entirely). The tool is
   `run { connector, command, payload? }`; its arguments are a strict object, so a call that still sends `description`
   fails `VALIDATION_FAILED` like any unknown argument. What the description named is now taken from the call itself:
   - the call card's title is its existing summary line (ADR 0036, 2); `artifact write` and `artifact edit` get one
     (`Write artifact` / `Edit artifact` and the id), and `help` too (`Help` and the connector, with the command);
   - an approval shows the call's own line, path, or payload, and holds `{ connector, command, payload }`;
   - a background shell or binary process is titled by its line, so its `title` and `call` are the line;
   - a helper's background record, and a program worker's run, have the run's `title` as their `call`; a continued
     helper keeps its own title;
   - a helper's `recentCalls` and `waitingFor` name each call as `<connector> <command>` and its subject (a shell line,
     a binary's `<name> <args>`, a path, a search pattern, the worker and title of a `delegate run`, the server and
     tool of an `mcp` call, an id), on one line cut at 200 characters as a card's row is, and a question by its prompt.
   A call stored before this ADR keeps its description on screen. The model is sent its past `run` calls without a
   `description`, so an older chat does not teach it the old argument. A stored approval or held call that has one still
   parses, and nothing reads it.
2. **The lead narrates its work, briefly.** The "talk to the person" rule of the lead's method becomes: between
   calls, when it learns something that changes what it does next, it says so in a sentence or two in the reply that
   makes the next call (what it found, and what it does now), the way a colleague thinks aloud; it doesn't announce
   routine calls or repeat what a card shows; plain words, the point first, no connector or command names, payloads,
   ids, or long output unless asked. The last rule keeps "a reply with no tool call is the final answer" and drops
   "say what you are about to do in the same reply as the call". A worker is unchanged: it doesn't talk to the person.
3. **A map only for large or risky work** (asked; recommended). The lead makes an execution map, and asks the person
   to confirm it, only when the work changes several parts that depend on each other or is hard to take back. Other
   work, even of a few steps, is done without a map, with a sentence now and then on where it is.
4. **Questions in one reply** (asked; recommended: the prompt only, the `ask` connector unchanged). The Clarify rule
   says every question goes in the same reply, one `ask` call each, never one question per reply; the general method
   says the same.

## Consequences

- Each call costs the model fewer output tokens and no sentence before its arguments.
- An approval or a job named by its line is less friendly to a person who doesn't read shell; the lead's sentence
  before a call is what explains it.
- The background notice keeps its text, `The background call \`<call>\` (job <id>) finished:`, now with the line or
  the run's title.
