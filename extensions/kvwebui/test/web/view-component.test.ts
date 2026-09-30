import type { View } from '@kvman/sdk/web';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { custom, customApi, useKvman } from './support/custom-page.ts';
import { createFakeComponents } from './support/fake-components.ts';
import { mountApp } from './support/mount-app.ts';

const good: View = { type: 'stack', direction: 'vertical', children: [{ type: 'markdown', text: 'notes.md' }, { type: 'heading', text: 'notes.item', params: { id: { $param: 'id' } }, level: 2 }] };
const bad: View = { type: 'table', query: 'notes.secret.get', input: {}, columns: [{ field: 'title', title: 'notes.columns.title' }] };

describe('kvman.View (06 §6.4, ADR 0009, 83)', () => {
  it('M2.3-E12 View renders a view tree, checked like a ui.get view', async () => {
    const api = customApi(custom('notes.viewer'), ['id']);
    api.catalogs['en'] = { ...api.catalogs['en'], 'notes.md': '**bold** <script>window.hacked = true</script>', 'notes.item': 'Item {id}' };
    const components = createFakeComponents();
    components.define(
      'notes.viewer',
      defineComponent({
        setup: () => {
          const kvman = useKvman();
          return () => h('div', [h('section', { 'data-test': 'good' }, [h(kvman.View, { view: good })]), h('section', { 'data-test': 'bad' }, [h(kvman.View, { view: bad })])]);
        },
      }),
    );
    const app = await mountApp(api, '/notes/custom/7', components);
    const shown = app.find('[data-test="good"]');
    expect(shown?.querySelector('strong')?.textContent).toBe('bold');
    expect(shown?.querySelector('script')).toBeNull();
    expect(shown?.querySelector('h2')?.textContent.trim()).toBe('Item 7');
    const refused = app.find('[data-test="bad"] [data-test="view-invalid"]');
    expect(refused?.querySelector('[data-test="problem-code"]')?.textContent).toBe('VALIDATION_FAILED');
    expect(refused?.textContent).toContain('notes.secret.get');
    expect(api.callsTo('notes.secret.get')).toEqual([]);
  });
});
