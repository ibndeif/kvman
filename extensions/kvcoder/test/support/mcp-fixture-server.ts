import { spawn } from 'node:child_process';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// The MCP server the tests talk to: eight tools that each show one thing the `mcp` connector must handle.

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });
const noArguments = { type: 'object' as const, properties: {} };

const tools = [
  { name: 'echo', description: 'Returns the text it is given.', inputSchema: { type: 'object' as const, properties: { text: { type: 'string', description: 'The text to return.' } }, required: ['text'] } },
  { name: 'env', description: 'Returns one environment variable.', inputSchema: { type: 'object' as const, properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'fail', description: 'Reports an error.', inputSchema: noArguments },
  { name: 'picture', description: 'Returns a text and an image.', inputSchema: noArguments },
  { name: 'big', description: 'Returns 40 KB of text.', inputSchema: noArguments },
  { name: 'sleep', description: 'Answers after a while.', inputSchema: { type: 'object' as const, properties: { ms: { type: 'number' } }, required: ['ms'] } },
  { name: 'spawn', description: 'Starts a child process that keeps running, and returns both pids.', inputSchema: noArguments },
  { name: 'cwd', description: 'Returns the folder the server runs in.', inputSchema: noArguments },
];

/** The fixture's tool names, in its order. */
export const fixtureTools = tools.map((tool) => tool.name);

/** A new fixture server, to connect to a transport. */
export function fixtureServer(): Server {
  const server = new Server({ name: 'fixture', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const input = request.params.arguments ?? {};
    switch (request.params.name) {
      case 'echo':
        return text(String(input['text']));
      case 'env':
        return text(process.env[String(input['name'])] ?? '(unset)');
      case 'fail':
        return { ...text('The tool could not do that.'), isError: true };
      case 'picture':
        return { content: [{ type: 'text' as const, text: 'A picture:' }, { type: 'image' as const, data: 'AAAA', mimeType: 'image/png' }] };
      case 'big':
        return text(`START${'x'.repeat(40 * 1024)}END`);
      case 'sleep':
        await new Promise((resolve) => setTimeout(resolve, Number(input['ms'])));
        return text('awake');
      case 'spawn': {
        const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
        return text(JSON.stringify({ server: process.pid, child: child.pid }));
      }
      case 'cwd':
        return text(process.cwd());
      default:
        throw new Error(`Unknown tool ${request.params.name}.`);
    }
  });
  return server;
}
