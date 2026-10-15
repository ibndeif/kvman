# ADR 0084 — an `mcp run` shows its steps

Status: accepted by the product owner on 2026-10-15, before source. It amends ADR 0036, 1, 3, and 12, and plan 08 §8.7.

## Context

The product owner sent a picture of an approval of an `mcp run` (ADR 0070, 1) on the `playwright` server: under its closed line, the card showed the whole payload as nested rows, `server`, then `steps` › `1` › `tool` and `arguments` › `url`, then `2` and so on. ADR 0036 gave `mcp call` a view of its own, its arguments only, but `mcp run` came later and fell under "every other call", the fields view of the whole payload. So the card repeated the server its closed line already names and wrapped each tool's arguments in two levels of names meant for the model.

## Decisions

1. **An `mcp run` has its own view: numbered steps** (asked with mockups; chosen over a table of the steps, whose narrow cells wrap a long URL or script, and over keeping the fields view without `server`, `risky`, and `timeoutMs`). Each step is a line `<n>. <tool>`, its number and the tool's name, with that step's `arguments` under it as fields (ADR 0036, 9), and a dash when it has none. Like `mcp call`, it shows neither `server`, `risky`, nor `timeoutMs`: the closed line, `<server> · <tool>, <tool>…` (ADR 0070, 1), already names the server and the tools.
2. **The approval card and the opened call card show the same view** (ADR 0036, 12). The result is unchanged: each step's text under `## <n>. <tool>`.
3. **A step being written shows what is there.** While the model is still writing the call, a step with no tool yet shows its number alone.

## Verification

Scenarios QA48-H18 and QA48-E21, written before source.
