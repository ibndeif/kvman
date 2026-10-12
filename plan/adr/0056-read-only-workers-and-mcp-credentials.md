# ADR 0056 — read-only workers, and MCP credentials tied to their destination

Status: accepted by the product owner by choice on 2026-10-12, before source. This records KVC-33 and KVC-32.

## Read-only workers (KVC-33)

1. A subagent worker has `readOnly: boolean`; an entry saved without it reads `false`. The shipped `architect` and `reviewer` have it `true`. A workers list the person already saved keeps its entries as they are.
2. A child session keeps the worker's `readOnly` with its name and instructions when it is created (old sessions read `false`), so a later edit of the worker changes nothing for a running helper.
3. A read-only helper may run reads and what changes nothing in the workspace: `fs read`, `list`, and `search`; `artifact`, where it writes its report; `ask`; `background list` and `output`; `mcp tools`; and every `help`. Any other call is refused when it is evaluated, before any approval is asked and whatever the model was told: a built-in command that can ask for approval (`shell exec`, a binary, `fs write`, `edit`, `undo`, `assemble`, `mcp call`), `fs part`, `background stop`, `delegate run`, and every registered command, whose effect kvcoder can't know. The result says the helper is read-only and to report instead.
4. The helper's prompt lists only what it may run, and says that it is read-only.
5. A program worker is not covered: what a program does on the computer is its own.

## MCP credentials (KVC-32)

6. **Tokens and registration belong to an address.** The stored sign-in tokens and client registration of a server carry the server's URL they were made for, and are used only with that URL. A server whose URL changed has neither: it needs a sign-in. Tokens stored before this, without a URL, are not used.
7. **Each sign-in attempt is its own.** A started sign-in keeps its code verifier under its own state. Finishing one deletes the other started sign-ins of that server, so a late one can't replace the newer tokens; an expired one's verifier is deleted with it.
8. **Typed secrets.** In the server's form, changing a server's address, or its command or arguments, drops the stored header or environment values, which must be typed again for the new destination. A change made in settings outside the form is not covered.
9. **Redaction.** The text of an `mcp call` result has every known secret value of that server replaced by `***` before it is stored or sent anywhere: its header or environment values, and its sign-in access and refresh tokens. Failures already did this. A secret kvman doesn't hold, or one the server returns encoded, is not found.

## Verification

Scenarios M2.4-E170 to E176, written before source.
