import { existsSync, readFileSync } from 'node:fs';
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
    expect(valuesOf(view, ['query'])).toEqual([]);
    expect(valuesOf(view, ['command'])).toEqual(['kvai.provider.add', 'kvai.model.add']);
    expect(JSON.stringify(view)).not.toContain('"tabs"');

    const kvaiInfo = (await kernel.exec('kernel.extensions.list', {})).find((extension) => extension.name === '@kvman/kvai');
    const publicNames = [...(kvaiInfo?.commands ?? []), ...(kvaiInfo?.queries ?? [])].filter((call) => call.public).map((call) => call.name);
    const named = [...valuesOf(ui, ['query']), ...valuesOf(view, ['command'])].filter((name) => !name.startsWith('kernel.'));
    expect(publicNames).toEqual(expect.arrayContaining(named));

    const catalog = z.record(z.string(), z.string()).parse(JSON.parse(readFileSync(path.join(kvaiFolder, 'locales', 'en.json'), 'utf8')));
    const texts = [...valuesOf(ui, textFields), ...ui.nav.map((item) => item.title)];
    expect(texts.filter((key) => catalog[key] === undefined)).toEqual([]);
  });

  it('QA16-H13 the pages are wired and built', async () => {
    const { kernel } = await kvai.start();
    const ui = contributionsSchema.parse(await kernel.exec('kvai.ui.get', {}));
    const models = ui.pages.find((page) => page.id === 'models');
    expect(models?.view).toEqual({
      type: 'stack',
      direction: 'vertical',
      gap: 'lg',
      children: [
        { type: 'heading', text: 'kvai.ui.models.title', level: 1 },
        { type: 'text', text: 'kvai.ui.models.intro' },
        { type: 'custom', component: 'kvai.providers', props: {} },
      ],
    });
    expect(JSON.stringify(models?.view)).not.toContain('kvai.provider.add');

    const provider = ui.pages.find((page) => page.id === 'provider');
    expect(provider?.view).toEqual({
      type: 'custom',
      component: 'kvai.provider',
      props: { providerId: { $param: 'providerId' } },
    });

    expect(existsSync(path.join(kvaiFolder, 'web', 'components', 'providers.vue'))).toBe(true);
    expect(existsSync(path.join(kvaiFolder, 'web', 'components', 'provider.vue'))).toBe(true);
    expect(existsSync(path.join(kvaiFolder, 'web', 'components', 'connection.vue'))).toBe(false);
    const config = readFileSync(path.join(kvaiFolder, 'web-build.config.ts'), 'utf8');
    expect(config).toContain("'providers'");
    expect(config).toContain("'provider'");
    expect(config).not.toContain('connection');
    const manifest = JSON.parse(readFileSync(path.join(kvaiFolder, 'package.json'), 'utf8')) as { kvman?: { web?: string } };
    expect(manifest.kvman?.web).toBe('dist/web');

    const en = z.record(z.string(), z.string()).parse(JSON.parse(readFileSync(path.join(kvaiFolder, 'locales', 'en.json'), 'utf8')));
    const ar = z.record(z.string(), z.string()).parse(JSON.parse(readFileSync(path.join(kvaiFolder, 'locales', 'ar.json'), 'utf8')));
    const texts = [...valuesOf(ui.pages.map((page) => page.view), textFields)];
    expect(texts.filter((key) => en[key] === undefined)).toEqual([]);
    expect(texts.filter((key) => ar[key] === undefined)).toEqual([]);
  });
});
