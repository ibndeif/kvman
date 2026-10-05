import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { fixtureServer } from './mcp-fixture-server.ts';

// The fixture MCP server as a command: `node mcp-fixture.ts`.
await fixtureServer().connect(new StdioServerTransport());
