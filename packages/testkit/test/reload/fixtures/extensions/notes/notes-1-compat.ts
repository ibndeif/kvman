import { defineExtension } from '@kvman/sdk';
import { notesMeta, notesSetup } from './notes-base.ts';

// Data version 1 that still runs on data at version 2 (ADR 0142).
export default defineExtension(notesMeta, notesSetup({ version: '1.1.0', data: { version: 1, migrations: [], compatibleWith: [2] } }));
