import { defineExtension, z } from '@kvman/sdk';
import { attempt } from './attempts.ts';

// Receives, makes, and keeps blobs for the M2.5 tests; it holds no capabilities (plan 04 §4.6, ADR 0134).
export default defineExtension({ name: '@acme/holder', namespace: 'holder', title: 'Holder', description: 'Holds blobs.' }, (ext) => {
  ext.registerCommand('holder.take', {
    description: 'Reads a blob it was handed, and keeps it when asked.', input: z.object({ blobId: z.blobId(), keep: z.boolean().optional() }),
    handle: async ({ blobId, keep }, ctx) => {
      if (keep === true) ctx.store.blobs.keep(blobId);
      return { text: await ctx.store.blobs.text(blobId) };
    },
  });
  ext.registerCommand('holder.stat', {
    description: 'Stats a blob it was handed.', input: z.object({ blobId: z.blobId() }),
    handle: async ({ blobId }, ctx) => ({ stat: (await ctx.store.blobs.stat(blobId)) ?? null }),
  });
  ext.registerCommand('holder.peek', {
    description: 'Reads any blob id, handed nothing.', input: z.object({ blobId: z.string() }),
    handle: async ({ blobId }, ctx) => attempt(() => ctx.store.blobs.text(blobId)),
  });
  ext.registerCommand('holder.release', {
    description: 'Releases a blob.', input: z.object({ blobId: z.string() }),
    handle: async ({ blobId }, ctx) => {
      ctx.store.blobs.release(blobId);
      return {};
    },
  });
  ext.registerCommand('holder.make', {
    description: 'Makes a blob and names it in its reply.', input: z.object({ text: z.string() }), output: z.object({ blobId: z.blobId() }),
    handle: async ({ text }, ctx) => {
      const { blobId } = await ctx.store.blobs.put(text);
      ctx.store.kv.set('last', blobId);
      return { blobId };
    },
  });
  ext.registerQuery('holder.find', {
    description: 'Names the last blob it made.', input: z.object({}), output: z.object({ blobId: z.blobId() }),
    handle: async (_input, ctx) => ({ blobId: z.string().parse(await ctx.store.kv.get('last')) }),
  });
  ext.registerCommand('holder.echo', {
    description: 'Returns the blob it was handed.', input: z.object({ blobId: z.blobId() }), output: z.object({ blobId: z.blobId() }),
    handle: async ({ blobId }) => ({ blobId }),
  });
  ext.registerCommand('holder.gate', {
    description: 'Waits for holder.open or holder.answer.', input: z.object({}), output: z.object({ blobId: z.blobId().optional() }),
    handle: async (_input, ctx) => ctx.defer(),
  });
  ext.registerCommand('holder.open', {
    description: 'Answers a waiting gate.', input: z.object({ commandId: z.string(), blobId: z.string().optional() }),
    handle: async ({ commandId, blobId }, ctx) => {
      ctx.reply(commandId, blobId === undefined ? {} : { blobId });
      return {};
    },
  });
  ext.subscribe('keeper.announced', {
    description: 'Counts the text a keeper announced.',
    handle: async (payload, ctx) => {
      ctx.store.kv.set('announced', z.object({ text: z.string() }).parse(payload).text.length);
    },
  });
  ext.subscribe('keeper.shared', {
    description: 'Reads the blob a keeper shared.',
    handle: async (payload, ctx) => {
      const { blobId } = z.object({ blobId: z.string() }).parse(payload);
      ctx.store.kv.set('shared', await ctx.store.blobs.text(blobId));
    },
  });
});
