---
'@kvman/kvcoder': minor
---

kvcoder's seventh own connector, `mcp`, reaches the tools of the MCP servers the person adds: `tools { server, tool? }` and `call { server, tool, arguments?, timeoutMs?, risky }`, which asks as a shell call does. The servers are the setting `kvcoder.mcp.servers` (a command, or a URL over Streamable HTTP), their variables' and headers' values are kvcoder's secrets, and a command is started for each call and its process tree killed when it ends. `kvcoder.mcp.server.check` says whether a server is ready, needs a sign-in, or failed, and the connectors list gains `mcp`'s cog and its servers dialog. New error codes: `kvcoder/MCP_SERVER_NOT_FOUND`, `kvcoder/MCP_CONNECT_FAILED`, and `kvcoder/MCP_SIGN_IN_NEEDED`. `mcp` is now a name no extension can register. New dependencies: `@modelcontextprotocol/sdk` and `cross-spawn` (ADR 0020).
