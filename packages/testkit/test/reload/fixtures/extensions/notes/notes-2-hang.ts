import { defineExtension } from '@kvman/sdk';
import { notesMeta, notesSetup } from './notes-base.ts';

// Step 2 waits far longer than the kernel's 10-minute limit.
export default defineExtension(notesMeta, notesSetup({
  version: '2.4.0', itemField: 'title',
  data: { version: 2, migrations: [{ to: 2, up: () => new Promise((resolve) => setTimeout(resolve, 2 ** 31 - 1)) }] },
}));
