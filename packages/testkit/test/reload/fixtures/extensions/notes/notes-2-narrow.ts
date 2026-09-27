import { defineExtension } from '@kvman/sdk';
import { notesMeta, notesSetup } from './notes-base.ts';

// No longer provides notes.items.list.
export default defineExtension(notesMeta, notesSetup({ version: '2.6.0', narrow: true }));
