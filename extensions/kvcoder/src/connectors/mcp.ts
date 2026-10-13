import { z, type Ctx } from '@kvman/sdk';
import { callTimeout } from '../calls/shell-command.ts';
import { mcpServer, type McpServer } from '../mcp/servers.ts';
import { payloadSignature } from '../connector-call.ts';
import { listTools, resultText, toolNamed } from '../mcp/tools.ts';
import { callInput, type ConnectorCommand } from './connector-command.ts';
import { timeoutMs } from './payload-fields.ts';

// The `mcp` connector (plan 08 §8.5, ADR 0020, 3, 7, and 10): the tools of the MCP servers the person added. `tools`
// lists a server's tools or gives one tool's arguments; `call` runs a tool, after the person's approval when it is risky;
// `run` runs several on one connection, so a server that keeps state between tools keeps it for the run (ADR 0070, 1).
// The MCP client is loaded by the first call that connects, so a kvman with no server doesn't keep it in memory.

/** What the prompt's index says the connector is for; the session's entry adds its servers. */
export const mcpDescription =
  'Tools from the MCP servers the person added. Call tools with { "server" } to see what a server offers and what each tool takes; ask for one tool with { "server", "tool" } only when you need its full schema. Each call starts the server and closes it, so a server that keeps state between tools, such as a browser, keeps it only inside one run: put the tools that belong together (open the page, fill, click, read) in one run.';

/** The connector's description with the workspace's servers, as the prompt's index shows it. */
export function mcpIndexDescription(servers: readonly McpServer[]): string {
  return `${mcpDescription} Servers: ${servers.map((server) => `${server.name} (${server.description.replace(/[.\s]+$/, '')})`).join(', ')}.`;
}

const server = z.string().min(1).describe('The MCP server, by the name the system prompt lists.');
const risky = z.boolean().describe('true when the tool could change, delete, or send something that isn\'t your own work: creating or closing an issue, sending a message, writing to a database. The person is asked first. false for a tool that only reads.');

/** The tools one run calls at most. */
export const runStepsLimit = 20;

const payloads = {
  tools: z.strictObject({ server, tool: z.string().min(1).describe("One tool to describe with its arguments' JSON Schema; every tool's name and description when left out.").exactOptional() }),
  call: z.strictObject({
    server,
    tool: z.string().min(1).describe('The tool to call, by its name from tools.'),
    arguments: z.record(z.string(), z.json()).describe("The tool's arguments, as its JSON Schema from tools asks; leave it out for a tool that takes none.").exactOptional(),
    timeoutMs,
    risky,
  }),
  run: z.strictObject({
    server,
    steps: z
      .array(z.strictObject({ tool: z.string().min(1).describe('The tool to call, by its name from tools.'), arguments: z.record(z.string(), z.json()).describe("The tool's arguments; leave it out for a tool that takes none.").exactOptional() }))
      .min(1)
      .max(runStepsLimit)
      .describe('The tools to call on one connection, in order; the run stops at the first one that reports an error.'),
    timeoutMs,
    risky,
  }),
};

export const mcpCommands = {
  tools: { registration: 'kvcoder.mcp.tool.describe', description: "Lists an MCP server's tools, or gives one tool's description and arguments.", payload: payloads.tools, asks: false },
  call: { registration: 'kvcoder.mcp.tool.call', description: "Calls one tool of an MCP server and returns the tool's text.", payload: payloads.call, asks: true, result: "the tool's text." },
  run: { registration: 'kvcoder.mcp.steps.run', description: 'Calls several tools of an MCP server on one connection, in order, so the server keeps its state between them; stops at the first tool that reports an error.', payload: payloads.run, asks: true, result: "each step's text under ## <n>. <tool>, and [stopped: N steps not run] when a tool reported an error." },
} satisfies Record<string, ConnectorCommand>;

/** What `kvcoder.mcp.tool.call` gives: the tool's text, and whether the tool says it failed. */
export const mcpCallSchema = z.object({ text: z.string(), isError: z.boolean() });

const toolRowSchema = z.object({ name: z.string(), description: z.string() });
// A list says what each tool takes (ADR 0070, 2), so one call is enough to use a server's tools.
const describeOutput = z.union([z.object({ server: z.string(), tools: z.array(toolRowSchema.extend({ takes: z.string() })) }), toolRowSchema.extend({ server: z.string(), arguments: z.json() })]);

// The jobs may run for the call's longest timeout, with room to report it.
const jobOptions = { retries: 0, timeoutMs: 660_000 };

export function registerMcpConnector(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.mcp.tool.describe', {
    description: mcpCommands.tools.description,
    input: callInput(payloads.tools),
    output: describeOutput,
    ...jobOptions,
    handle: async ({ payload }) => {
      const found = await mcpServer(ctx, payload.server);
      const { withServer } = await import('../mcp/connect.ts');
      const tools = await withServer(ctx, found, callTimeout(undefined), listTools);
      if (payload.tool === undefined) return { server: found.name, tools: tools.map((tool) => ({ name: tool.name, description: tool.description ?? '', takes: payloadSignature(tool.inputSchema) ?? '{}' })) };
      const tool = toolNamed(found.name, tools, payload.tool);
      return { server: found.name, name: tool.name, description: tool.description ?? '', arguments: tool.inputSchema };
    },
  });
  ctx.registerCommand('kvcoder.mcp.tool.call', {
    description: mcpCommands.call.description,
    input: callInput(payloads.call),
    output: mcpCallSchema,
    ...jobOptions,
    handle: async ({ payload }) => {
      const found = await mcpServer(ctx, payload.server);
      const { withServer } = await import('../mcp/connect.ts');
      const result = await withServer(ctx, found, callTimeout(payload.timeoutMs), async (connection) => {
        toolNamed(found.name, await listTools(connection), payload.tool);
        return resultText(await connection.client.callTool({ name: payload.tool, arguments: payload.arguments ?? {} }, undefined, connection.request));
      });
      // Read after the call, which may have refreshed the tokens: no secret kvman holds for the server leaves in a result (ADR 0056, 9).
      const { knownSecrets, withoutSecrets } = await import('../mcp/secrets.ts');
      return { ...result, text: withoutSecrets(result.text, await knownSecrets(ctx, found)) };
    },
  });
  ctx.registerCommand('kvcoder.mcp.steps.run', {
    description: mcpCommands.run.description,
    input: callInput(payloads.run),
    output: mcpCallSchema,
    ...jobOptions,
    handle: async ({ payload }) => {
      const found = await mcpServer(ctx, payload.server);
      const { withServer } = await import('../mcp/connect.ts');
      const result = await withServer(ctx, found, callTimeout(payload.timeoutMs), async (connection) => {
        const tools = await listTools(connection);
        for (const step of payload.steps) toolNamed(found.name, tools, step.tool);
        const parts: string[] = [];
        for (const [index, step] of payload.steps.entries()) {
          const done = resultText(await connection.client.callTool({ name: step.tool, arguments: step.arguments ?? {} }, undefined, connection.request));
          parts.push(`## ${String(index + 1)}. ${step.tool}\n${done.text}`);
          if (!done.isError) continue;
          const left = payload.steps.length - index - 1;
          if (left > 0) parts.push(`[stopped: ${String(left)} ${left === 1 ? 'step' : 'steps'} not run]`);
          return { text: parts.join('\n\n'), isError: true };
        }
        return { text: parts.join('\n\n'), isError: false };
      });
      const { knownSecrets, withoutSecrets } = await import('../mcp/secrets.ts');
      return { ...result, text: withoutSecrets(result.text, await knownSecrets(ctx, found)) };
    },
  });
}
