import { defineExtension } from '@kvman/sdk';
import { notesMeta, notesSetup } from './notes-base.ts';
import { blockedStep, renameItems } from './notes-steps.ts';

export default defineExtension(notesMeta, notesSetup({
  version: '3.0.0', itemField: 'title',
  data: { version: 3, migrations: [{ to: 2, up: async (m) => void (await renameItems(m)) }, { to: 3, up: blockedStep }] },
}));
