import { afterEach, describe, expect, it } from 'vitest';
import { groqRoute, liveModel, newer, older, openrouterRoute, startFakeCatalog, type FakeCatalog } from './support/fake-catalog.ts';
import { useKvai, userSays } from './support/kvai-kernel.ts';

const kvai = useKvai();
const catalogs: FakeCatalog[] = [];
afterEach(async () => {
  for (const catalog of catalogs.splice(0)) await catalog.close();
});

async function fakeCatalog(): Promise<FakeCatalog> {
  const catalog = await startFakeCatalog();
  catalogs.push(catalog);
  return catalog;
}

const builtInOpenai = 42;
const asKvai = { as: '@kvman/kvai' };
const ids = (models: readonly { id: string }[]) => models.map((model) => model.id);

describe('new models from the live catalog (ADR 0110)', () => {
  it('M2.1-E24 with kvai.catalog.url at its default there is no catalog job and only the built-in list', async () => {
    const { kernel } = await kvai.start();
    await kernel.clock.advance(4 * 60 * 60 * 1000);
    const jobs = await kernel.exec('kernel.jobs.list', { limit: 100 });
    expect(jobs.map((job) => job.name)).not.toContain('kvai.catalog.refresh');
    expect(await kernel.exec('kvai.catalog.refresh', {}, asKvai)).toEqual({});
    expect(await kernel.exec('kvai.model.list', { provider: 'openai' })).toHaveLength(builtInOpenai);
  });

  it("M2.1-E25 the start's refresh adds a new model and renames a built-in one, keeping the rest", async () => {
    const catalog = await fakeCatalog();
    catalog.answer('openai', { status: 200, lastModified: newer, etag: '"v1"', body: [liveModel('openai', 'gpt-live'), liveModel('openai', 'gpt-5.6-terra', { name: 'GPT-5.6 Terra Live' })] });
    const { kernel } = await kvai.start({ settings: { 'kvai.catalog.url': catalog.url } });
    await kernel.clock.advance(0);
    const openai = await kernel.exec('kvai.model.list', { provider: 'openai' });
    expect(openai).toHaveLength(builtInOpenai + 1);
    expect(openai).toContainEqual(expect.objectContaining({ id: 'openai/gpt-live', name: 'Live gpt-live', provider: 'openai', builtIn: true, contextWindow: 272_000 }));
    expect(openai).toContainEqual(expect.objectContaining({ id: 'openai/gpt-5.6-terra', name: 'GPT-5.6 Terra Live' }));
    expect(ids(openai)).toContain('openai/gpt-5.5');
    expect(await kernel.exec('kvai.provider.get', { id: 'openai' })).toMatchObject({ models: builtInOpenai + 1 });
    const requests = catalog.requests();
    expect(new Set(requests.map((request) => request.provider)).size).toBe((await kernel.exec('kvai.provider.list', {})).filter((provider) => provider.builtIn).length);
    expect(requests).toContainEqual({ provider: 'openai', types: 'chat', ifNoneMatch: undefined, userAgent: 'kvman', authorization: undefined });
  });

  it("M2.1-E26 a list older than pi-ai's data, or without Last-Modified, changes nothing", async () => {
    const catalog = await fakeCatalog();
    catalog.answer('openai', { status: 200, lastModified: older, body: [liveModel('openai', 'gpt-old')] });
    catalog.answer('groq', { status: 200, body: [liveModel('groq', 'undated', groqRoute)] });
    const { kernel } = await kvai.start({ settings: { 'kvai.catalog.url': catalog.url } });
    await kernel.clock.advance(0);
    expect(ids(await kernel.exec('kvai.model.list', {}))).not.toEqual(expect.arrayContaining([expect.stringMatching(/^(openai\/gpt-old|groq\/undated)$/)]));
    expect(await kernel.exec('kvai.model.list', { provider: 'openai' })).toHaveLength(builtInOpenai);
  });

  it("M2.1-E27 classifiers, invalid entries, another API or address than the provider's, and varying prices are left out", async () => {
    const catalog = await fakeCatalog();
    const { api: _api, ...noApi } = liveModel('openai', 'no-api');
    catalog.answer('openai', {
      status: 200,
      lastModified: newer,
      body: [
        liveModel('openai', 'classify', { type: 'classifier' }),
        noApi,
        liveModel('openai', 'other-api', { api: 'mistral-conversations' }),
        liveModel('openai', 'other-host', { baseUrl: 'https://catalog-chosen.example/v1' }),
        liveModel('openai', 'negative', { cost: { input: -1, output: 1, cacheRead: 0, cacheWrite: 0 } }),
      ],
    });
    const free = { cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, ...openrouterRoute };
    catalog.answer('openrouter', { status: 200, lastModified: newer, body: { models: [liveModel('openrouter', 'openrouter/fusion', free), liveModel('openrouter', 'live/ok', openrouterRoute)] } });
    const { kernel } = await kvai.start({ settings: { 'kvai.catalog.url': catalog.url } });
    await kernel.clock.advance(0);
    expect(await kernel.exec('kvai.model.list', { provider: 'openai' })).toHaveLength(builtInOpenai);
    const openrouter = ids(await kernel.exec('kvai.model.list', { provider: 'openrouter' }));
    expect(openrouter).toContain('openrouter/live/ok');
    expect(openrouter).not.toContain('openrouter/openrouter/fusion');
  });

  it("M2.1-E28 a live model is called like a built-in one, and one at another address isn't there", async () => {
    const catalog = await fakeCatalog();
    catalog.answer('groq', { status: 200, lastModified: newer, body: [liveModel('groq', 'live-m', groqRoute), liveModel('groq', 'elsewhere', { ...groqRoute, baseUrl: 'http://127.0.0.1:9/v1' })] });
    const { kernel } = await kvai.start({ settings: { 'kvai.catalog.url': catalog.url } });
    await kernel.clock.advance(0);
    const call = (model: string) => kernel.exec('kvai.complete', { model, messages: [userSays('hi')] });
    await expect(call('groq/live-m')).rejects.toMatchObject({ problem: { code: 'kvai/KEY_MISSING', params: { provider: 'groq' } } });
    await expect(call('groq/elsewhere')).rejects.toMatchObject({ problem: { code: 'kvai/MODEL_UNKNOWN', params: { model: 'groq/elsewhere' } } });
    expect(ids(await kernel.exec('kvai.model.list', { provider: 'groq' }))).toContain('groq/live-m');
  });
});
