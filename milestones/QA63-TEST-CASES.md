# QA 63 — `web fetch` (ADR 0095)

**Asked.** The kvcoder review of 2026-10-19 (`docs/reviews/kvcoder-review-2026-10-19.md`, item 13) found 45 `curl` and
`wget` lines bringing raw HTML into the context.

**The owner chose** the recommended options: `web fetch { url }` returning Markdown, `turndown` 7.2.4, no private
addresses, and the person asked once per host in a chat.

Paths are relative to the repository root.

## Happy path

- **QA63-H1 a page reads as Markdown.** *Given* a page with a heading, a link, code, a script, and a style, *then*
  `content` has the heading, link, and code as Markdown, and none of the script or style.
  `extensions/kvcoder/test/unit/web-page.test.ts`
- **QA63-H2 text types read as they are, and redirects are followed.** *Then* `text/plain` and `application/json` come
  back as sent, and a page reached after two redirects reports its last `url`. `extensions/kvcoder/test/unit/web-page.test.ts`
- **QA63-H3 the first fetch from a host asks, and an allowed host is remembered.** *Given* `auto`, *when* the model
  fetches `https://docs.example.test/a`, *then* it waits for approval; allowed, the chat's next fetch from that host
  runs at once. `extensions/kvcoder/test/web-fetch.test.ts`
- **QA63-H4 web is one of kvcoder's own connectors.** *Then* the index lists `web` with `fetch { url }`, registering
  `web` fails `kvcoder/NAME_TAKEN`, `kvcoder.connectors.disabled` can turn it off, and its card reads `Fetch <url>`.
  `extensions/kvcoder/test/web-fetch.test.ts`, `extensions/kvcoder/test/web/call-summary.test.ts`

## Edge cases

- **QA63-E1 private addresses are refused, also after a redirect.** *Then* `http://127.0.0.1:3737/`, a host that
  resolves to `10.0.0.5`, `169.254.169.254`, `::1`, `fc00::1`, and a redirect from a public host to a private one are
  refused `VALIDATION_FAILED`, and nothing is requested from them. `extensions/kvcoder/test/unit/web-page.test.ts`,
  `extensions/kvcoder/test/web-fetch.test.ts`
- **QA63-E2 bad addresses and types.** *Then* `ftp://` and an address with credentials fail `VALIDATION_FAILED`; an image
  type fails `VALIDATION_FAILED`; a 404 is an error result with its status; more than 5 redirects fail.
  `extensions/kvcoder/test/unit/web-page.test.ts`
- **QA63-E3 limits.** *Then* a body over 5 MB is cut at 5 MB and a long page's content is cut to its first and last
  15 KB. `extensions/kvcoder/test/unit/web-page.test.ts`
- **QA63-E4 never and read-only.** *Then* with `never` no fetch asks; a read-only helper fetches from a host its chat
  allowed and is refused another. `extensions/kvcoder/test/web-fetch.test.ts`
