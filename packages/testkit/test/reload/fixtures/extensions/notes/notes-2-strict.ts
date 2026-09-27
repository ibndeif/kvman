import { defineExtension } from '@kvman/sdk';
import { notesMeta, notesSetup } from './notes-base.ts';

// Caps the config limit at 10, with no migration.
export default defineExtension(notesMeta, notesSetup({ version: '2.2.0', limitMax: 10 }));
