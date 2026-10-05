import { randomUUID } from 'node:crypto';
import { ProblemError, type Ctx } from '@kvman/sdk';
import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import { invalid } from '../problems.ts';
import { records } from '../store/collections.ts';
import { oauthProvider, oauthSecrets } from './oauth-provider.ts';
import { mcpServer } from './servers.ts';

// Signing in to an MCP server (plan 08 §8.5, ADR 0020, 8, 11, and 16). `start` registers kvman with the server when it
// hasn't yet and gives the address to open; the server sends the browser back to kvcoder's sign-in page, which calls
// `finish` with the code. A started sign-in is kept in the global store for 10 minutes, so finishing needs no workspace.

const signInLifeMs = 10 * 60_000;

// A job id is a UUIDv7: its first 48 bits are the kernel's clock in milliseconds, so a sign-in's age follows that clock.
const jobTime = (ctx: Ctx): number => Number.parseInt(ctx.job.id.replaceAll('-', '').slice(0, 12), 16);
const redirectPath = '/kvcoder/mcp-sign-in';

/** Whether an address is kvcoder's sign-in page on this computer: nothing else may receive a code. */
export function isSignInPage(address: string): boolean {
  if (!URL.canParse(address)) return false;
  const url = new URL(address);
  return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === redirectPath && url.search === '' && url.hash === '' && url.username === '' && url.password === '';
}

const failed = (error: unknown): ProblemError => {
  const reason = error instanceof Error ? error.message : String(error);
  return new ProblemError({ code: 'kvcoder/MCP_SIGN_IN_FAILED', message: `The sign-in failed: ${reason}`, params: { reason } });
};

/** Starts a sign-in and gives the address the person opens. */
export async function startSignIn(ctx: Ctx, name: string, redirectUrl: string): Promise<{ url: string }> {
  if (!isSignInPage(redirectUrl)) throw invalid(`The redirect address must be http://127.0.0.1:<port>${redirectPath}, or the same on localhost.`);
  const server = await mcpServer(ctx, name);
  if (!('url' in server)) throw invalid(`${name} runs as a command; only a server reached at a URL is signed in to.`, { server: name });
  // Whatever was left of an earlier sign-in would be used in place of a new one.
  await ctx.secrets.delete(oauthSecrets(name).tokens);
  const state = randomUUID();
  let opened: URL | undefined;
  try {
    await auth(oauthProvider(ctx, name, { redirectUrl, step: 'start', state, open: (authorizationUrl) => void (opened = authorizationUrl) }), { serverUrl: server.url });
  } catch (error) {
    if (error instanceof ProblemError || ctx.job.signal.aborted) throw error;
    throw failed(error);
  }
  if (opened === undefined) throw failed(new Error('the server gave no address to sign in at'));
  await records(ctx.store).signIns.insert({ state, server: name, url: server.url, redirectUrl, at: jobTime(ctx) });
  return { url: opened.href };
}

/** Finishes a started sign-in with the code the server sent back, and stores the tokens. */
export async function finishSignIn(ctx: Ctx, state: string, code: string): Promise<{ name: string }> {
  const { signIns } = records(ctx.store);
  for (const old of await signIns.find({}, { limit: 1000 })) if (old.at < jobTime(ctx) - signInLifeMs) await signIns.delete(old.id);
  const [started] = await signIns.find({ state }, { limit: 1 });
  if (started === undefined) throw failed(new Error('it was not started here, was already finished, or took more than 10 minutes'));
  await signIns.delete(started.id);
  try {
    const result = await auth(oauthProvider(ctx, started.server, { redirectUrl: started.redirectUrl, step: 'finish' }), { serverUrl: started.url, authorizationCode: code });
    if (result !== 'AUTHORIZED') throw new Error('the server did not accept the code');
  } catch (error) {
    if (error instanceof ProblemError || ctx.job.signal.aborted) throw error;
    throw failed(error);
  } finally {
    await ctx.secrets.delete(oauthSecrets(started.server).verifier);
  }
  return { name: started.server };
}
