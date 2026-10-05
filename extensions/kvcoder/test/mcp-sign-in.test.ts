import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { startOAuthFixture, type OAuthFixture } from './support/mcp-oauth-fixture.ts';
import { commandEntry, setServers } from './support/mcp-servers.ts';
import { command, runs, says, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();
const fixtures: OAuthFixture[] = [];
const redirectUrl = 'http://127.0.0.1:3737/kvcoder/mcp-sign-in';

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.close();
});

async function world(options: { registration?: boolean } = {}) {
  const fixture = await startOAuthFixture(options);
  fixtures.push(fixture);
  const started = await kvcoder.start();
  await setServers(started.kernel, [{ name: 'remote', description: 'Needs a sign-in.', url: fixture.url, headers: [] }, commandEntry()]);
  return { ...started, fixture };
}

const start = (kernel: TestKernel, name = 'remote', redirect = redirectUrl) => kernel.exec('kvcoder.mcp.sign-in.start', { name, redirectUrl: redirect });

async function signIn(kernel: TestKernel, fixture: OAuthFixture): Promise<void> {
  const { url } = await start(kernel);
  await kernel.exec('kvcoder.mcp.sign-in.finish', { state: String(new URL(url).searchParams.get('state')), code: fixture.approve(url) });
}

const secretNames = async (kernel: TestKernel): Promise<string[]> => (await kernel.exec('kernel.secrets.list', {})).map((secret) => secret.name).sort();

