import { ProblemError, z, type Ctx } from '@kvman/sdk';
import { wordSchema } from '../schemas/registry.ts';

// The MCP servers the person added (plan 08 §8.5, ADR 0020, 4, 6, and 9): the setting `kvcoder.mcp.servers`. A server
// is a command that speaks MCP on its standard input and output, or an address reached over Streamable HTTP. `env` and
// `headers` hold names only: each value is one of kvcoder's secrets.

const text = z.string().min(1);
const variableName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Use letters, digits, and _, not starting with a digit.');
const headerName = z.string().regex(/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/, 'Use the characters of an HTTP header name.');

function isHttpAddress(value: string): boolean {
  return URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol);
}

const commandServerSchema = z.strictObject({ name: wordSchema, description: text, command: text, args: z.array(z.string()), env: z.array(variableName) });
const urlServerSchema = z.strictObject({ name: wordSchema, description: text, url: z.string().refine(isHttpAddress, 'Give an http or https address.'), headers: z.array(headerName) });

/** One MCP server: a command, or an address. */
export const mcpServerSchema = z.union([commandServerSchema, urlServerSchema]);

/** The `kvcoder.mcp.servers` setting: each server has its own name. */
export const mcpServersSchema = z.array(mcpServerSchema).refine((servers) => new Set(servers.map((server) => server.name)).size === servers.length, 'Each server needs its own name.');

export type McpServer = z.output<typeof mcpServerSchema>;

/** The servers of the job's workspace, in the setting's order. */
export async function mcpServers(ctx: Ctx): Promise<McpServer[]> {
  return mcpServersSchema.parse(await ctx.settings.get('kvcoder.mcp.servers'));
}

/** One server by name, or `kvcoder/MCP_SERVER_NOT_FOUND` naming the ones there are. */
export async function mcpServer(ctx: Ctx, name: string): Promise<McpServer> {
  const servers = await mcpServers(ctx);
  const found = servers.find((server) => server.name === name);
  if (found !== undefined) return found;
  const names = servers.map((server) => server.name).join(', ');
  throw new ProblemError({ code: 'kvcoder/MCP_SERVER_NOT_FOUND', message: `There is no MCP server ${name}. ${names === '' ? 'No server is set up.' : `The servers are: ${names}.`}`, params: { server: name } });
}
