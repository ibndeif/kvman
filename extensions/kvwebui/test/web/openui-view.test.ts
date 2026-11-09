import type { View } from '@kvman/sdk/web';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { custom, customApi, useKvman } from './support/custom-page.ts';
import { createFakeComponents } from './support/fake-components.ts';
import { mountApp } from './support/mount-app.ts';

const fullSource = ['root = Stack([title, tags])', 'title = TextContent("Dashboard title")', 'tags = TagBlock(["alpha", "beta"])'].join('\n');

const chatSource = ['root = Card([body])', 'body = TextContent("Reply body")'].join('\n');

describe('the `openui` view (06 §6.1 and §6.4, ADR 0124)', () => {
  it('M5.18-H3 the `openui` view draws with `openuiLibrary`, and a fenced block with the chat library', async () => {
    const components = createFakeComponents();
    components.define(
      'notes.views',
      defineComponent({
        setup: () => {
          const kvman = useKvman();
          return () =>
            h('div', [
              h('section', { 'data-test': 'full' }, [h(kvman.View, { view: { type: 'openui', source: fullSource } })]),
              h('section', { 'data-test': 'chat' }, [h(kvman.View, { view: { type: 'markdown', text: 'notes.chat' } })]),
            ]);
        },
      }),
    );
    const api = customApi(custom('notes.views'));
    api.catalogs['en'] = { ...api.catalogs['en'], 'notes.chat': `\`\`\`openui\n${chatSource}\n\`\`\`` };
    const app = await mountApp(api, '/notes/custom', components);
    const full = app.find('[data-test="full"]');
    expect(full?.querySelector('.kvwebui-openui-stack')).not.toBeNull();
    expect(full?.textContent).toContain('Dashboard title');
    expect([...(full?.querySelectorAll('li') ?? [])].map((tag) => tag.textContent?.trim())).toEqual(['alpha', 'beta']);
    expect(full?.querySelector('[data-test="openui-source"]')).toBeNull();
    const chat = app.find('[data-test="chat"]');
    expect(chat?.querySelector('[data-test="openui"]')).not.toBeNull();
    expect(chat?.textContent).toContain('Reply body');
    expect(chat?.querySelector('.kvwebui-openui-stack')).toBeNull();
    expect(chat?.querySelector('[data-test="openui-source"]')).toBeNull();
  });

  it('M5.18-E11 the `openui` view is checked like any view', async () => {
    const missing = { type: 'openui' } as unknown as View;
    const wrong = { type: 'openui', source: 5 } as unknown as View;
    const components = createFakeComponents();
    components.define(
      'notes.views',
      defineComponent({
        setup: () => {
          const kvman = useKvman();
          return () =>
            h('div', [
              h('section', { 'data-test': 'missing' }, [h(kvman.View, { view: missing })]),
              h('section', { 'data-test': 'wrong' }, [h(kvman.View, { view: wrong })]),
            ]);
        },
      }),
    );
    const app = await mountApp(customApi(custom('notes.views')), '/notes/custom', components);
    for (const test of ['missing', 'wrong']) {
      const refused = app.find(`[data-test="${test}"] [data-test="view-invalid"]`);
      expect(refused?.querySelector('[data-test="problem-code"]')?.textContent).toBe('VALIDATION_FAILED');
      expect(refused?.textContent).toContain('view.source');
    }
  });
});
