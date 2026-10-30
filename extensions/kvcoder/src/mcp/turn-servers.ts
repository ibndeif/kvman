import { mkdtemp, rm } from 'node:fs/promises';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProblemError, type Ctx, type Stored } from '@kvman/sdk';
import { delay } from '../delay.ts';
import type { McpSessionDoc } from '../schemas/mcp-session.ts';
import { now } from '../sessions/session-lookup.ts';
import { records } from '../store/collections.ts';
import type { TurnLink } from './connect.ts';
import { workspaceVariable, type McpServer } from './servers.ts';

// The servers a turn keeps for its life (plan 08 §8.5, ADR 0108, 12): a server over HTTP keeps its MCP session, and a
// command with a `port` is started once, through the kernel's process service, as an HTTP server on that port of this
// machine. The turn's calls join the same session, so a browser keeps its page; the turn's end stops them all.

const startWithinMs = 20_000;
const lookEveryMs = 200;

const processNameOf = (turnId: string, server: string): string => `mcp-${turnId}-${server}`;

// Whether something on this machine accepts a connection at `port`.
function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    const settle = (answered: boolean): void => { socket.destroy(); resolve(answered); };
    socket.once('connect', () => settle(true));
    socket.once('error', () => settle(false));
  });
}

async function record(ctx: Ctx, turnId: string, server: string): Promise<Stored<McpSessionDoc>> {
  const store = records(ctx.store).mcpSessions;
  return (await store.find({ turnId, server }, { limit: 1 }))[0] ?? store.insert({ turnId, server, mcpSessionId: null, processName: null, folder: null, createdAt: now() });
}

// Starts the turn's command server unless it runs, and waits until its port answers.
async function started(ctx: Ctx, doc: Stored<McpSessionDoc>, server: Extract<McpServer, { command: string }>, port: number): Promise<void> {
  const name = processNameOf(doc.turnId, server.name);
  if ((await ctx.processes.list()).some((process) => process.name === name)) return;
  const folder = doc.folder ?? (await mkdtemp(path.join(tmpdir(), 'kvman-mcp-')));
  await records(ctx.store).mcpSessions.update(doc.id, { processName: name, folder, mcpSessionId: null });
  // The secrets module loads the MCP SDK, which only an MCP call needs.
  const { serverSecrets } = await import('./secrets.ts');
  try {
    await ctx.processes.start(name, { command: server.command, args: server.args, cwd: folder, env: { [workspaceVariable]: ctx.job.workspace.path, ...(await serverSecrets(ctx, server)) } });
  } catch (error) {
    if (!(error instanceof ProblemError) || error.problem.code !== 'PROCESS_RUNNING') throw error;
  }
  for (const until = Date.now() + startWithinMs; Date.now() < until; await delay(lookEveryMs, ctx.job.signal)) {
    ctx.job.signal.throwIfAborted();
    if (await listening(port)) return;
  }
  throw new ProblemError({ code: 'kvcoder/MCP_CONNECT_FAILED', message: `The MCP server ${server.name} failed: nothing answered on port ${String(port)} within ${String(startWithinMs / 1000)} s`, params: { server: server.name, reason: 'not listening' } });
}

/** The turn's link to a kept server, or `undefined` for a command server without a port, which connects per call. */
export async function turnLink(ctx: Ctx, sessionId: string, server: McpServer): Promise<TurnLink | undefined> {
  const port = 'command' in server ? server.port : undefined;
  if ('command' in server && port === undefined) return undefined;
  const turnId = (await records(ctx.store).sessions.get(sessionId))?.turnId ?? null;
  if (turnId === null) return undefined;
  const doc = await record(ctx, turnId, server.name);
  if ('command' in server && port !== undefined) await started(ctx, doc, server, port);
  const current = (await records(ctx.store).mcpSessions.get(doc.id)) ?? doc;
  return {
    url: 'url' in server ? server.url : `http://127.0.0.1:${String(port)}/mcp`,
    sessionId: current.mcpSessionId,
    keep: async (mcpSessionId) => { await records(ctx.store).mcpSessions.update(doc.id, { mcpSessionId }); },
  };
}

/** Stops the servers a turn kept and forgets them, when the turn ends. */
export async function closeTurnServers(ctx: Ctx, turnId: string): Promise<void> {
  const store = records(ctx.store).mcpSessions;
  for (const doc of await store.find({ turnId }, { limit: 1000 })) {
    if (doc.processName !== null) {
      try {
        await ctx.processes.stop(doc.processName);
      } catch (error) {
        if (!(error instanceof ProblemError) || error.problem.code !== 'NOT_FOUND') throw error;
      }
    }
    if (doc.folder !== null) await rm(doc.folder, { recursive: true, force: true });
    await store.delete(doc.id);
  }
}
