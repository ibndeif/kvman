import { describe, expect, it } from 'vitest';
import { checkExtension } from '../../src/check/check-extension.ts';
import { cleanCatalog, cleanSource, useProjects } from './projects.ts';

const project = useProjects();
const finding = (file: string, message: string) => ({ file, message, hint: expect.any(String), warning: false });

describe('missing locale keys (02 §2.11, ADR 0009, 116)', () => {
  it('M2.5-E19 a key one catalog lacks, a ui.get key, the namespace title, and a setting title are findings', async () => {
    const source = cleanSource
      .replace("title: 'notes.pages.hello', view: { type: 'markdown'", "title: 'notes.pages.hello', view: { type: 'stack', direction: 'vertical', children: [{ type: 'heading', level: 1, text: 'notes.pages.heading' }, { type: 'markdown'")
      .replace("field: 'text' } }]", "field: 'text' }] } }]")
      .replace('};\n', "  ctx.registerSetting('notes.color', { description: 'The color.', schema: z.string(), default: 'blue', scopes: ['global'] });\n};\n");
    const findings = await checkExtension(project({ source, locales: { en: { ...cleanCatalog, 'notes.extra': 'Extra' }, ar: { 'notes.pages.hello': 'مرحبا', 'notes.only-ar': 'فقط' } } }));
    expect(findings).toEqual([
      finding('locales/en.json', 'locales/en.json lacks notes.only-ar, which locales/ar.json has.'),
      finding('locales/en.json', 'locales/en.json lacks notes.color.title (used by the extension\'s page).'),
      finding('locales/en.json', 'locales/en.json lacks notes.pages.heading (used by notes.ui.get).'),
      finding('locales/ar.json', 'locales/ar.json lacks notes.extra, which locales/en.json has.'),
      finding('locales/ar.json', 'locales/ar.json lacks notes.title, which locales/en.json has.'),
      finding('locales/ar.json', 'locales/ar.json lacks notes.color.title (used by the extension\'s page).'),
      finding('locales/ar.json', 'locales/ar.json lacks notes.pages.heading (used by notes.ui.get).'),
    ]);
  });

  it('M2.5-E19 a missing namespace title is a finding in every catalog', async () => {
    const findings = await checkExtension(project({ source: cleanSource, locales: { en: { 'notes.pages.hello': 'Hello' }, ar: { 'notes.pages.hello': 'مرحبا' } } }));
    expect(findings).toEqual([
      finding('locales/en.json', 'locales/en.json lacks notes.title (used by the Extensions page).'),
      finding('locales/ar.json', 'locales/ar.json lacks notes.title (used by the Extensions page).'),
    ]);
  });

  it("QA21-E14 a key only the ui.get configuration uses is a finding", async () => {
    const source = cleanSource.replace('panels: [], status: [] })', "panels: [], status: [], configuration: { type: 'card', title: 'notes.config.lists', children: [{ type: 'text', text: 'notes.pages.hello' }] } })");
    expect(source).not.toBe(cleanSource);
    const findings = await checkExtension(project({ source, locales: { en: cleanCatalog, ar: cleanCatalog } }));
    expect(findings).toEqual([
      finding('locales/en.json', 'locales/en.json lacks notes.config.lists (used by notes.ui.get).'),
      finding('locales/ar.json', 'locales/ar.json lacks notes.config.lists (used by notes.ui.get).'),
    ]);
  });
});
