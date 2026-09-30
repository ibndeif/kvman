import { describe, expect, it } from 'vitest';
import { idSchema } from '@kvman/sdk';
import { entry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const logs = {
  name: '@test/logs',
  namespace: 'logs',
  entry: entry(`
    ctx.log.info('loaded');
    ctx.registerCommand('logs.write', { description: 'Logs a line.', input: z.object({}), output: z.object({}), public: true,
      handle: () => { ctx.log.warn('handled', { count: 1 }); return {}; } });
  `),
};

describe('ctx.log (03 §3.5)', () => {
  it('M1.4-H7 log lines carry the extension, and the job id inside a handler', async () => {
    const kernel = await harness.start([logs]);
    await kernel.exec('logs.write', {});
    const lines = harness.logLines(kernel);
    const handled = lines.find((line) => line['msg'] === 'handled');
    expect(handled).toMatchObject({ extension: '@test/logs', count: 1, level: 40 });
    expect(idSchema.safeParse(handled?.['jobId']).success).toBe(true);
    const loaded = lines.find((line) => line['msg'] === 'loaded');
    expect(loaded).toMatchObject({ extension: '@test/logs' });
    expect(loaded).not.toHaveProperty('jobId');
  });
});
