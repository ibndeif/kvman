import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';
import { useI18n } from 'vue-i18n';
import { createI18nState } from '../../web/src/state/i18n.ts';
import { click, mountApp } from './support/mount-app.ts';
import { notesApi, notesCatalog, notesUi } from './support/notes.ts';

// Plural forms (plan 06 §6.1, ADR 0098, 1): a numeric `count` chooses a text's form by its language's plural rule.
type Translate = (key: string, named?: Record<string, unknown>) => string;

function translator(language: string, catalog: Record<string, string>): Translate {
  const state = createI18nState();
  state.use(language, catalog);
  const found: Translate[] = [];
  const Probe = defineComponent({
    setup() {
      const { t } = useI18n();
      found.push((key, named = {}) => t(key, named));
      return () => null;
    },
  });
  mount(Probe, { global: { plugins: [state.plugin] } });
  const [translate] = found;
  if (translate === undefined) throw new Error('The probe did not set up.');
  return translate;
}

const arabicFiles = 'لا ملفات | ملف واحد | ملفان | {count} ملفات | {count} ملفًا | {count} ملف';

describe('plural forms (ADR 0098, 1)', () => {
  it('QA66-H1 English picks one or other by count', () => {
    const t = translator('en', { 'x.files': '{count} file | {count} files' });
    expect([0, 1, 3].map((count) => t('x.files', { count }))).toEqual(['0 files', '1 file', '3 files']);
  });

  it("QA66-H2 Arabic picks each of its six forms", () => {
    const t = translator('ar', { 'x.files': arabicFiles });
    expect([0, 1, 2, 3, 11, 100].map((count) => t('x.files', { count }))).toEqual(['لا ملفات', 'ملف واحد', 'ملفان', '3 ملفات', '11 ملفًا', '100 ملف']);
  });

  it('QA66-E1 a text with the wrong number of forms gets the default choice', () => {
    const t = translator('ar', { 'x.files': 'ملف | ملفات' });
    expect([1, 2].map((count) => t('x.files', { count }))).toEqual(['ملف', 'ملفات']);
  });

  it('QA66-E2 a text with forms and no numeric count shows its last form', () => {
    const t = translator('en', { 'x.files': 'one file | many files' });
    expect([t('x.files'), t('x.files', { count: '1' })]).toEqual(['many files', 'many files']);
  });

  it('QA66-H3 a status item and a view text choose their form by a numeric count, before it is formatted', async () => {
    const count = { id: 'count', query: 'notes.count.get', input: {}, text: 'notes.status.count', params: { count: { $output: 'count', format: 'compact' } }, order: 1 };
    const note = { id: 'note', title: 'notes.pages.note', params: ['noteId'], view: { type: 'text', text: 'notes.note.pages', params: { count: 1 } } };
    const api = notesApi({ ui: notesUi({ status: [count], pages: [note], nav: [] }) });
    api.catalogs['en'] = { ...api.catalogs['en'], ...notesCatalog, 'notes.status.count': '{count} note | {count} notes', 'notes.note.pages': 'It has {count} page. | It has {count} pages.' };
    api.handlers.set('notes.count.get', () => ({ count: 1500 }));
    const app = await mountApp(api, '/notes/note/n1');
    expect(app.find('[data-test="status-notes.count"]')?.textContent).toBe('1.5K notes');
    expect(app.text()).toContain('It has 1 page.');
  });

  it('QA66-H10 the Extensions page and the missing-workspace confirmation read right at one', async () => {
    const api = notesApi();
    const page = await mountApp(api, '/kvwebui/extensions');
    expect(page.text()).toContain("What's running in kvman: 1 extension, from the");
    expect(page.text()).toContain('Open it to configure it.');

    const closed = notesApi();
    closed.closedWorkspaces = [{ id: 'c1', name: 'gone', path: '/tmp/gone', missing: true }];
    const app = await mountApp(closed, '/notes/list');
    await click(app.find('button[aria-label^="Workspace:"]'));
    await click(app.find('[data-test="closed-toggle"]'));
    await click(app.find('[data-test="delete-missing"]'));
    expect(app.text()).toContain('Delete the data of the workspace whose folder is missing?');
  });
});
