import { z } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { errorsOf, recordedIssues, warningsOf } from './harness.ts';

describe('literal user-facing text', () => {
  it('M2.11-E9 warns at each literal text site while remaining valid', () => {
    const issues = recordedIssues((ext) => {
      ext.requestCapability('llm', { reason: 'Needs model' });
      ext.registerEntity('pdf.file', { description: 'A file.', title: 'File', schema: z.object({ id: z.string() }), display: { title: '$item.id' } });
      ext.registerConfig({ scope: 'global', schema: z.object({ language: z.string().describe('Language.').meta({ label: 'Language' }) }) });
      ext.registerPage('pdf.home', {
        description: 'Home.', route: '/home', title: 'Home',
        view: { type: 'stack', children: [
          { type: 'text', text: 'Welcome' },
          { type: 'table', entity: 'pdf.file', data: '$item.rows', columns: [{ field: 'id', label: 'Identifier' }] },
          { type: 'button', label: 'Open', onClick: { command: 'pdf.open', confirm: { title: 'Confirm' } } },
          { type: 'pdf.card', title: 'Card' },
        ] },
      });
      ext.registerNavItem('pdf.nav', { description: 'Nav.', page: 'pdf.home', label: 'Files', icon: 'files' });
      ext.registerCommand('pdf.open', { description: 'Opens.', input: z.object({}), handle: async () => null });
      ext.registerComponent('pdf.card', { description: 'Card.', props: z.object({ title: z.text() }), view: { type: 'text', text: '$props.title' } });
    });
    expect(errorsOf(issues)).toEqual([]);
    for (const [path, text] of [
      ['meta.title', 'Test'], ['permissions.capabilities.0.reason', 'Needs model'], ['entities.0.title', 'File'],
      ['config.schema.properties.language.label', 'Language'], ['ui.pages.0.title', 'Home'], ['ui.navItems.0.label', 'Files'],
      ['ui.pages.0.view.children.0.text', 'Welcome'], ['ui.pages.0.view.children.1.columns.0.label', 'Identifier'],
      ['ui.pages.0.view.children.2.label', 'Open'], ['ui.pages.0.view.children.2.onClick.confirm.title', 'Confirm'],
      ['ui.pages.0.view.children.3.title', 'Card'],
    ]) {
      expect(warningsOf(issues)).toEqual(expect.arrayContaining([expect.objectContaining({ path, severity: 'warning', message: expect.stringContaining(`"${text}" is literal`), hint: expect.stringContaining('$t') })]));
    }
  });

  it('M2.11-E10 bindings, punctuation and developer-only fields do not warn', () => {
    const issues = recordedIssues((ext) => {
      ext.registerTranslations({ default: 'en', catalogs: { en: { files: { title: 'Files' } } } });
      ext.registerPage('pdf.home', { description: 'Developer-only words.', route: '/home', title: '$t.files.title', icon: 'home', view: {
        type: 'stack', children: [
          { type: 'text', text: '$item.name' }, { type: 'text', text: '{{ $item.name }}' }, { type: 'text', text: '—' },
          { type: 'text', text: '{{ $query.q.total }} / {{ $query.q.max }}' }, { type: 'text', text: '$t.files.title' },
          { type: 'button', label: '$t.files.title', onClick: { navigate: '/home' } },
        ],
      } });
    });
    expect(warningsOf(issues)).toEqual([expect.objectContaining({ path: 'meta.title', severity: 'warning' })]);
    expect(warningsOf(issues).some((issue) => issue.path.startsWith('ui.'))).toBe(false);
  });
});
