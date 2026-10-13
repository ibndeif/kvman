import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, fsCall, runs, says, shell, toolResults, type RunCallSpec } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();
const task = (id: string, after: string[] = []) => ({ id, title: `Do ${id}`, description: `How ${id} is done`, ...(after.length === 0 ? {} : { after }), check: `check ${id}` });
const set = (...tasks: ReturnType<typeof task>[]): RunCallSpec => command('execution-map', 'set', { goal: 'Ship it', steps: tasks });
const update = (...steps: Record<string, string>[]): RunCallSpec => command('execution-map', 'update', { steps });
const done = (id: string) => ({ id, status: 'done', evidence: 'pnpm test passed, 12 of 12' });
const write = (path: string): RunCallSpec => fsCall('write', { path, content: 'x\n' });
const reminder = (left: number): string => `\n\n[kvman: the execution map has ${left} unfinished ${left === 1 ? 'step' : 'steps'} and none is marked doing. Mark the step this work belongs to with execution-map update, or set the map again when the plan changed.]`;

// The results the model read for a reply of `calls`, made after the replies `before`.
async function lastResults(calls: readonly RunCallSpec[], ...before: RunCallSpec[][]) {
  const world = await kvcoder.start();
  const sessionId = await newSession(world.kernel);
  world.fake.reply(...before.map((reply) => runs(...reply)), runs(...calls), says('ok'));
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await world.kernel.clock.advance(0);
  return { ...world, sessionId, results: toolResults(world.fake).slice(-calls.length) };
}

describe('the reminder that keeps the execution map live (08 §8.5; ADR 0074, 6 and 7)', { timeout: 30_000 }, () => {
  it('M2.4-E273 and E278 a change made while no step is marked doing is told so, in the text the model reads and not on the card', async () => {
    const { kernel, sessionId, results } = await lastResults([write('a.txt')], [set(task('store'), task('page'))]);
    expect(results).toHaveLength(1);
    expect(results[0]?.endsWith(reminder(2))).toBe(true);
    const listed = JSON.stringify(await kernel.exec('kvcoder.message.list', { sessionId, limit: 20 }));
    expect(listed).toContain('"output":');
    expect(listed.match(/"details":\{[^}]*kvman: the execution map/)).toBeNull();

    const one = await lastResults([write('a.txt')], [set(task('store'))]);
    expect(one.results[0]?.endsWith(reminder(1))).toBe(true);
  });

  it('M2.4-E274 no line with a step doing, a finished map, no map, a reply that tends the map, only reads, or a failed change', async () => {
    const quiet = async (...replies: Parameters<typeof lastResults>): Promise<void> => {
      const { results } = await lastResults(...replies);
      expect(results.length).toBeGreaterThan(0);
      for (const text of results) expect(text).not.toContain('kvman: the execution map');
    };
    await quiet([write('a.txt')], [set(task('store'), task('page'))], [update({ id: 'store', status: 'doing' })]);
    await quiet([write('a.txt')], [set(task('store'))], [update(done('store'))]);
    await quiet([write('a.txt')]);
    await quiet([update({ id: 'store', status: 'doing' }), write('a.txt'), update(done('store'))], [set(task('store'), task('page'))]);
    await quiet([fsCall('list', { path: '.' })], [set(task('store'))]);
    const failed = await lastResults([write('../outside.txt')], [set(task('store'))]);
    expect(failed.results[0]).toContain('VALIDATION_FAILED');
    expect(failed.results[0]).not.toContain('kvman: the execution map');
  });

  it('M2.4-E275 of several changes in one reply, only the last carries the line', async () => {
    const { results } = await lastResults([write('a.txt'), write('b.txt'), shell('echo hi')], [set(task('store'), task('page'))]);
    expect(results.map((text) => text.includes('kvman: the execution map'))).toEqual([false, false, true]);
    expect(results[2]?.endsWith(reminder(2))).toBe(true);
  });
});
