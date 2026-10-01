import { describe, expect, it } from 'vitest';
import { docTopics } from '../src/docs/register-docs.ts';
import { useKvdev } from './support/kvdev-kernel.ts';

const kvdev = useKvdev();

describe('docs get (09 §9.1, ADR 0009, 126)', { timeout: 30_000 }, () => {
  it('M2.5-E34 answers Markdown for each of the six topics, and another topic fails VALIDATION_FAILED', async () => {
    const world = await kvdev.start();
    expect(docTopics).toEqual(['sdk', 'views', 'components', 'i18n', 'connectors', 'presets']);
    for (const topic of docTopics) expect(await world.kernel.exec('kvdev.docs.get', { topic })).toMatch(/^# \S/);
    await expect(world.kernel.exec('kvdev.docs.get', { topic: 'secrets' } as never)).rejects.toEqual(expect.objectContaining({ problem: expect.objectContaining({ code: 'VALIDATION_FAILED' }) }));
  });
});
