import { builtinComponentEntries, kernelTypeEntries, schemaDocument, searchEntries, type Searchable } from '../../src/index.ts';
import { frameSlots } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import { command, manifest } from './manifests.ts';

const named = (entry: Searchable): Searchable => entry;

function search(entries: Searchable[], q: string): string[] {
  return searchEntries(entries, q, named).map((entry) => entry.name);
}

describe('schema search (plan 12 §12.7, ADR 0112)', () => {
  it('M2.1-E35 every word must appear in the name or the description', () => {
    const entries = [
      { name: 'agent.run', description: 'Translate a PDF with the agent.' },
      { name: 'pdf.import', description: 'Import a PDF.' },
      { name: 'notes.add', description: 'Add a note.' },
    ];
    expect(search(entries, 'translate pdf')).toEqual(['agent.run']);
  });

  it('M2.1-E36 an exact name first, then a prefix, then the rest by score, ties by name', () => {
    const entries = [
      { name: 'agent.translate.run', description: 'Runs a translation.' },
      { name: 'pdf.translate-all', description: 'Translates every file.' },
      { name: 'zeta.notes', description: 'Mentions pdf.translate in passing.' },
      { name: 'pdf.translate', description: 'Translates one file.' },
      { name: 'alpha.notes', description: 'Also mentions pdf.translate.' },
    ];
    expect(search(entries, 'pdf.translate')).toEqual(['pdf.translate', 'pdf.translate-all', 'alpha.notes', 'zeta.notes']);
  });

  it('M2.1-E37 q matches regardless of case', () => {
    expect(search([{ name: 'pdf.import', description: 'Import a PDF.' }], 'PDF.IMPORT')).toEqual(['pdf.import']);
  });

  it('M2.1-E38 components and frame slots are not filtered by q', () => {
    const components = builtinComponentEntries();
    const document = schemaDocument({ version: '2.0.0', kernelTypes: kernelTypeEntries(), extensions: [manifest('@acme/notes', 'notes', { types: [command('notes.add')] })], components }, 'no-such-word');
    expect(document).toMatchObject({ types: [], entities: [], errors: [], extensions: [], frameSlots });
    expect(document.components).toEqual(components);
  });
});
