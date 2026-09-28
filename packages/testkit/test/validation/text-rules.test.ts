import { ProblemError, recordExtension } from '@kvman/kernel';
import { jsonObjectSchema, type Issue } from '@kvman/protocol';
import { defineExtension, z, type Ext } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { correlationId, errorsOf, recordedIssues, removeAt, validatedIssues, warningsOf } from './harness.ts';

const page = (ext: Ext, title: string): void => { ext.registerPage('pdf.home', { description: 'Home.', route: '/home', title, view: { type: 'stack' } }); };
const issuesAt = (issues: Issue[], path: string, severity: 'warning' | 'error', message: string): void => {
  expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ path, ...(severity === 'warning' ? { severity } : {}), message: expect.stringContaining(message) })]));
};

describe('manifest text rules', () => {
  it('M2.11-H2 recording reports missing keys and invalid ICU together as EXT_MANIFEST_INVALID', () => {
    const definition = defineExtension({ name: '@acme/pdf', namespace: 'pdf', title: '$t.meta.title', description: 'Test.' }, (ext) => {
      page(ext, '$t.files.missing');
      ext.registerTranslations({ default: 'en', catalogs: { en: { meta: { title: 'PDF' }, count: '{count, plural, one {# file}' } } });
    });
    let failure: unknown;
    try { recordExtension(definition, { packageName: '@acme/pdf', version: '1.0.0', correlationId }); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(ProblemError);
    if (!(failure instanceof ProblemError)) throw new Error('expected EXT_MANIFEST_INVALID');
    expect(failure.problem.code).toBe('EXT_MANIFEST_INVALID');
    issuesAt(failure.problem.issues ?? [], 'ui.pages.0.title', 'error', 'files.missing is not in the default catalog en');
    issuesAt(failure.problem.issues ?? [], 'translations.catalogs.en.count', 'error', 'not valid ICU MessageFormat');
  });

  it('M2.11-E4 a default locale without a shipped catalog fails at translations.default', () => {
    issuesAt(errorsOf(recordedIssues((ext) => ext.registerTranslations({ default: 'fr', catalogs: { en: {}, ar: {} } }))),
      'translations.default', 'error', 'no catalog is shipped for the default locale fr');
  });

  it('M2.11-E5 checks key uses in page, status, markdown, config, meta and capability text', () => {
    const setup = (ext: Ext): void => {
      ext.registerQuery('pdf.count.get', { description: 'Counts.', input: z.object({}), output: z.object({ total: z.number() }), handle: async () => ({ total: 1 }) });
      ext.registerPage('pdf.home', { description: 'Home.', route: '/home', title: '$t.files.title', queries: { q: { query: 'pdf.count.get' } }, view: { type: 'markdown', source: 'Open {{ $t.files.title }}' } });
      ext.registerStatusItem('pdf.count', { description: 'Count.', label: { $t: 'files.count', count: '$query.q.total' } });
      ext.registerConfig({ scope: 'global', schema: z.object({ lang: z.string().describe('Language.').meta({ label: '$t.form.lang' }) }) });
      ext.requestCapability('llm', { reason: '$t.reasons.calls' });
      ext.registerTranslations({ default: 'en', catalogs: { en: { files: { title: 'Files', count: '{count} files' }, form: { lang: 'Language' }, reasons: { calls: 'Needs model' }, meta: { title: 'PDF' } } } });
    };
    const definition = defineExtension({ name: '@acme/pdf', namespace: 'pdf', title: '$t.meta.title', description: 'Test.' }, setup);
    const recording = recordExtension(definition, { packageName: '@acme/pdf', version: '1.0.0', correlationId });
    expect(errorsOf(validatedIssues(jsonObjectSchema.parse(recording.manifest)))).toEqual([]);
    const cases = [
      { key: 'files.title', catalog: ['files', 'title'], paths: ['ui.pages.0.title', 'ui.pages.0.view.source'] },
      { key: 'files.count', catalog: ['files', 'count'], paths: ['ui.statusItems.0.label'] },
      { key: 'form.lang', catalog: ['form', 'lang'], paths: ['config.schema.properties.lang.label'] },
      { key: 'reasons.calls', catalog: ['reasons', 'calls'], paths: ['permissions.capabilities.0.reason'] },
      { key: 'meta.title', catalog: ['meta', 'title'], paths: ['meta.title'] },
    ];
    for (const { key, catalog, paths } of cases) {
      const candidate = jsonObjectSchema.parse(structuredClone(recording.manifest));
      removeAt(candidate, ['translations', 'catalogs', 'en', ...catalog]);
      const errors = errorsOf(validatedIssues(candidate));
      expect(errors.map((issue) => issue.path).sort()).toEqual([...paths].sort());
      for (const path of paths) issuesAt(errors, path, 'error', `${key} is not in the default catalog en`);
    }
  });

  it('M2.11-E6 a key missing only from another shipped catalog warns at its use', () => {
    const issues = recordedIssues((ext) => {
      page(ext, '$t.files.title');
      ext.registerTranslations({ default: 'en', catalogs: { en: { files: { title: 'Files' } }, ar: {} } });
    });
    expect(errorsOf(issues)).toEqual([]);
    issuesAt(warningsOf(issues), 'ui.pages.0.title', 'warning', 'files.title is not in the ar catalog');
  });

  it('M2.11-E7 every locale argument must be passed by the key use, including plural arguments but not #', () => {
    const translations = { default: 'en', catalogs: {
      en: { files: { count: '{count, plural, one {# file} other {# files}}', greet: 'Hello {name}' } },
      ar: { files: { count: '{count, plural, one {# file} other {# files}}', greet: '{name} {count}' } },
    } };
    const inspect = (label: string | { $t: string; [parameter: string]: string | number }): Issue[] => recordedIssues((ext) => {
      ext.registerStatusItem('pdf.count', { description: 'Count.', label });
      ext.registerTranslations(translations);
    });
    for (const label of ['$t.files.count', '{{ $t.files.count }}']) {
      issuesAt(errorsOf(inspect(label)), 'ui.statusItems.0.label', 'error', 'files.count uses {count} in en');
    }
    expect(errorsOf(inspect({ $t: 'files.count', count: 1 }))).toEqual([]);
    issuesAt(errorsOf(inspect({ $t: 'files.greet', name: '$item.name' })), 'ui.statusItems.0.label', 'error', 'files.greet uses {count} in ar');
  });

  it('M2.11-E8 rejects malformed ICU and catalog leaves while tags and quoted braces pass', () => {
    const valid = recordedIssues((ext) => ext.registerTranslations({ default: 'en', catalogs: { en: { nested: { tag: 'Click <b>here</b>', brace: "'{'literal'}'" } } } }));
    expect(errorsOf(valid)).toEqual([]);
    const brokenMessages: Array<[string, string]> = [['unclosed', '{name'], ['plural', '{count, plural, one {# file}}']];
    for (const [key, value] of brokenMessages) {
      const issues = recordedIssues((ext) => ext.registerTranslations({ default: 'en', catalogs: { en: { nested: { [key]: value } } } }));
      issuesAt(errorsOf(issues), `translations.catalogs.en.nested.${key}`, 'error', 'not valid ICU MessageFormat');
    }
    const definition = defineExtension({ name: '@acme/pdf', namespace: 'pdf', title: 'Test', description: 'Test.' }, (ext) => {
      ext.registerTranslations({ default: 'en', catalogs: { en: { nested: { count: 'Two' } } } });
    });
    const candidate = jsonObjectSchema.parse(structuredClone(recordExtension(definition, { packageName: '@acme/pdf', version: '1.0.0', correlationId }).manifest));
    candidate['translations'] = { default: 'en', catalogs: { en: { nested: { count: 2 } } } };
    const numeric = validatedIssues(candidate);
    issuesAt(errorsOf(numeric), 'translations.catalogs.en.nested.count', 'error', 'string');
  });

  it('M2.11-E11 a public composite text prop uses the passing extension’s catalog', () => {
    const issues = recordedIssues((ext) => {
      ext.requireComponents(['kit.card'], { reason: 'Needed.' });
      ext.registerPage('pdf.home', { description: 'Home.', route: '/home', title: 'Home', view: { type: 'kit.card', title: { $t: 'files.title' } } });
      ext.registerTranslations({ default: 'en', catalogs: { en: {} } });
    });
    issuesAt(errorsOf(issues), 'ui.pages.0.view.title', 'error', 'files.title is not in the default catalog en');
  });
});
