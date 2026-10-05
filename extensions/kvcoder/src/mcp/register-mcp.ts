import { ProblemError, z, type Ctx } from '@kvman/sdk';
import { userOnly } from '../sessions/session-lookup.ts';
import { mcpServer } from './servers.ts';
import { listTools } from './tools.ts';

// What kvcoder's configuration asks about an MCP server (plan 08 §8.6, ADR 0020, 11 and 14): its state is checked when
// the dialog shows it, and never stored; and the person signs in to it from its row.

/** How long a check gives a server to start and list its tools. */
const checkTimeoutMs = 30_000;

const problemSchema = z.object({ code: z.string(), message: z.string(), params: z.record(z.string(), z.json()).exactOptional() });
const checkOutput = z.union([z.object({ status: z.literal('ready'), tools: z.number().int() }), z.object({ status: z.literal('signInNeeded') }), z.object({ status: z.literal('failed'), problem: problemSchema })]);

export function registerMcp(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.mcp.server.check', {
    description: 'Connects to one MCP server of kvcoder.mcp.servers and says whether it is ready, with how many tools, needs a sign-in, or failed.',
    input: z.strictObject({ name: z.string().min(1) }),
    output: checkOutput,
    public: true,
    retries: 0,
    handle: async ({ name }) => {
      const server = await mcpServer(ctx, name);
      const { withServer } = await import('./connect.ts');
      try {
        return { status: 'ready' as const, tools: (await withServer(ctx, server, checkTimeoutMs, listTools)).length };
      } catch (error) {
        if (!(error instanceof ProblemError) || ctx.job.signal.aborted) throw error;
        if (error.problem.code === 'kvcoder/MCP_SIGN_IN_NEEDED') return { status: 'signInNeeded' as const };
        if (error.problem.code === 'kvcoder/MCP_CONNECT_FAILED') return { status: 'failed' as const, problem: problemSchema.parse(error.problem) };
        throw error;
      }
    },
  });
  ctx.registerCommand('kvcoder.mcp.sign-in.start', {
    description: "Starts the person's sign-in to an MCP server reached at a URL, and gives the address to open in the browser.",
    input: z.strictObject({ name: z.string().min(1), redirectUrl: z.string().min(1) }),
    output: z.object({ url: z.string() }),
    public: true,
    retries: 0,
    handle: async ({ name, redirectUrl }) => {
      userOnly(ctx, 'kvcoder.mcp.sign-in.start');
      const { startSignIn } = await import('./sign-in.ts');
      return startSignIn(ctx, name, redirectUrl);
    },
  });
  ctx.registerCommand('kvcoder.mcp.sign-in.finish', {
    description: 'Finishes a started sign-in with the code the server sent back, and stores the tokens as secrets.',
    input: z.strictObject({ state: z.string().min(1), code: z.string().min(1) }),
    output: z.object({ name: z.string() }),
    public: true,
    retries: 0,
    syncOnly: true,
    handle: async ({ state, code }) => {
      userOnly(ctx, 'kvcoder.mcp.sign-in.finish');
      const { finishSignIn } = await import('./sign-in.ts');
      return finishSignIn(ctx, state, code);
    },
  });
}
