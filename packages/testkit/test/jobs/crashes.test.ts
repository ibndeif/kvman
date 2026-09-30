import { describe, expect, it } from 'vitest';
import { entry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const crash = {
  name: '@test/crash',
  namespace: 'crash',
  entry: entry(`
    const empty = { input: z.object({}), output: z.unknown(), public: true };
    ctx.registerQuery('crash.wait-get', { description: 'Waits a long time.', ...empty, handle: () => new Promise((resolve) => setTimeout(resolve, 60_000)) });
    ctx.registerCommand('crash.exit', { description: 'Ends its worker thread.', ...empty, handle: () => process.exit(1) });
    ctx.registerQuery('crash.ok-get', { description: 'Answers.', ...empty, handle: () => 'ok' });
  `),
};

describe('worker crashes (02 §2.2)', () => {
  it("M1.4-H6 a crashed worker's jobs fail WORKER_CRASHED, and a new worker takes over", async () => {
    const kernel = await harness.start([crash]);
    const waiting = kernel.exec('crash.wait-get', {});
    const exiting = kernel.exec('crash.exit', {});
    await expect(waiting).rejects.toMatchObject({ problem: { code: 'WORKER_CRASHED' } });
    await expect(exiting).rejects.toMatchObject({ problem: { code: 'WORKER_CRASHED' } });
    expect(await kernel.exec('crash.ok-get', {})).toBe('ok');
  });
});
