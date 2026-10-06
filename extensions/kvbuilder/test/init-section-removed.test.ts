import { describe, expect, it } from 'vitest';
import { useKvbuilder } from './support/kvbuilder-kernel.ts';

const kvbuilder = useKvbuilder();

const guides = async (kernel: Awaited<ReturnType<typeof kvbuilder.start>>['kernel']) =>
  (await kernel.exec('kvcoder.section.list', {})).filter((section) => section.id === 'guide').map((section) => section.owner);

describe("kvbuilder removes the guide section that earlier versions stored (ADR 0023, 1)", { timeout: 30_000 }, () => {
  it("QA35-H9 and QA35-E4 a stored guide of kvbuilder is gone after a start, another extension's stays, and starting twice is harmless", async () => {
    const { kernel } = await kvbuilder.start();
    expect(await guides(kernel)).toEqual([]);
    await kernel.restart();
    await kernel.clock.advance(0);
    expect(await guides(kernel)).toEqual([]);
    const section = { id: 'guide', title: 'Guide', order: 20, global: true, content: 'old text' };
    await kernel.exec('kvcoder.section.set', section, { as: '@kvman/kvbuilder' });
    await kernel.exec('kvcoder.section.set', section, { as: '@kvman/kvai' });
    expect((await guides(kernel)).sort()).toEqual(['@kvman/kvai', '@kvman/kvbuilder']);
    await kernel.restart();
    await kernel.clock.advance(0);
    expect(await guides(kernel)).toEqual(['@kvman/kvai']);
  });
});
