import { defineExtension } from '@kvman/sdk';
import { notesMeta, notesSetup } from './notes-base.ts';
import { breakStep } from './notes-steps.ts';

export default defineExtension(notesMeta, notesSetup({ version: '2.0.1', itemField: 'title', data: { version: 2, migrations: [{ to: 2, up: breakStep }] } }));
