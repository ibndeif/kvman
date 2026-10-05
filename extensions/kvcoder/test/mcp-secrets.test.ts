import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { commandEntry, setServers, startHttpFixture, type HttpFixture } from './support/mcp-servers.ts';
import { command, runs, says, toolResults, type RunCallSpec } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();
const servers: HttpFixture[] = [];
const token = 'tok-7f3a9c-SECRET';

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
});

const secret = (kernel: TestKernel, name: string) => kernel.exec('kernel.secrets.set', { extension: '@kvman/kvcoder', name, value: token });

async function turn(kernel: TestKernel, fake: Awaited<ReturnType<typeof kvcoder.start>>['fake'], commands: readonly RunCallSpec[]): Promise<string[]> {
  const sessionId = await newSession(kernel);
  fake.reply(runs(...commands), says('ok'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  return toolResults(fake);
}

const readEnv = (server: string) => command('mcp', 'call', { server, tool: 'env', arguments: { name: 'TOKEN' }, risky: false });

describe("an MCP server's secrets (08 §8.5, ADR 0020, 6)", { timeout: 60_000 }, () => {
  it('QA29-H5 a secret reaches the command and the HTTP server, and is in no setting, job row, or log', async () => {
    const fixture = await startHttpFixture();
    servers.push(fixture);
    const { kernel, fake } = await kvcoder.start();
    await setServers(kernel, [commandEntry('demo', ['TOKEN']), { name: 'remote', description: 'Over HTTP.', url: fixture.url, headers: ['Authorization'] }]);
    await secret(kernel, 'mcp.demo.env.TOKEN');
    await secret(kernel, 'mcp.remote.header.Authorization');
    const results = await turn(kernel, fake, [readEnv('demo'), command('mcp', 'call', { server: 'remote', tool: 'echo', arguments: { text: 'x' }, risky: false })]);
    expect(results).toEqual([token, 'x']);
    expect(fixture.headers.every((headers) => headers.authorization === token)).toBe(true);
    expect(fixture.headers.length).toBeGreaterThan(0);

    expect(JSON.stringify(await kernel.exec('kernel.settings.list', {}))).not.toContain(token);
    const jobs = await kernel.exec('kernel.jobs.list', { limit: 1000 });
    expect(JSON.stringify(jobs.map((job) => job.input))).not.toContain(token);
    expect(readFileSync(path.join(kernel.home, 'logs', 'kvman.log'), 'utf8')).not.toContain(token);
    expect(readFileSync(path.join(kernel.home, 'secrets.json'), 'utf8')).toContain(token);
  });

  it('QA29-E17 a secret a failing command prints is taken out of the reason', async () => {
    const { kernel, fake } = await kvcoder.start();
    const script = path.join(kernel.homeFolder, 'leak.mjs');
    writeFileSync(script, "console.error(`cannot start with ${process.env.TOKEN}`);\nprocess.exit(3);\n");
    await setServers(kernel, [{ name: 'demo', description: 'Leaks.', command: process.execPath, args: [script], env: ['TOKEN'] }]);
    await secret(kernel, 'mcp.demo.env.TOKEN');
    const [result = ''] = await turn(kernel, fake, [readEnv('demo')]);
    expect(result).toMatch(/^error kvcoder\/MCP_CONNECT_FAILED: /);
    expect(result).toContain('cannot start with ***');
    expect(result).not.toContain(token);
    const check = await kernel.exec('kvcoder.mcp.server.check', { name: 'demo' });
    expect(JSON.stringify(check)).not.toContain(token);
  });

  it('QA29-E18 a variable without a secret is left out of the environment', async () => {
    const { kernel, fake } = await kvcoder.start();
    await setServers(kernel, [commandEntry('demo', ['TOKEN'])]);
    expect(await turn(kernel, fake, [readEnv('demo')])).toEqual(['(unset)']);
  });
});
