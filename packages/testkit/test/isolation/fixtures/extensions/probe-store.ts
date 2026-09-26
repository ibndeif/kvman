import { z, type Ext } from '@kvman/sdk';

const item = z.object({ id: z.string(), group: z.string(), body: z.string() });

// Store round trips, own commands and events, and reads of large results.
export function registerProbeStore(ext: Ext): void {
  const items = ext.registerCollection('items', { description: 'Items.', schema: item, indexes: [['group']] });
  const trail = ext.registerLog('trail', { description: 'What probe.work did.', entry: z.object({ text: z.string() }) });
  ext.registerCommand('probe.inner', { description: 'Echoes for probe.work.', input: z.object({ text: z.string() }), access: 'internal', handle: async ({ text }) => ({ echo: text }) });
  ext.registerCommand('probe.work', {
    description: 'Writes and reads the store, calls its own command, and publishes.', input: z.object({ text: z.string() }),
    handle: async ({ text }, ctx) => {
      ctx.store.kv.set('last', text);
      ctx.store.collection(items).put({ id: text, group: 'work', body: text });
      await ctx.store.log(trail).append({ text });
      ctx.publish('probe.worked', { text });
      return {
        kv: await ctx.store.kv.get('last'),
        found: (await ctx.store.collection(items).find({ where: { group: 'work' } })).map((document) => document.id),
        logged: (await ctx.store.log(trail).read()).map((entry) => entry.value.text),
        inner: await ctx.command('probe.inner', { text }),
      };
    },
  });
  ext.subscribe('probe.worked', {
    description: 'Counts its own event.',
    handle: async (_payload, ctx) => {
      ctx.store.kv.set('worked', ((await ctx.store.kv.get<number>('worked')) ?? 0) + 1);
    },
  });
  ext.registerQuery('probe.count', { description: 'How many probe.worked it received.', input: z.object({}), output: z.number(), handle: async (_input, ctx) => (await ctx.store.kv.get<number>('worked')) ?? 0 });
  ext.registerCommand('probe.seed', {
    description: 'Writes documents.', input: z.object({ group: z.string(), prefix: z.string(), from: z.number(), count: z.number(), size: z.number() }),
    handle: async ({ group, prefix, from, count, size }, ctx) => {
      for (let index = from; index < from + count; index += 1) ctx.store.collection(items).put({ id: `${prefix}${index}`, group, body: 'x'.repeat(size) });
      ctx.store.kv.set(`${prefix}-seeded`, count);
      return {};
    },
  });
  ext.registerQuery('probe.scan', {
    description: 'Finds documents.', input: z.object({ where: z.record(z.string(), z.string()).optional(), limit: z.number().optional() }), output: z.object({ count: z.number() }),
    handle: async ({ where, limit }, ctx) => ({ count: (await ctx.store.collection(items).find({ where: where ?? { group: 'bulk' }, ...(limit === undefined ? {} : { limit }) })).length }),
  });
  ext.registerCommand('probe.pending', {
    description: 'Reads its own pending writes.', input: z.object({}),
    handle: async (_input, ctx) => {
      const collection = ctx.store.collection(items);
      collection.put({ id: 'fresh', group: 'p', body: '' });
      collection.delete('p1');
      ctx.store.kv.set('p-extra', 1);
      return {
        found: (await collection.find({ where: { group: 'p' }, orderBy: [['id', 'asc']] })).map((document) => document.id),
        count: await collection.count({ where: { group: 'p' } }),
        fresh: (await collection.get('fresh'))?.id ?? null,
        gone: (await collection.get('p1')) === undefined,
        keys: (await ctx.store.kv.list('p-')).map((entry) => entry.key),
      };
    },
  });
}
