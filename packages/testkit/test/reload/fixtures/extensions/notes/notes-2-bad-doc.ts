import { defineExtension } from '@kvman/sdk';
import { notesMeta, notesSetup } from './notes-base.ts';

// Step 2 replaces each item with one that has no title.
export default defineExtension(notesMeta, notesSetup({
  version: '2.7.0', itemField: 'title',
  data: { version: 2, migrations: [{ to: 2, up: async (m) => m.collection('items').each(({ doc }) => ({ id: String(doc['id']) })) }] },
}));
