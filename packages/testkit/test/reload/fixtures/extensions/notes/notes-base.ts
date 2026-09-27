import { z, type Ctx, type Ext, type MigrationDef } from '@kvman/sdk';

// One version of Notes, the reload tests' fixture: its package version, its data version with steps and compatible
// versions, the item field of that data version, the cap on its config `limit`, and whether it requests `process`
// or still provides `notes.items.list`.
export type NotesVersion = {
  version: string;
  data?: { version: number; migrations: MigrationDef[]; compatibleWith?: number[] };
  itemField?: 'text' | 'title';
  limitMax?: number;
  process?: boolean;
  narrow?: boolean;
};

const empty = z.object({});

function aborted(ctx: Ctx): Promise<void> {
  return new Promise((resolve) => {
    if (ctx.signal.aborted) resolve();
    ctx.signal.addEventListener('abort', () => resolve());
  });
}

export const notesMeta = { name: '@acme/notes', namespace: 'notes', title: 'Notes', description: 'Notes for the reload tests.' };

export function notesSetup(notes: NotesVersion): (ext: Ext) => void {
  const field = notes.itemField ?? 'text';
  return (ext) => {
    ext.requestIsolation('shared', { reason: 'Runs in every isolation mode for the reload tests.' });
    if (notes.process === true) ext.requestCapability('process', { reason: 'Runs note tools.' });
    if (notes.data !== undefined) ext.registerDataVersion(notes.data.version, { migrations: notes.data.migrations, compatibleWith: notes.data.compatibleWith ?? [] });
    const items = ext.registerCollection('items', {
      description: 'The notes.',
      schema: z.object({ id: z.string(), [field]: z.string(), order: z.number().optional() }),
    });
    ext.registerLog('history:*', { description: 'Each note history.', entry: z.record(z.string(), z.unknown()) });
    ext.registerLog('audit', { description: 'What was added.', entry: z.record(z.string(), z.unknown()) });
    ext.registerConfig({
      scope: 'both',
      schema: z.object({
        limit: z.number().max(notes.limitMax ?? 1000).optional().describe('How many notes a page shows.'),
        blockStep3: z.boolean().optional().describe('Makes migration step 3 fail, for the tests.'),
        migrated: z.boolean().optional().describe('Set by a migration step.'),
      }),
    });
    ext.registerCommand('notes.add', {
      description: 'Adds a note in every kind of storage.', input: z.object({ id: z.string(), text: z.string(), global: z.boolean().default(false) }),
      handle: async ({ id, text, global }, ctx) => {
        const store = global ? ctx.store.global : ctx.store;
        store.collection(items).put({ id, [field]: text });
        store.kv.set(`item:${id}`, text);
        await store.log('history:*', id).append({ text });
        await store.log('audit').append({ id });
        return {};
      },
    });
    ext.registerCommand('notes.hold', { description: 'Runs until it is aborted.', input: empty, handle: async (_input, ctx) => {
      await aborted(ctx);
      return {};
    } });
    ext.registerQuery('notes.version.get', { description: 'The running version.', input: empty, output: z.object({ version: z.string() }), handle: async () => ({ version: notes.version }) });
    if (notes.narrow !== true) {
      ext.registerQuery('notes.items.list', {
        description: 'The notes of the workspace.', input: empty, output: z.array(z.record(z.string(), z.unknown())), handle: async (_input, ctx) => ctx.store.collection(items).find(),
      });
    }
  };
}
