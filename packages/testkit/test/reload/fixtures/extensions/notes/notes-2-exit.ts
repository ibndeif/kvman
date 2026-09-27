import { defineExtension } from '@kvman/sdk';
import { notesMeta, notesSetup } from './notes-base.ts';

// Step 2 ends its host process.
export default defineExtension(notesMeta, notesSetup({
  version: '2.5.0', itemField: 'title',
  data: { version: 2, migrations: [{ to: 2, up: async () => process.exit(1) }] },
}));
