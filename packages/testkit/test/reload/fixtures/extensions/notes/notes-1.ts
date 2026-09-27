import { defineExtension } from '@kvman/sdk';
import { notesMeta, notesSetup } from './notes-base.ts';

export default defineExtension(notesMeta, notesSetup({ version: '1.0.0' }));
