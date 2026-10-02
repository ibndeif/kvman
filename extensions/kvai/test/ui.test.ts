import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { kvaiFolder, useKvai } from './support/kvai-kernel.ts';

const kvai = useKvai();

const textFields = ['text', 'title', 'submit', 'empty', 'toast', 'confirm'];

// Every value under `field` in a view tree, at any depth.
function valuesOf(tree: unknown, fields: readonly string[]): string[] {
  if (Array.isArray(tree)) return tree.flatMap((item) => valuesOf(item, fields));
  if (typeof tree !== 'object' || tree === null) return [];
  return Object.entries(tree).flatMap(([key, value]) => (fields.includes(key) && typeof value === 'string' ? [value] : valuesOf(value, fields)));
}

const contributionsSchema = z.object({
  pages: z.array(z.object({ id: z.string(), title: z.string(), view: z.unknown() })),
  nav: z.array(z.object({ id: z.string(), page: z.string(), title: z.string(), icon: z.string(), order: z.number() })),
  panels: z.array(z.unknown()),
  status: z.array(z.object({ id: z.string(), query: z.string(), input: z.unknown(), text: z.string(), params: z.unknown(), order: z.number() })),
});

describe('kvai.ui.get (07 §7.3)', () => {
  it('M2.1-H7 contributes the Models, provider, and add pages and the status item, naming only public calls and known texts', async () => {
    const { kernel } = await kvai.start();
    const ui = contributionsSchema.parse(await kernel.exec('kvai.ui.get', {}));
    expect(ui.pages.map((page) => page.id)).toEqual(['models', 'provider', 'provider-add']);
    expect(ui.nav).toEqual([{ id: 'models', page: 'models', title: 'kvai.ui.models.nav', icon: 'brain', order: 50 }]);
    expect(ui.status).toEqual([
      { id: 'usage', query: 'kvai.usage.total.get', input: {}, text: 'kvai.ui.status.usage', params: { tokens: { $output: 'tokens', format: 'compact' }, cost: { $output: 'cost', format: 'usd' } }, order: 50 },
    ]);
    const view = ui.pages.map((page) => page.view);
    expect(valuesOf(view, ['query'])).toEqual(['kvai.model.default.get', 'kvai.provider.list', 'kvai.provider.get', 'kvai.model.list']);
    expect(valuesOf(view, ['command'])).toEqual(['kvai.provider.key.set', 'kvai.provider.key.delete', 'kernel.settings.set', 'kvai.provider.add', 'kvai.model.add']);
    expect(JSON.stringify(view)).not.toContain('"tabs"');
    expect(JSON.stringify(view)).toContain(JSON.stringify({ key: 'kvai.defaultModel', value: { $row: 'id' }, scope: 'global' }));

    const kvaiInfo = (await kernel.exec('kernel.extensions.list', {})).find((extension) => extension.name === '@kvman/kvai');
    const publicNames = [...(kvaiInfo?.commands ?? []), ...(kvaiInfo?.queries ?? [])].filter((call) => call.public).map((call) => call.name);
    const named = [...valuesOf(ui, ['query']), ...valuesOf(view, ['command'])].filter((name) => !name.startsWith('kernel.'));
    expect(publicNames).toEqual(expect.arrayContaining(named));

    const catalog = z.record(z.string(), z.string()).parse(JSON.parse(readFileSync(path.join(kvaiFolder, 'locales', 'en.json'), 'utf8')));
    const texts = [...valuesOf(ui, textFields), ...ui.nav.map((item) => item.title)];
    expect(texts.filter((key) => catalog[key] === undefined)).toEqual([]);
  });
});
