import { defineExtension } from '@kvman/sdk';
import { notesMeta, notesSetup } from './notes-base.ts';
import { renameItems } from './notes-steps.ts';

// Caps the config limit at 10, and step 2 leaves the limit alone.
export default defineExtension(notesMeta, notesSetup({ version: '2.3.1', itemField: 'title', limitMax: 10, data: { version: 2, migrations: [{ to: 2, up: async (m) => void (await renameItems(m)) }] } }));
