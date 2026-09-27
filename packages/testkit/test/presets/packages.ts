import type { PackageSpec } from '../install/packages.ts';

// M2.8: the preset tests' npm and builtin fixtures (plan 07 §7.4).
const pdfConfig = `ext.registerConfig({ scope: 'both', schema: z.object({ lang: z.string().optional().describe('The language to translate to.'), limit: z.number().max(10).optional().describe('How many files a page shows.'), apiKey: z.string().optional().describe('The translation service key.').meta({ secret: true }) }) });`;
const pdfQuery = `ext.registerQuery('pdf.files.list', { description: 'Lists the PDF files.', input: z.object({}), output: z.array(z.string()), handle: async () => [] });`;
const pdfEvent = `ext.registerEvent('pdf.files.changed', { description: 'The PDF files changed.', payload: z.object({}) });`;
const pdfMigration = `ext.registerDataVersion(2, { migrations: [{ to: 2, up: async (m) => { await m.kv.each(async () => undefined); } }] });`;

function pdfSource(version: '0.9.0' | '1.0.0' | '1.1.0'): string {
  const capabilities = version === '0.9.0'
    ? ''
    : `ext.requestCapability('files.read', { reason: 'Reads PDF files.' }); ${pdfMigration}`;
  const llm = version === '1.1.0' ? `ext.requestCapability('llm', { reason: 'Translates PDF files.' });` : '';
  return `import { defineExtension, z } from '@kvman/sdk';
export default defineExtension({ name: '@acme/pdf', namespace: 'pdf', title: 'PDF', description: 'Reads PDF files.' }, (ext) => {
  ${pdfConfig}
  ${pdfQuery}
  ${pdfEvent}
  ${capabilities}
  ${llm}
});
`;
}

// Pdf @acme/pdf, namespace pdf, with the config, query, and event every version has.
export function pdfPackage(version: '0.9.0' | '1.0.0' | '1.1.0'): PackageSpec {
  return { name: '@acme/pdf', version, files: { 'dist/extension.js': pdfSource(version) } };
}

// Reader @acme/reader 1.0.0, namespace reader.
export function readerPackage(): PackageSpec {
  return {
    name: '@acme/reader', version: '1.0.0',
    files: {
      'dist/extension.js': `import { defineExtension, z } from '@kvman/sdk';
export default defineExtension({ name: '@acme/reader', namespace: 'reader', title: 'Reader', description: 'Shows the PDF files.' }, (ext) => {
  ext.requestCapability('calls', { reason: 'Lists PDF files.', types: ['pdf.files.list'] });
  ext.requireTypes(['pdf.files.list'], { reason: 'Shows the PDF files.' });
  ext.registerCommand('reader.show', { description: 'Shows the PDF files.', input: z.object({}), handle: async () => ({}) });
});
`,
    },
  };
}

// Clash @acme/clash 1.0.0, namespace pdf.
export function clashPackage(): PackageSpec {
  return {
    name: '@acme/clash', version: '1.0.0',
    files: {
      'dist/extension.js': `import { defineExtension, z } from '@kvman/sdk';
export default defineExtension({ name: '@acme/clash', namespace: 'pdf', title: 'Clash', description: 'Another PDF extension.' }, (ext) => {
  ext.registerCommand('pdf.scan', { description: 'Scans the PDF files.', input: z.object({}), handle: async () => ({}) });
});
`,
    },
  };
}

// Stash @acme/stash 1.0.0 and 2.0.0, namespace stash: a collection with a put command, both versions, and a
// first migration step that fails on 2.0.0.
export function stashPackage(version: '1.0.0' | '2.0.0'): PackageSpec {
  const data = version === '1.0.0'
    ? ''
    : `ext.registerDataVersion(2, { migrations: [{ to: 2, up: async () => { throw new Error('stash step 2 fails'); } }] });`;
  return {
    name: '@acme/stash', version,
    files: {
      'dist/extension.js': `import { defineExtension, z } from '@kvman/sdk';
export default defineExtension({ name: '@acme/stash', namespace: 'stash', title: 'Stash', description: 'Stashes documents.' }, (ext) => {
  const items = ext.registerCollection('items', { description: 'The stashed documents.', schema: z.object({ id: z.string() }) });
  ext.registerCommand('stash.put', {
    description: 'Stashes a document.', input: z.object({ id: z.string() }),
    handle: async ({ id }, ctx) => { ctx.store.collection(items).put({ id }); return {}; },
  });
  ${data}
});
`,
    },
  };
}

// First @acme/first, a builtin running shared.
export function firstPackage(): PackageSpec {
  return {
    name: '@acme/first', version: '1.0.0',
    files: {
      'dist/extension.js': `import { defineExtension, z } from '@kvman/sdk';
export default defineExtension({ name: '@acme/first', namespace: 'first', title: 'First', description: 'The first builtin.' }, (ext) => {
  ext.requestIsolation('shared', { reason: 'A builtin.' });
  ext.subscribe('pdf.files.changed', { description: 'Refreshes on PDF changes.', handle: async () => undefined });
  ext.registerCommand('first.ping', { description: 'Answers a ping.', input: z.object({}), handle: async () => ({}) });
});
`,
    },
  };
}

// Second @acme/second, a builtin running shared.
export function secondPackage(): PackageSpec {
  return {
    name: '@acme/second', version: '1.0.0',
    files: {
      'dist/extension.js': `import { defineExtension, z } from '@kvman/sdk';
export default defineExtension({ name: '@acme/second', namespace: 'second', title: 'Second', description: 'The second builtin.' }, (ext) => {
  ext.requestIsolation('shared', { reason: 'A builtin.' });
  ext.registerConfig({ scope: 'workspace', schema: z.object({ note: z.string().optional().describe('A note.') }) });
  ext.registerCommand('second.ping', { description: 'Answers a ping.', input: z.object({}), handle: async () => ({}) });
});
`,
    },
  };
}
