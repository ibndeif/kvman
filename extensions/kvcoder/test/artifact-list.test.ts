import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI, FakeReply } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { delegated } from './support/helpers.ts';

const kvcoder = useKvcoder();

type World = { kernel: TestKernel; fake: FakeOpenAI; helperFake: FakeOpenAI; sessionId: string; seen: number };

async function started(): Promise<World> {
  const { kernel, fake, helperFake } = await kvcoder.start();
  return { kernel, fake, helperFake, sessionId: await newSession(kernel), seen: 0 };
}

// A turn of the session: the replies the model gives, then the printed results of its calls in this turn (the model's
// last request holds every earlier turn's results too).
async function turn(world: World, text: string, ...replies: readonly FakeReply[]): Promise<string[]> {
  for (const reply of replies) world.fake.reply(reply);
  await world.kernel.exec('kvcoder.message.send', { sessionId: world.sessionId, text });
  await world.kernel.clock.advance(0);
  const all = toolResults(world.fake);
  const fresh = all.slice(world.seen);
  world.seen = all.length;
  return fresh;
}

const json = (text: string): unknown => JSON.parse(text);

// The `artifact` connector's `list` (08 §8.5, ADR 0123, 1): the chat's artifacts, newest change first.
describe('the artifact list command (08 §8.5, ADR 0123, 1)', { timeout: 30_000 }, () => {
  it("QA80-H1 artifact list names the chat's artifacts", async () => {
    const world = await started();
    await turn(world, 'first', runs(command('artifact', 'write', { id: 'b', title: 'B', content: 'one' })), says('one'));
    await turn(world, 'second', runs(command('artifact', 'write', { id: 'a', title: 'A', content: 'two' })), says('two'));
    await turn(world, 'third', runs(command('artifact', 'edit', { id: 'b', edits: [{ oldText: 'one', newText: 'uno' }] })), says('three'));
    const results = await turn(world, 'fourth', runs(command('artifact', 'list', {})), says('four'));
    const rows = json(results[0] ?? '') as { id: string; title: string; format: string; version: number; updatedAt: string }[];
    expect(rows.map((row) => row.id)).toEqual(['b', 'a']);
    expect(rows.map((row) => Object.keys(row).sort())).toEqual([
      ['format', 'id', 'title', 'updatedAt', 'version'],
      ['format', 'id', 'title', 'updatedAt', 'version'],
    ]);
    expect(rows).toEqual([
      expect.objectContaining({ id: 'b', title: 'B', format: 'markdown', version: 2 }),
      expect.objectContaining({ id: 'a', title: 'A', format: 'markdown', version: 1 }),
    ]);
    for (const row of rows) expect(row.updatedAt).toEqual(expect.any(String));
  });

  it("QA80-E1 a subagent lists its chat's artifacts", async () => {
    const world = await started();
    await delegated(
      world,
      world.sessionId,
      [
        runs(command('artifact', 'write', { id: 'review', title: 'Review', content: 'looks good' })),
        runs(command('delegate', 'run', { worker: 'general', title: 'Helper', kind: 'check', goal: 'Review', done: 'It is done.' })),
        says('Started.'),
        says('parent done'),
      ],
      [runs(command('artifact', 'list', {})), says('child done')],
    );
    const rows = json(toolResults(world.helperFake)[0] ?? '');
    expect(rows).toEqual([expect.objectContaining({ id: 'review', title: 'Review', format: 'markdown', version: 1 })]);
  });

  it('QA80-E2 an empty chat lists nothing', async () => {
    const world = await started();
    const results = await turn(world, 'go', runs(command('artifact', 'list', {})), says('ok'));
    expect(json(results[0] ?? '')).toEqual([]);
  });

  it('QA80-E3 list takes no payload fields', async () => {
    const world = await started();
    const results = await turn(world, 'go', runs(command('artifact', 'list', { id: 'x' })), says('ok'));
    expect(results[0]).toMatch(/^error VALIDATION_FAILED: /);
  });

  it('QA80-E4 help shows list', async () => {
    const world = await started();
    const results = await turn(world, 'go', runs(command('artifact', 'help')), says('ok'));
    expect(results[0]).toContain('\n  list ');
  });
});
