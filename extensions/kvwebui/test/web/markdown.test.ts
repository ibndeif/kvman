import { describe, expect, it } from 'vitest';
import { extension, mountApp } from './support/mount-app.ts';
import { notesApi, notesUi } from './support/notes.ts';

const payload = 'Hi <img src=x onerror=alert(1)> <script>alert(2)</script> [link](javascript:alert(3)) **bold**';

describe('Markdown (06 §6.1, §6.4)', () => {
  it("M2.2-H9 Markdown can't inject HTML, from a translated text or from data", async () => {
    const view = { type: 'stack', direction: 'vertical', children: [{ type: 'markdown', text: 'notes.markdown' }, { type: 'markdown', query: 'doc.page.get', input: {}, field: 'body' }] };
    const api = notesApi({ ui: notesUi({ pages: [{ id: 'list', title: 'notes.pages.list', view }] }) });
    api.catalogs['en'] = { ...api.catalogs['en'], 'notes.markdown': payload };
    api.extensions.push(extension('doc', { queries: [{ name: 'doc.page.get' }] }));
    api.handlers.set('doc.ui.get', () => ({ pages: [], nav: [], panels: [], status: [] }));
    api.handlers.set('doc.page.get', () => ({ body: payload }));
    const app = await mountApp(api, '/notes/list');
    const blocks = app.findAll('[data-test="markdown"]');
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(block.querySelector('img, script')).toBeNull();
      expect([...block.querySelectorAll('a')].filter((anchor) => anchor.getAttribute('href')?.startsWith('javascript:') === true)).toEqual([]);
      expect(block.textContent).toContain('<img src=x onerror=alert(1)>');
      expect(block.querySelector('strong')?.textContent).toBe('bold');
    }
  });
});
