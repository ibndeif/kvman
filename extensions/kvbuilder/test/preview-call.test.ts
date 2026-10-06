import { describe, expect, it } from 'vitest';
import { useKvbuilder } from './support/kvbuilder-kernel.ts';

const kvbuilder = useKvbuilder();

describe('calling the preview with none running (09 §9.3, ADR 0022, 14)', { timeout: 60_000 }, () => {
  it('QA34-E14 preview query-get and preview command-run fail NOT_FOUND', async () => {
    const { kernel } = await kvbuilder.start();
    const notFound = { problem: { code: 'NOT_FOUND', message: 'No preview is running; start one with preview start.' } };
    await expect(kernel.exec('kvbuilder.preview.query.get', { name: 'notes.greeting.get' })).rejects.toMatchObject(notFound);
    await expect(kernel.exec('kvbuilder.preview.command.run', { name: 'notes.item.add', input: { text: 'Milk' } })).rejects.toMatchObject(notFound);
  });
});
