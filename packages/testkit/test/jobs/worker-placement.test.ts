import { describe, expect, it } from 'vitest';
import { entry, gateEntry, openGate, useHarness } from '../extension-folders.ts';

const harness = useHarness();

// `place.hold` waits at its gate and returns its worker's thread id; `place.thread-get` returns it at once.
const place = {
  name: '@test/place',
  namespace: 'place',
  entry: `import { threadId } from 'node:worker_threads';\n${entry(`${gateEntry}
  ctx.registerCommand('place.hold', { description: 'Waits at a gate.', input: z.object({ gate: z.string() }), output: z.number(), public: true,
    handle: async (input) => { await gate(input.gate); return threadId; } });
  ctx.registerQuery('place.thread-get', { description: 'Returns its thread.', input: z.object({}), output: z.number(), public: true, handle: () => threadId });`)}`,
};

describe('where a job runs (02 §2.2, ADR 0088, 2)', () => {
  it('QA56-H2 a job goes to the least-busy worker', async () => {
    const kernel = await harness.start([place], { settings: { 'kernel.workers': 2 } });
    const held = openGate('place-h2');
    const holding = kernel.exec('place.hold', { gate: 'place-h2' });
    await held.waiting;
    const other = await kernel.exec('place.thread-get', {});
    held.release();
    expect(other).not.toBe(await holding);
  });

  it('QA56-H3 a tie goes to the earliest started worker', async () => {
    const kernel = await harness.start([place], { settings: { 'kernel.workers': 2 } });
    const first = await kernel.exec('place.thread-get', {});
    expect(await kernel.exec('place.thread-get', {})).toBe(first);
  });

  it('QA56-E6 placement never exceeds the concurrency', async () => {
    const kernel = await harness.start([place], { settings: { 'kernel.workers': 2, 'kernel.workerConcurrency': 1 } });
    const [first, second] = [openGate('place-e6a'), openGate('place-e6b')];
    const holdingFirst = kernel.exec('place.hold', { gate: 'place-e6a' });
    await first.waiting;
    const holdingSecond = kernel.exec('place.hold', { gate: 'place-e6b' });
    await second.waiting;
    const third = kernel.exec('place.thread-get', {});
    second.release();
    const freed = await holdingSecond;
    expect(await third).toBe(freed);
    first.release();
    expect(await holdingFirst).not.toBe(freed);
  });
});
