# ADR 0067 — Mermaid diagrams in Markdown

Status: accepted by the product owner on 2026-10-12, before source ("the artifacts that show Markdown must allow Mermaid diagrams"; the dependency was approved with the plan). It amends plan 06 §6.1 and §6.4.

## Context

A Markdown artifact, and an answer in the chat, showed a fenced `mermaid` block as its source text. kvwebui's Markdown view is the one place Markdown becomes HTML (`markdown-it` with HTML off, sanitized with DOMPurify), and every Markdown the app shows goes through it.

## Decisions

1. **A fenced `mermaid` block is drawn as a diagram**, wherever kvwebui shows Markdown: a Markdown artifact, an answer, a helper's answer, a documentation page. No other block changes.
2. **A new dependency, `mermaid`**, in `@kvman/kvwebui`, at its latest stable version, pinned exactly. It is imported only when a page shows such a block, so the app's first load doesn't carry it.
3. **Safety.** Mermaid runs with `securityLevel: 'strict'` and `htmlLabels: false`, so a diagram is plain SVG with no HTML inside it and no script or link that acts, and the SVG it returns goes through DOMPurify's SVG profile before it enters the page. The `v-html` rule holds: the Markdown view is still the only component that puts HTML in the page.
4. **A block that isn't a valid diagram stays as its source**, as a code block, with nothing thrown: a diagram being streamed is invalid until its last line arrives.
5. **A drawn diagram is remembered by its source and theme**, so a view that renders again, as a streaming answer does at every piece, doesn't draw it again.
6. **Theme.** A diagram uses Mermaid's `dark` theme when the app is dark and `neutral` otherwise, as the app is when the diagram is drawn; a diagram already on the page follows a change of theme the next time its view renders.

7. **The agent writes the code, never the drawing** (the owner, 12 October: "the agent should not generate SVG for Mermaid but code"). kvcoder's `artifact` entry in the prompt says: for a diagram, write Mermaid code in a fenced `mermaid` block of a Markdown artifact or reply, which kvman draws, and don't write SVG for a diagram.

## Limits

Mermaid decides a diagram's layout and size; a wide one scrolls sideways in its block. A diagram's text has no `dir="auto"` of its own.

## Verification

Scenarios M2.4-E248 to E250, written before source; the real drawing is checked in Chromium, since the simulated browser has no layout.
