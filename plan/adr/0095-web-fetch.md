# ADR 0095 — `web fetch`: a page read as Markdown, never a private address, and the person asked per domain

Status: accepted by the product owner on 2026-10-19 and 2026-10-20 (the recommended options, and `turndown` as the
dependency). It amends plan 08 §8.2, §8.3, §8.5, and §8.7.

## Context

The kvcoder review of 2026-10-19 (`docs/reviews/kvcoder-review-2026-10-19.md`, item 13) found the agent ran `curl` or
`wget` 45 times through the shell, which brings a page's raw HTML into the context, while the method tells it to read
current documentation rather than rely on memory. Claude Code has a WebFetch tool.

## Decisions

1. **`web fetch { url }`** (asked; recommended). kvcoder's own connector `web` has one command, `fetch`: the private
   query `kvcoder.web.page.get`. It takes an `http` or `https` address (no credentials in it), follows at most 5
   redirects, reads at most 5 MB in at most 30 s, and returns `{ "url", "status", "type", "content" }`: `url` the last
   address, `type` the media type, and `content` the page as Markdown for `text/html`, or the text itself for
   `text/plain`, `text/markdown`, `application/json`, and other `text/*` types. Any other type fails
   `VALIDATION_FAILED`; a status of 400 or more is an error result with its status. `content` is cut as a connector
   result is (30 KB, its first and last 15 KB).
2. **The dependency** (asked; recommended: `turndown`). HTML becomes Markdown with `turndown` 7.2.4, pinned exactly;
   its `<script>`, `<style>`, and `<noscript>` are removed first.
3. **Never a private address** (asked; recommended). Before each request, and again for each redirect, the host is
   resolved and the request is refused, `VALIDATION_FAILED`, when any of its addresses is loopback, private,
   link-local, unique-local, unspecified, or a multicast address; the connection then uses the address that was
   checked, so a second resolution can't change it. kvman's own listener is therefore out of reach.
4. **The person is asked per domain** (asked; recommended). With `kvcoder.approval` `auto` or `ask`, the first fetch
   from a host in a chat asks as a risky call does, and an allowed one adds the host to the chat's `webHosts` (a
   session field, old records `[]`), so later fetches from it run at once; with `never` none asks. A read-only
   worker's helper may fetch from a host its chat allowed, and is refused any other (it can't ask). A helper asks
   through its root chat, as its other approvals do.
5. **Turned off as any connector.** `web` is one of kvcoder's own connectors: `kvcoder.connectors.disabled` may name
   it, registering it fails `kvcoder/NAME_TAKEN`, and its index entry lists `fetch { url }`. Its card reads
   `Fetch <url>` and shows the Markdown.

## Consequences

- The agent reads a library's current documentation as text, not HTML, and the person sees each new site it reaches.
- A page behind a sign-in or built by JavaScript reads as what the server sends without a browser; the `mcp`
  connector's browser server remains the way to drive a page.
