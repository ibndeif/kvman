import { defineExtension } from '@kvman/sdk';
import { notesMeta, notesSetup } from './notes-base.ts';
import { renameItems } from './notes-steps.ts';

// Caps the config limit at 10; step 2 sets the global limit and the limit of every workspace with notes to 10.
export default defineExtension(notesMeta, notesSetup({
  version: '2.3.0', itemField: 'title', limitMax: 10,
  data: {
    version: 2,
    migrations: [{
      to: 2,
      up: async (m) => {
        const workspaces = await renameItems(m);
        m.config.set('global', { ...((await m.config.get('global')) ?? {}), limit: 10 });
        for (const workspaceId of workspaces) {
          const stored = await m.config.get('workspace', workspaceId);
          if (stored !== undefined) m.config.set('workspace', { ...stored, limit: 10 }, workspaceId);
        }
      },
    }],
  },
}));
