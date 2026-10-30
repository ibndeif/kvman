import { randomUUID } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { TestKernel } from '@kvman/testkit';
import { fixtureServer } from './mcp-fixture-server.ts';

// The fixture MCP server as the tests set it up: a command server's entry, and the same server on 127.0.0.1.

const fixtureFile = fileURLToPath(new URL('./mcp-fixture.ts', import.meta.url));

export type CommandEntry = { name: string; description: string; command: string; args: string[]; env: string[]; port?: number };
export type UrlEntry = { name: string; description: string; url: string; headers: string[] };

/** The fixture as a command server's entry. */
export function commandEntry(name = 'demo', env: string[] = []): CommandEntry {
  return { name, description: 'A demo server.', command: process.execPath, args: [fixtureFile], env };
}

const httpFixtureFile = fileURLToPath(new URL('./mcp-fixture-http.ts', import.meta.url));

/** The fixture as a command that serves HTTP on `port`, kept for a turn (ADR 0108, 12). */
export function keptEntry(port: number, name = 'kept'): CommandEntry {
  return { name, description: 'A demo server kept for the turn.', command: process.execPath, args: [httpFixtureFile, String(port)], env: [], port };
}

/** The fixture served over Streamable HTTP with sessions, each with its own state. */
export async function startSessionFixture(): Promise<HttpFixture> {
  const headers: IncomingHttpHeaders[] = [];
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const server = createServer((request, response) => {
    headers.push(request.headers);
    const known = transports.get(String(request.headers['mcp-session-id'] ?? ''));
    if (known !== undefined) {
      void known.handleRequest(request, response);
      return;
    }
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports.set(id, transport); } });
    void fixtureServer().connect(transport as Transport).then(() => transport.handleRequest(request, response));
  });
  return { url: await listening(server), headers, close: closing(server) };
}

/** A port nothing listens on now. */
export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/** Sets `kvcoder.mcp.servers`. */
export function setServers(kernel: TestKernel, servers: readonly (CommandEntry | UrlEntry)[], scope: 'global' | 'workspace' = 'global'): Promise<unknown> {
  return kernel.exec('kernel.settings.set', { key: 'kvcoder.mcp.servers', value: [...servers], scope });
}

export type HttpFixture = { url: string; headers: IncomingHttpHeaders[]; close(): Promise<void> };

async function listening(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/mcp`;
}

const closing = (server: Server) => (): Promise<void> =>
  new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });

/** The fixture served over Streamable HTTP, one stateless connection per request; it records each request's headers. */
export async function startHttpFixture(): Promise<HttpFixture> {
  const headers: IncomingHttpHeaders[] = [];
  const server = createServer((request, response) => {
    headers.push(request.headers);
    // With no session id generator the transport is stateless.
    const transport = new StreamableHTTPServerTransport({});
    response.on('close', () => void transport.close());
    void fixtureServer()
      .connect(transport as Transport)
      .then(() => transport.handleRequest(request, response));
  });
  return { url: await listening(server), headers, close: closing(server) };
}

/** A server that answers every request with a status and nothing else. */
export async function startStatusServer(status: number): Promise<HttpFixture> {
  const server = createServer((_request, response) => response.writeHead(status).end());
  return { url: await listening(server), headers: [], close: closing(server) };
}
