import { afterEach, describe, expect, it } from 'vitest';
import { liveModel, newer, startFakeCatalog, type FakeCatalog } from './support/fake-catalog.ts';
import { useKvai } from './support/kvai-kernel.ts';

const kvai = useKvai();
const catalogs: FakeCatalog[] = [];
afterEach(async () => {
  for (const catalog of catalogs.splice(0)) await catalog.close();
});

const asKvai = { as: '@kvman/kvai' };
const builtInOpenai = 42;
const fourHours = 4 * 60 * 60 * 1000;

// kvai with the live catalog on, after the start's refresh, with `gpt-live` in openai's list.
async function started() {
  const catalog = await startFakeCatalog();
  catalogs.push(catalog);
  catalog.answer('openai', { status: 200, lastModified: newer, etag: '"v1"', body: [liveModel('openai', 'gpt-live')] });
  const world = await kvai.start({ settings: { 'kvai.catalog.url': catalog.url } });
  await world.kernel.clock.advance(0);
  return { ...world, catalog };
}

const openaiIds = async (kernel: Awaited<ReturnType<typeof started>>['kernel']) => (await kernel.exec('kvai.model.list', { provider: 'openai' })).map((model) => model.id);

describe('refreshing the live catalog (ADR 0110)', () => {
  it('M2.1-E29 a second refresh sends the ETag and keeps the list on 304; a 404 leaves the built-in list', async () => {
    const { kernel, catalog } = await started();
    catalog.answer('openai', { status: 304 });
    await kernel.exec('kvai.catalog.refresh', {}, asKvai);
    expect(catalog.requests().filter((request) => request.provider === 'openai').map((request) => request.ifNoneMatch)).toEqual([undefined, '"v1"']);
    expect(await openaiIds(kernel)).toContain('openai/gpt-live');
    catalog.answer('openai', { status: 404 });
    await kernel.exec('kvai.catalog.refresh', {}, asKvai);
    expect(await openaiIds(kernel)).not.toContain('openai/gpt-live');
    expect(await openaiIds(kernel)).toHaveLength(builtInOpenai);
  });

  it('M2.1-E30 a failing provider keeps its list, the others are saved, and the refresh fails PROVIDER_ERROR', async () => {
    const { kernel, catalog } = await started();
    catalog.answer('openai', { status: 500 });
    catalog.answer('groq', { status: 200, lastModified: newer, body: [liveModel('groq', 'live-g', { api: 'openai-completions' })] });
    await expect(kernel.exec('kvai.catalog.refresh', {}, asKvai)).rejects.toMatchObject({
      problem: { code: 'kvai/PROVIDER_ERROR', params: { provider: 'openai', reason: '500 Internal Server Error', transient: true } },
    });
    expect(await openaiIds(kernel)).toContain('openai/gpt-live');
    expect((await kernel.exec('kvai.model.list', { provider: 'groq' })).map((model) => model.id)).toContain('groq/live-g');
  });

  it('M2.1-E31 live models are built-in, the refresh runs every 4 hours, and null turns them off at once', async () => {
    const { kernel, catalog } = await started();
    await expect(kernel.exec('kvai.model.remove', { id: 'openai/gpt-live' })).rejects.toMatchObject({ problem: { code: 'kvai/BUILT_IN', params: { id: 'openai/gpt-live' } } });
    const openaiRequests = () => catalog.requests().filter((request) => request.provider === 'openai').length;
    expect(openaiRequests()).toBe(1);
    await kernel.clock.advance(fourHours);
    expect(openaiRequests()).toBe(2);
    await kernel.exec('kernel.settings.set', { key: 'kvai.catalog.url', value: null, scope: 'global' });
    expect(await openaiIds(kernel)).not.toContain('openai/gpt-live');
    await kernel.exec('kvai.catalog.refresh', {}, asKvai);
    expect(openaiRequests()).toBe(2);
  });
});
