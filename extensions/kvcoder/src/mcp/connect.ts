import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProblemError, type Ctx } from '@kvman/sdk';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { OAuthError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { commandTransport, type CommandTransport } from './command-transport.ts';
import { oauthProvider, registeredRedirect } from './oauth-provider.ts';
import { serverSecrets, withoutSecrets } from './secrets.ts';
import { workspaceVariable, type McpServer } from './servers.ts';

// One connection to an MCP server (plan 08 §8.5, ADR 0020, 4): connect, do the work, close. A server over HTTP, or a
// command run with a `port`, is reached through its turn's link (ADR 0108, 12): the call joins the MCP session the turn
// keeps, and closing ends only this call's stream. Otherwise nothing is kept between calls. The connection ends with
// the job's signal and at the timeout, and a command's process tree is killed then.
// A command runs in a folder of its own that is deleted with the connection (ADR 0070, 7), so the logs and snapshots a
// server writes beside itself never land in the person's project; it finds the project in `KVMAN_WORKSPACE`.

export { workspaceVariable } from './servers.ts';

/** What the work gets: the connected client, and the options every request of this connection takes. */
export type Connection = { client: Client; request: RequestOptions };

type Opened = { transport: Transport; command?: CommandTransport; folder?: string };

/** A turn's hold on a server: the address its calls reach, the MCP session they share, and how to keep a new one. */
export type TurnLink = { url: string; sessionId: string | null; keep(sessionId: string | null): Promise<void> };

async function open(ctx: Ctx, server: McpServer, secrets: Record<string, string>, link?: TurnLink): Promise<Opened> {
  if (link !== undefined && 'command' in server) {
    // The command runs for the turn, with the server's variables; nothing secret goes in a request.
    const resumed = link.sessionId === null ? {} : { sessionId: link.sessionId };
    return { transport: new StreamableHTTPClientTransport(new URL(link.url), resumed) as Transport };
  }
  if ('command' in server) {
    const folder = await mkdtemp(path.join(tmpdir(), 'kvman-mcp-'));
    const command = commandTransport({ command: server.command, args: server.args, cwd: folder, env: { [workspaceVariable]: ctx.job.workspace.path, ...secrets } });
    return { transport: command, command, folder };
  }
  // The client's class declares `sessionId` as `string | undefined`, which its own `Transport` doesn't take under
  // `exactOptionalPropertyTypes`; it is the transport the client is written for.
  // A server the person signed in to is called with its tokens, which are refreshed when they have expired.
  const redirectUrl = await registeredRedirect(ctx, server.name, server.url);
  const signedIn = redirectUrl === undefined ? {} : { authProvider: oauthProvider(ctx, server.name, server.url, { redirectUrl, step: 'call' }) };
  const resumed = link === undefined || link.sessionId === null ? {} : { sessionId: link.sessionId };
  const transport: Transport = new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: secrets }, ...signedIn, ...resumed }) as Transport;
  return { transport };
}

// The server refused the call for lack of a sign-in it takes: no tokens, or tokens it no longer refreshes.
const isUnauthorized = (error: unknown): boolean => error instanceof UnauthorizedError || error instanceof OAuthError || (error instanceof StreamableHTTPError && error.code === 401);

// Why a connection failed, for the person and the model: the error's message, then the last of what a command wrote
// to its error output, with every secret value taken out.
function failure(server: McpServer, error: unknown, opened: Opened, secrets: Record<string, string>, timedOutAfterMs: number | undefined): ProblemError {
  if (isUnauthorized(error)) return new ProblemError({ code: 'kvcoder/MCP_SIGN_IN_NEEDED', message: `The MCP server ${server.name} needs the person to sign in, on Coder's page under Extensions.`, params: { server: server.name } });
  const said = timedOutAfterMs === undefined ? (error instanceof Error ? error.message : String(error)) : `it didn't answer within ${Math.ceil(timedOutAfterMs / 1000)} s`;
  const reason = withoutSecrets([said, opened.command?.errorOutput() ?? ''].filter((part) => part !== '').join('\n'), secrets);
  return new ProblemError({ code: 'kvcoder/MCP_CONNECT_FAILED', message: `The MCP server ${server.name} failed: ${reason}`, params: { server: server.name, reason } });
}

/** Connects to a server, through `link` for a kept one, runs `work`, and closes the connection; a failure is a Problem with the reason. */
export async function withServer<Result>(ctx: Ctx, server: McpServer, timeoutMs: number, work: (connection: Connection) => Promise<Result>, link?: TurnLink): Promise<Result> {
  const secrets = await serverSecrets(ctx, server);
  const { version } = await ctx.exec('kernel.health.get', {});
  const opened = await open(ctx, server, secrets, link);
  const deadline = AbortSignal.timeout(timeoutMs);
  const request: RequestOptions = { signal: AbortSignal.any([ctx.job.signal, deadline]), timeout: timeoutMs, maxTotalTimeout: timeoutMs };
  const client = new Client({ name: 'kvman', version });
  try {
    await client.connect(opened.transport, request);
    if (link !== undefined && opened.transport.sessionId !== link.sessionId) await link.keep(opened.transport.sessionId ?? null);
    return await work({ client, request });
  } catch (error) {
    if (error instanceof ProblemError || ctx.job.signal.aborted) throw error;
    // A kept session whose connection failed is made again at the next call.
    if (link !== undefined) await link.keep(null);
    throw failure(server, error, opened, secrets, deadline.aborted ? timeoutMs : undefined);
  } finally {
    await client.close();
    if (opened.folder !== undefined) await rm(opened.folder, { recursive: true, force: true });
  }
}
