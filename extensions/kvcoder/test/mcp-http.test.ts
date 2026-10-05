import { afterEach, describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { fixtureTools } from './support/mcp-fixture-server.ts';
import { setServers, startHttpFixture, startStatusServer, type HttpFixture } from './support/mcp-servers.ts';
import { command, runs, says, toolResults, type RunCallSpec } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();
const servers: HttpFixture[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
});

async function run(url: string, commands: readonly RunCallSpec[]) {
  const { kernel, fake } = await kvcoder.start();
  await setServers(kernel, [{ name: 'remote', description: 'Over HTTP.', url, headers: [] }]);
  const sessionId = await newSession(kernel);
  fake.reply(runs(...commands), says('ok'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  return { results: toolResults(fake), kernel };
}

const echo = command('mcp', 'call', { server: 'remote', tool: 'echo', arguments: { text: 'over http' }, risky: false });

describe('the mcp connector over Streamable HTTP (08 §8.5, ADR 0020, 4)', { timeout: 60_000 }, () => {
  it('QA29-H4 a server over HTTP lists its tools and runs one', async () => {
    const fixture = await startHttpFixture();
    servers.push(fixture);
    const { results, kernel } = await run(fixture.url, [command('mcp', 'tools', { server: 'remote' }), echo]);
    expect(JSON.parse(String(results[0]))).toMatchObject({ server: 'remote', tools: fixtureTools.map((name) => ({ name })) });
    expect(results[1]).toBe('over http');
    expect(await kernel.exec('kvcoder.mcp.server.check', { name: 'remote' })).toEqual({ status: 'ready', tools: fixtureTools.length });
  });

  it('QA29-E16 a server that cannot be reached fails kvcoder/MCP_CONNECT_FAILED, and one that answers 401 needs a sign-in', async () => {
    const gone = await startStatusServer(200);
    await gone.close();
    const down = await run(gone.url, [echo]);
    expect(down.results[0]).toMatch(/^error kvcoder\/MCP_CONNECT_FAILED: The MCP server remote failed: /);
    expect(await down.kernel.exec('kvcoder.mcp.server.check', { name: 'remote' })).toMatchObject({ status: 'failed', problem: { code: 'kvcoder/MCP_CONNECT_FAILED', params: { server: 'remote' } } });

    const locked = await startStatusServer(401);
    servers.push(locked);
    const refused = await run(locked.url, [echo]);
    expect(refused.results[0]).toBe("error kvcoder/MCP_SIGN_IN_NEEDED: The MCP server remote needs the person to sign in, on Coder's page under Extensions.");
    expect(await refused.kernel.exec('kvcoder.mcp.server.check', { name: 'remote' })).toEqual({ status: 'signInNeeded' });
  });
});
