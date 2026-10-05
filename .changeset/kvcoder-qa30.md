---
'@kvman/kvcoder': minor
---

An MCP server reached at a URL can be signed in to with OAuth: `kvcoder.mcp.sign-in.start { name, redirectUrl }` gives the address to open, and the new page `kvcoder.mcp-sign-in` finishes with the sync-only `kvcoder.mcp.sign-in.finish { state, code }`. The client registration, code verifier, and tokens are kvcoder's secrets, a call refreshes expired tokens, and the server's row gains "Sign in" and "Sign out". New error code: `kvcoder/MCP_SIGN_IN_FAILED` (ADR 0020, 8, 11, and 16).
