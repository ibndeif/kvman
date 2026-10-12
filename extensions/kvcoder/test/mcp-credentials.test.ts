import { afterEach, describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { startOAuthFixture, type OAuthFixture } from './support/mcp-oauth-fixture.ts';
import { setServers } from './support/mcp-servers.ts';
import { command, runs, says, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();
const fixtures: OAuthFixture[] = [];
const redirectUrl = 'http://127.0.0.1:3737/kvcoder/mcp-sign-in';
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.close();
});
async function fixture(): Promise<OAuthFixture> {
  const started = await startOAuthFixture();
  fixtures.push(started);
  return started;
}
const remote = (url: string, headers: string[] = []) => ({ name: 'remote', description: 'Needs a sign-in.', url, headers });
const start = async (kernel: TestKernel) => (await kernel.exec('kvcoder.mcp.sign-in.start', { name: 'remote', redirectUrl })).url;
const stateOf = (url: string) => String(new URL(url).searchParams.get('state'));
const secretNames = async (kernel: TestKernel): Promise<string[]> => (await kernel.exec('kernel.secrets.list', {})).map((secret) => secret.name).sort();
async function signIn(kernel: TestKernel, server: OAuthFixture): Promise<void> {
  const url = await start(kernel);
  await kernel.exec('kvcoder.mcp.sign-in.finish', { state: stateOf(url), code: server.approve(url) });
}
async function echo(kernel: TestKernel, fake: Awaited<ReturnType<typeof kvcoder.start>>['fake'], text: string): Promise<string | undefined> {
  const sessionId = await newSession(kernel);
  fake.reply(runs(command('mcp', 'call', { server: 'remote', tool: 'echo', arguments: { text }, risky: false })), says('ok'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  return toolResults(fake).at(-1);
}

describe('MCP credentials belong to their destination (KVC-32, ADR 0056)', { timeout: 60_000 }, () => {
  it('M2.4-E174 a server whose URL changed gets no token of the old one', async () => {
    const { kernel, fake } = await kvcoder.start();
    const [first, other] = [await fixture(), await fixture()];
    await setServers(kernel, [remote(first.url)]);
    await signIn(kernel, first);
    expect(await echo(kernel, fake, 'hello')).toBe('hello');
    await setServers(kernel, [remote(other.url)]);
    expect(await echo(kernel, fake, 'hello')).toMatch(/^error kvcoder\/MCP_SIGN_IN_NEEDED:/);
    expect(await kernel.exec('kvcoder.mcp.server.check', { name: 'remote' })).toEqual({ status: 'signInNeeded' });
    expect(other.bearers.filter((bearer) => bearer !== '')).toEqual([]);
    expect(other.requests.length).toBeGreaterThan(0);
    await setServers(kernel, [remote(first.url)]);
    expect(await echo(kernel, fake, 'back')).toBe('back');
  });

  it('M2.4-E175 each sign-in has its own verifier, and a finished one closes the others', async () => {
    const { kernel } = await kvcoder.start();
    const server = await fixture();
    await setServers(kernel, [remote(server.url)]);
    const [early, late] = [await start(kernel), await start(kernel)];
    expect(await secretNames(kernel)).toEqual(['mcp.remote.oauth.client', `mcp.remote.oauth.verifier.${stateOf(early)}`, `mcp.remote.oauth.verifier.${stateOf(late)}`].sort());
    expect(await kernel.exec('kvcoder.mcp.sign-in.finish', { state: stateOf(late), code: server.approve(late) })).toEqual({ name: 'remote' });
    await expect(kernel.exec('kvcoder.mcp.sign-in.finish', { state: stateOf(early), code: server.approve(early) })).rejects.toMatchObject({ problem: { code: 'kvcoder/MCP_SIGN_IN_FAILED' } });
    expect(await secretNames(kernel)).toEqual(['mcp.remote.oauth.client', 'mcp.remote.oauth.tokens']);
    expect(await kernel.exec('kvcoder.mcp.server.check', { name: 'remote' })).toMatchObject({ status: 'ready' });
  });

  it("M2.4-E176 a tool's result never carries a secret kvman holds for the server", async () => {
    const { kernel, fake } = await kvcoder.start();
    const server = await fixture();
    await setServers(kernel, [remote(server.url, ['X-Key'])]);
    await kernel.exec('kernel.secrets.set', { extension: '@kvman/kvcoder', name: 'mcp.remote.header.X-Key', value: 'header-VALUE-77' });
    await signIn(kernel, server);
    const token = String(server.bearers.at(-1) ?? 'Bearer access-1-SECRET').replace('Bearer ', '');
    expect(await echo(kernel, fake, `key header-VALUE-77, token ${token || 'access-1-SECRET'}, and plain text`)).toBe('key ***, token ***, and plain text');
  });
});
