import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { fixtureServer } from './mcp-fixture-server.ts';

// The fixture MCP server as a command that serves Streamable HTTP with sessions on the port it is given:
// `node mcp-fixture-http.ts <port>`. Each MCP session has its own fixture, so `remember` lasts as long as the session.

const port = Number(process.argv[2]);
const sessions = new Map<string, StreamableHTTPServerTransport>();

createServer((request, response) => {
  const known = sessions.get(String(request.headers['mcp-session-id'] ?? ''));
  if (known !== undefined) {
    void known.handleRequest(request, response);
    return;
  }
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { sessions.set(id, transport); } });
  void fixtureServer().connect(transport as Transport).then(() => transport.handleRequest(request, response));
}).listen(port, '127.0.0.1');