async function echo(kernel: TestKernel, fake: Awaited<ReturnType<typeof world>>['fake']): Promise<string | undefined> {
  const sessionId = await newSession(kernel);
  fake.reply(runs(command('mcp', 'call', { server: 'remote', tool: 'echo', arguments: { text: 'signed in' }, risky: false })), says('ok'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  return toolResults(fake)[0];
}

const failed = { problem: { code: 'kvcoder/MCP_SIGN_IN_FAILED' } };

describe('signing in to an MCP server (08 §8.5, ADR 0020, 8, 11, and 16)', { timeout: 60_000 }, () => {
  it('QA30-H1 start registers kvman with the server and gives its authorization address; the registration and verifier are secrets', async () => {
    const { kernel, fixture } = await world();
    expect(await kernel.exec('kvcoder.mcp.server.check', { name: 'remote' })).toEqual({ status: 'signInNeeded' });
    const url = new URL((await start(kernel)).url);
    expect(`${url.origin}${url.pathname}`).toBe(fixture.url.replace('/mcp', '/authorize'));
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ client_id: 'client-1', redirect_uri: redirectUrl, response_type: 'code', code_challenge_method: 'S256' });
    expect(url.searchParams.get('state')).toMatch(/^[0-9a-f-]{36}$/);
    expect(url.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(fixture.requests).toContain('POST /register');
    expect(await secretNames(kernel)).toEqual(['mcp.remote.oauth.client', 'mcp.remote.oauth.verifier']);
  });

  it('QA30-H2 and QA30-H3 finish stores the tokens, the server is ready, and a call carries the access token', async () => {
    const { kernel, fake, fixture } = await world();
    const { url } = await start(kernel);
    const state = String(new URL(url).searchParams.get('state'));
    expect(await kernel.exec('kvcoder.mcp.sign-in.finish', { state, code: fixture.approve(url) })).toEqual({ name: 'remote' });
    expect(await secretNames(kernel)).toEqual(['mcp.remote.oauth.client', 'mcp.remote.oauth.tokens']);
    expect(await kernel.exec('kvcoder.mcp.server.check', { name: 'remote' })).toEqual({ status: 'ready', tools: 8 });
    expect(await echo(kernel, fake)).toBe('signed in');
    expect(fixture.bearers.at(-1)).toBe('Bearer access-1-SECRET');
  });

  it('QA30-H4 tokens the server no longer takes are refreshed during a call', async () => {
    const { kernel, fake, fixture } = await world();
    await signIn(kernel, fixture);
    fixture.expire();
    const before = fixture.requests.filter((request) => request === 'POST /token').length;
    expect(await echo(kernel, fake)).toBe('signed in');
    expect(fixture.requests.filter((request) => request === 'POST /token')).toHaveLength(before + 1);
    expect(fixture.bearers.at(-1)).toBe('Bearer access-2-SECRET');
    expect(readFileSync(path.join(kernel.home, 'secrets.json'), 'utf8')).toContain('refresh-2-SECRET');
  });

  it('QA30-H5 the tokens and the code are only in secrets.json', async () => {
    const { kernel, fake, fixture } = await world();
    await signIn(kernel, fixture);
    await echo(kernel, fake);
    const jobs = JSON.stringify((await kernel.exec('kernel.jobs.list', { limit: 1000 })).map((job) => [job.input, job.output]));
    const elsewhere = [JSON.stringify(await kernel.exec('kernel.settings.list', {})), jobs, readFileSync(path.join(kernel.home, 'logs', 'kvman.log'), 'utf8')].join('\n');
    for (const secret of ['access-1-SECRET', 'refresh-1-SECRET', 'code-1']) expect(elsewhere, secret).not.toContain(secret);
    expect(readFileSync(path.join(kernel.home, 'secrets.json'), 'utf8')).toContain('access-1-SECRET');
  });

  it("QA30-E1 the redirect address must be kvcoder's sign-in page on this computer", async () => {
    const { kernel } = await world();
    const refused = ['https://evil.example/kvcoder/mcp-sign-in', 'http://127.0.0.1:3737/other', 'http://127.0.0.1.evil.example/kvcoder/mcp-sign-in', 'http://127.0.0.1:3737/kvcoder/mcp-sign-in?x=1', 'https://127.0.0.1:3737/kvcoder/mcp-sign-in', 'http://user@127.0.0.1:3737/kvcoder/mcp-sign-in', 'not an address'];
    for (const address of refused) await expect(start(kernel, 'remote', address), address).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    expect(await secretNames(kernel)).toEqual([]);
    for (const address of ['http://127.0.0.1:41000/kvcoder/mcp-sign-in', 'http://localhost:3737/kvcoder/mcp-sign-in']) expect((await start(kernel, 'remote', address)).url, address).toContain(encodeURIComponent(address));
  });

  it('QA30-E2 only a server reached at a URL is signed in to', async () => {
    const { kernel } = await world();
    await expect(start(kernel, 'demo')).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    await expect(start(kernel, 'nope')).rejects.toMatchObject({ problem: { code: 'kvcoder/MCP_SERVER_NOT_FOUND' } });
  });

  it('QA30-E3 a server that registers no client fails kvcoder/MCP_SIGN_IN_FAILED with the reason', async () => {
    const { kernel } = await world({ registration: false });
    await expect(start(kernel)).rejects.toMatchObject({ problem: { code: 'kvcoder/MCP_SIGN_IN_FAILED', params: { reason: expect.stringMatching(/registration/i) as unknown } } });
  });

  it('QA30-E4 a state that was never started, was already used, or is older than 10 minutes fails, and stores no tokens', async () => {
    const { kernel, fixture } = await world();
    const finish = (state: string, code: string) => kernel.exec('kvcoder.mcp.sign-in.finish', { state, code });
    await expect(finish('never-started', 'code-1')).rejects.toMatchObject(failed);
    const first = await start(kernel);
    const state = String(new URL(first.url).searchParams.get('state'));
    await kernel.clock.advance(10 * 60_000 + 1);
    await expect(finish(state, fixture.approve(first.url))).rejects.toMatchObject(failed);
    expect(await secretNames(kernel)).not.toContain('mcp.remote.oauth.tokens');
    const second = await start(kernel);
    const again = String(new URL(second.url).searchParams.get('state'));
    await finish(again, fixture.approve(second.url));
    await expect(finish(again, 'code-9')).rejects.toMatchObject(failed);
  });

  it('QA30-E5 a code the server refuses fails, and the server still needs a sign-in', async () => {
    const { kernel } = await world();
    const { url } = await start(kernel);
    await expect(kernel.exec('kvcoder.mcp.sign-in.finish', { state: String(new URL(url).searchParams.get('state')), code: 'wrong' })).rejects.toMatchObject(failed);
    expect(await secretNames(kernel)).toEqual(['mcp.remote.oauth.client']);
    expect(await kernel.exec('kvcoder.mcp.server.check', { name: 'remote' })).toEqual({ status: 'signInNeeded' });
  });

  it('QA30-E6 finish is sync only, and both commands are for the person', async () => {
    const { kernel } = await world();
    await expect(kernel.execAsync('kvcoder.mcp.sign-in.finish', { state: 's', code: 'c' })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    await expect(kernel.exec('kvcoder.mcp.sign-in.finish', { state: 's', code: 'c' }, { as: '@test/todo' })).rejects.toMatchObject({ problem: { code: 'NOT_PUBLIC' } });
    await expect(kernel.exec('kvcoder.mcp.sign-in.start', { name: 'remote', redirectUrl }, { as: '@test/todo' })).rejects.toMatchObject({ problem: { code: 'NOT_PUBLIC' } });
  });

  it('QA30-E7 tokens that cannot be refreshed need a new sign-in, and a call opens and stores nothing for one', async () => {
    const { kernel, fake, fixture } = await world();
    await signIn(kernel, fixture);
    fixture.expire({ refresh: false });
    expect(await echo(kernel, fake)).toBe("error kvcoder/MCP_SIGN_IN_NEEDED: The MCP server remote needs the person to sign in, on Coder's page under Extensions.");
    expect(await kernel.exec('kvcoder.mcp.server.check', { name: 'remote' })).toEqual({ status: 'signInNeeded' });
    expect(await secretNames(kernel)).toEqual(['mcp.remote.oauth.client']);
    expect(fixture.requests.filter((request) => request === 'POST /register')).toHaveLength(1);
  });

  it('QA30-E8 a call to a server that was never signed in to asks its authorization server nothing', async () => {
    const { kernel, fake, fixture } = await world();
    expect(await echo(kernel, fake)).toMatch(/^error kvcoder\/MCP_SIGN_IN_NEEDED: /);
    expect(fixture.requests.filter((request) => !request.endsWith(' /mcp'))).toEqual([]);
    expect(await secretNames(kernel)).toEqual([]);
  });
});
