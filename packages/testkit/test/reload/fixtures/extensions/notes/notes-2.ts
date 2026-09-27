import { defineExtension } from '@kvman/sdk';
import { notesMeta, notesSetup } from './notes-base.ts';
import { renameItems } from './notes-steps.ts';

export default defineExtension(notesMeta, notesSetup({ version: '2.0.0', itemField: 'title', data: { version: 2, migrations: [{ to: 2, up: async (m) => void (await renameItems(m)) }] } }));
