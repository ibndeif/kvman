---
'@kvman/kvcoder': minor
---

`mcp run { server, steps, timeoutMs?, risky }` calls up to 20 tools of an MCP server on one connection, in order, so a server that keeps state between tools, such as a browser, keeps it for the run. `mcp tools { server }` gives each tool's `takes`, its arguments as a signature. The lead plans on the execution map only after it understood, looked, and clarified, with steps that are deliverables; a new file and a change to its own file are not risky; it deletes temporary files at the end, and tries a page's main actions with one run when it has a browser A command MCP server now runs in a temporary folder of its own, deleted with the connection, and reads the workspace folder from `KVMAN_WORKSPACE`, so what it writes beside itself never lands in the project (ADR 0070).
