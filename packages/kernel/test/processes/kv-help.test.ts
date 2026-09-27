import { describe, expect, it } from 'vitest';
import { helpMarkdown, type CallableEntry } from '../../src/index.ts';

const entry: CallableEntry = {
  type: 'pdf.translate', kind: 'command', access: 'all', handler: 'command:pdf.translate', description: 'Translates a PDF.',
  input: {
    type: 'object', required: ['fileId'],
    properties: {
      fileId: { type: 'string', description: 'The file to translate.' }, pages: { type: 'integer' }, force: { type: 'boolean' }, langs: { type: 'array', items: { type: 'string' } },
      meta: { type: 'object' },
    },
  },
  output: { type: 'object', properties: { jobId: { type: 'string' }, pages: { type: 'integer' } } },
};

describe('kv help (plan 12 §12.6, ADR 0141)', () => {
  it('M2.6-E27 the Markdown lists every flag in kebab case, a runnable example, and the output fields', () => {
    const markdown = helpMarkdown(entry);
    expect(markdown).toContain('# `pdf.translate` (command)');
    expect(markdown).toContain('    kv pdf.translate --file-id <…> [--pages <…>] [--force <…>] [--langs <…>] [--meta <…>]');
    expect(markdown).toContain('- `--file-id <string>` (required): The file to translate.');
    expect(markdown).toContain('- `--pages <integer>`');
    expect(markdown).toContain('- `--force` / `--no-force` (boolean)');
    expect(markdown).toContain('- `--langs <string>`, repeated for each item');
    expect(markdown).toContain('- `--meta <json>` (object as JSON text)');
    expect(markdown).toContain('    kv pdf.translate --file-id example');
    expect(markdown).toContain('- `jobId` (string)');
    expect(markdown).toContain('- `pages` (integer)');
  });
});
