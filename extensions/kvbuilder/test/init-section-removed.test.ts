import { describe, expect, it } from 'vitest';
import { useKvcustomizer } from './support/kvcustomizer-kernel.ts';

const kvcustomizer = useKvcustomizer();

const guides = async (kernel: Awaited<ReturnType<typeof kvcustomizer.start>>['kernel']) =>
  (await kernel.exec('kvcoder.section.list', {})).filter((section) => section.id === 'guide').map((section) => section.owner);

describe("kvcustomizer removes the guide section that earlier versions stored (ADR 0023, 1)", { timeout: 30_000 }, () => {
  it("QA35-H9 and QA35-E4 a stored guide of kvcustomizer is gone after a start, another extension's stays, and starting twice is harmless", async () => {
    const { kernel } = await kvcustomizer.start();
    expect(await guides(kernel)).toEqual([]);
    await kernel.restart();
    await kernel.clock.advance(0);
    expect(await guides(kernel)).toEqual([]);
    const section = { id: 'guide', title: 'Guide', order: 20, global: true, content: 'old text' };
    await kernel.exec('kvcoder.section.set', section, { as: '@kvman/kvcustomizer' });
    await kernel.exec('kvcoder.section.set', section, { as: '@kvman/kvai' });
    expect((await guides(kernel)).sort()).toEqual(['@kvman/kvai', '@kvman/kvcustomizer']);
    await kernel.restart();
    await kernel.clock.advance(0);
    expect(await guides(kernel)).toEqual(['@kvman/kvai']);
  });
});
