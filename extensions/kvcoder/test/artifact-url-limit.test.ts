import { createServer, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

// At 20 artifacts a new url artifact replaces the oldest url artifact nothing answers on (plan 08 §8.5, ADR 0108, 18).

const kvcoder = useKvcoder();
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))); });

// A port something listens on, and one nothing does.
async function listening(): Promise<number> {
  const server = createServer();
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return typeof address === 'object' && address !== null ? address.port : 0;
}
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  return typeof address === 'object' && address !== null ? address.port : 0;
}

async function fullChat(urls: readonly number[]) {
  const { kernel, fake } = await kvcoder.start();
  const sessionId = await newSession(kernel);
  const writes = [
    ...urls.map((port, index) => command('artifact', 'write', { id: `app-${String(index)}`, title: 'App', format: 'url', content: `http://127.0.0.1:${String(port)}/` })),
    ...Array.from({ length: 20 - urls.length }, (_, index) => command('artifact', 'write', { id: `note-${String(index)}`, title: 'Note', content: 'text' })),
  ];
  fake.reply(...writes.map((write) => runs(write)), says('full'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'fill it' });
  await kernel.clock.advance(0);
  return { kernel, fake, sessionId };
}

async function writeOne(world: Awaited<ReturnType<typeof fullChat>>, content: string, format: 'url' | 'markdown') {
  world.fake.reply(runs(command('artifact', 'write', { id: 'new-one', title: 'New', format, content })), says('ok'));
  await world.kernel.exec('kvcoder.message.send', { sessionId: world.sessionId, text: 'one more' });
  await world.kernel.clock.advance(0);
  return toolResults(world.fake).at(-1) ?? '';
}

describe('the artifact limit and ended url artifacts (ADR 0108, 18)', { timeout: 60_000 }, () => {
  it('QA71-H31 a new url artifact replaces the oldest url artifact nothing answers on', async () => {
    const world = await fullChat([await listening(), await closedPort(), await closedPort()]);
    const result = JSON.parse(await writeOne(world, `http://127.0.0.1:${String(await listening())}/`, 'url'));
    expect(result).toEqual({ id: 'new-one', version: 1, created: true, bytes: expect.any(Number), replaced: 'app-1' });
    const ids = (await world.kernel.exec('kvcoder.artifact.list', { sessionId: world.sessionId })).map((artifact: { id: string }) => artifact.id);
    expect(ids).toHaveLength(20);
    expect(ids).toContain('app-0');
    expect(ids).toContain('app-2');
    expect(ids).not.toContain('app-1');
  });

  it('QA71-E30 with every url artifact answering, or for a markdown artifact, the limit holds', async () => {
    const world = await fullChat([await listening()]);
    expect(await writeOne(world, `http://127.0.0.1:${String(await listening())}/`, 'url')).toMatch(/^error TOO_LARGE: This chat already has 20 artifacts\./);
    const ended = await fullChat([await closedPort()]);
    expect(await writeOne(ended, 'text', 'markdown')).toMatch(/^error TOO_LARGE: This chat already has 20 artifacts\./);
  });
});
