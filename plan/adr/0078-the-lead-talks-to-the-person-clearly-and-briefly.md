# ADR 0078 — the lead talks to the person clearly and briefly

Status: accepted by the product owner on 2026-10-14, before source. It amends ADR 0009 (168) and plan 08 §8.2.

## Context

The owner wrote: "Ensure it comunicates with the user concisely and in a clear understandable way for humans". The lead's prompt said only "Keep replies short: say what you did and what is left.", which sets the length but not how to write for a person.

## Decisions

1. **The lead's reply rule says how to talk to the person.** It is plain everyday words, short sentences, and the point first. It covers only what was done, what it showed, and what is left or needs the person's decision. It leaves out inner steps, connector and command names, payloads, ids, and long output unless the person asks. A file or technical term is named only when it helps, and is explained in a few words. Several items go in a short list, and a short reply has no headings or tables. The old sentence stays at the end of the rule.
2. **The final answer is in plain words and as short as the facts allow.** What it holds does not change.
3. **Workers are unchanged.** They answer the lead, not the person (ADR 0063), and their Return step still sets their reply.

## Verification

`extensions/kvcoder/test/unit/prompt-method.test.ts`: M2.4-E301 checks that the lead's prompt holds the rule, and M2.4-E302 checks that a worker's prompt does not.
