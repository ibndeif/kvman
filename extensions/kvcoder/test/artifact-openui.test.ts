import { describe, expect, it } from 'vitest';
import type { Json } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI, FakeReply } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

type World = { kernel: TestKernel; fake: FakeOpenAI; sessionId: string; seen: number };

const dashboard = ['root = Stack([title, done])', 'title = CardHeader("Release", "Status")', 'done = TextContent("12 open")'].join('\n');

async function started(settings?: Record<string, Json>): Promise<World> {
  const { kernel, fake } = await kvcoder.start(settings === undefined ? {} : { settings });
  return { kernel, fake, sessionId: await newSession(kernel), seen: 0 };
}

// One turn: the model's replies, then the printed results of this turn's calls.
async function turn(world: World, ...replies: readonly FakeReply[]): Promise<string[]> {
  for (const reply of replies) world.fake.reply(reply);
  await world.kernel.exec('kvcoder.message.send', { sessionId: world.sessionId, text: 'go' });
  await world.kernel.clock.advance(0);
  const all = toolResults(world.fake);
  const fresh = all.slice(world.seen);
  world.seen = all.length;
  return fresh;
}

const stored = (world: World, id: string) => world.kernel.exec('kvcoder.artifact.get', { sessionId: world.sessionId, id });

describe('openui artifacts (08 §8.5, ADR 0124, 13, 17)', { timeout: 30_000 }, () => {
  it('M5.18-H17 an artifact written with format openui is stored as openui and read back whole', async () => {
    const world = await started();
    const results = await turn(world, runs(command('artifact', 'write', { id: 'dash', title: 'Dashboard', format: 'openui', content: dashboard })), runs(command('artifact', 'get', { id: 'dash' })), says('ok'));
    expect(JSON.parse(results[0] ?? '{}')).toMatchObject({ id: 'dash', version: 1, created: true });
    expect(JSON.parse(results[1] ?? '{}')).toEqual({ id: 'dash', title: 'Dashboard', format: 'openui', version: 1, content: dashboard });
    expect(await stored(world, 'dash')).toMatchObject({ id: 'dash', format: 'openui', version: 1, content: dashboard });
    expect((await world.kernel.exec('kvcoder.artifact.list', { sessionId: world.sessionId })).map((artifact) => artifact.format)).toEqual(['openui']);
  });

  it('M5.18-E20 with openui turned off, an openui artifact is refused and nothing is stored, and one written before stays', async () => {
    const world = await started();
    await turn(world, runs(command('artifact', 'write', { id: 'before', title: 'Before', format: 'openui', content: dashboard })), says('ok'));
    await world.kernel.exec('kernel.settings.set', { key: 'kvcoder.connectors.disabled', value: ['openui'], scope: 'global' });
    const results = await turn(world, runs(command('artifact', 'write', { id: 'after', title: 'After', format: 'openui', content: dashboard })), says('ok'));
    expect(results).toEqual(['error VALIDATION_FAILED: The openui connector is turned off.']);
    expect((await world.kernel.exec('kvcoder.artifact.list', { sessionId: world.sessionId })).map((artifact) => artifact.id)).toEqual(['before']);
    expect(await stored(world, 'before')).toMatchObject({ format: 'openui', content: dashboard });
  });

  it('M5.18-E21 content that reads as OpenUI, written with no format, is Markdown', async () => {
    const world = await started();
    await turn(world, runs(command('artifact', 'write', { id: 'guess', title: 'Guess', content: 'root = Card([body])\nbody = TextContent("hi")' })), says('ok'));
    expect(await stored(world, 'guess')).toMatchObject({ format: 'markdown' });
  });

  it("M5.18-E22 artifact edit keeps an openui artifact's format and applies the edit", async () => {
    const world = await started();
    await turn(world, runs(command('artifact', 'write', { id: 'dash', title: 'Dashboard', format: 'openui', content: dashboard })), says('ok'));
    const results = await turn(world, runs(command('artifact', 'edit', { id: 'dash', edits: [{ oldText: '12 open', newText: '9 open' }] })), says('ok'));
    expect(JSON.parse(results[0] ?? '{}')).toMatchObject({ id: 'dash', version: 2, replacements: 1 });
    expect(await stored(world, 'dash')).toMatchObject({ format: 'openui', version: 2, content: dashboard.replace('12 open', '9 open') });
  });
});
