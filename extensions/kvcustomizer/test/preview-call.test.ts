import { describe, expect, it } from 'vitest';
import { useKvcustomizer } from './support/kvcustomizer-kernel.ts';

const kvcustomizer = useKvcustomizer();

describe('calling the preview with none running (09 §9.3, ADR 0022, 14)', { timeout: 60_000 }, () => {
  it('QA34-E14 preview query-get and preview command-run fail NOT_FOUND', async () => {
    const { kernel } = await kvcustomizer.start();
    const notFound = { problem: { code: 'NOT_FOUND', message: 'No preview is running; start one with preview start.' } };
    await expect(kernel.exec('kvcustomizer.preview.query.get', { name: 'notes.greeting.get' })).rejects.toMatchObject(notFound);
    await expect(kernel.exec('kvcustomizer.preview.command.run', { name: 'notes.item.add', input: { text: 'Milk' } })).rejects.toMatchObject(notFound);
  });
});
