import { createHash } from 'node:crypto';
import { defineExtension, z, type BlobStore, type Ctx, type Ext } from '@kvman/sdk';
import { attempt } from './attempts.ts';

const chunk = 1024 * 1024;

// A stream of `size` bytes in 1 MB chunks, made as it is read.
function bytesStream(size: number): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= size) {
        controller.close();
        return;
      }
      const next = Math.min(chunk, size - sent);
      controller.enqueue(new Uint8Array(next).fill(sent % 251));
      sent += next;
    },
  });
}

function blobsOf(ctx: Ctx, global: boolean | undefined): BlobStore {
  return global === true ? ctx.store.global.blobs : ctx.store.blobs;
}

async function streamed(stream: ReadableStream<Uint8Array>): Promise<{ length: number; sha256: string }> {
  const hash = createHash('sha256');
  let length = 0;
  for await (const part of stream) {
    hash.update(part);
    length += part.byteLength;
  }
  return { length, sha256: hash.digest('hex') };
}

const put = z.object({
  text: z.string().optional(), base64: z.string().optional(), streamBytes: z.number().optional(), mime: z.string().optional(), name: z.string().optional(),
  global: z.boolean().optional(), workspacePath: z.string().optional(),
});

const read = z.object({ blobId: z.string(), as: z.enum(['text', 'bytes', 'stream', 'stat']), global: z.boolean().optional() });

// Puts, reads, keeps, and hands over blobs for the M2.5 tests (plan 04 §4.3, §4.6).
export default defineExtension({ name: '@acme/keeper', namespace: 'keeper', title: 'Keeper', description: 'Keeps blobs.' }, (ext) => {
  ext.requestCapability('calls', { reason: 'Hands blobs to the holder.', types: ['holder.*'] });
  ext.registerError('keeper/BROKEN', { description: 'Failed on purpose.', title: 'The keeper failed on purpose' });
  ext.registerEvent('keeper.shared', { description: 'A blob was shared.', payload: z.object({ blobId: z.blobId() }) });
  ext.registerEvent('keeper.announced', { description: 'A text was announced.', payload: z.object({ text: z.string() }) });
  ext.registerCommand('keeper.announce', {
    description: 'Publishes a text.', input: z.object({ size: z.number() }),
    handle: async ({ size }, ctx) => {
      ctx.publish('keeper.announced', { text: 'e'.repeat(size) });
      return {};
    },
  });
  ext.registerCommand('keeper.echo', {
    description: 'Returns a text of the size asked.', input: z.object({ size: z.number() }),
    handle: async ({ size }) => ({ text: 'r'.repeat(size) }),
  });
  ext.registerCommand('keeper.put', {
    description: 'Puts a blob.', input: put,
    handle: async ({ text, base64, streamBytes, mime, name, global, workspacePath }, ctx) => attempt(async () => {
      const bytes = base64 === undefined ? bytesStream(streamBytes ?? 0) : Buffer.from(base64, 'base64');
      const source = workspacePath === undefined ? text ?? bytes : { workspacePath };
      return blobsOf(ctx, global).put(source, { ...(mime === undefined ? {} : { mime }), ...(name === undefined ? {} : { name }) });
    }),
  });
  ext.registerCommand('keeper.read', {
    description: 'Reads any blob id, handing nothing over.', input: read,
    handle: async ({ blobId, as, global }, ctx) => attempt(async () => {
      const blobs = blobsOf(ctx, global);
      if (as === 'text') return blobs.text(blobId);
      if (as === 'stat') return (await blobs.stat(blobId)) ?? null;
      if (as === 'stream') return streamed(await blobs.stream(blobId));
      const bytes = await blobs.bytes(blobId);
      return { length: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
    }),
  });
  ext.registerCommand('keeper.keep', {
    description: 'Keeps or releases a blob.', input: z.object({ blobId: z.string(), release: z.boolean().optional() }),
    handle: async ({ blobId, release }, ctx) => {
      if (release === true) ctx.store.blobs.release(blobId);
      else ctx.store.blobs.keep(blobId);
      return {};
    },
  });
  ext.registerCommand('keeper.give', {
    description: 'Puts a blob and hands it to the holder.', input: z.object({ text: z.string() }),
    handle: async ({ text }, ctx) => {
      const { blobId } = await ctx.store.blobs.put(text);
      return ctx.command('holder.take', { blobId });
    },
  });
  ext.registerCommand('keeper.send', {
    description: 'Sends any blob id to the holder.', input: z.object({ blobId: z.string() }),
    handle: async ({ blobId }, ctx) => {
      ctx.send('holder.take', { blobId });
      return {};
    },
  });
  ext.registerCommand('keeper.call', {
    description: 'Calls the holder with any blob id.', input: z.object({ blobId: z.string() }),
    handle: async ({ blobId }, ctx) => attempt(() => ctx.command('holder.take', { blobId })),
  });
  ext.registerCommand('keeper.share', {
    description: 'Publishes a blob id.', input: z.object({ blobId: z.string().optional(), text: z.string().optional() }),
    handle: async ({ blobId, text }, ctx) => {
      const shared = blobId ?? (await ctx.store.blobs.put(text ?? '')).blobId;
      ctx.publish('keeper.shared', { blobId: shared });
      return { blobId: shared };
    },
  });
  ext.registerCommand('keeper.slow', {
    description: 'Puts a blob, then waits for the holder.', input: z.object({ text: z.string() }), timeoutMs: 3 * 3_600_000,
    handle: async ({ text }, ctx) => {
      const { blobId } = await ctx.store.blobs.put(text);
      await ctx.command('holder.gate', {});
      return { blobId };
    },
  });
  ext.registerCommand('keeper.return', {
    description: 'Returns any blob id as its own.', input: z.object({ blobId: z.string() }), output: z.object({ blobId: z.blobId() }),
    handle: async ({ blobId }) => ({ blobId }),
  });
  ext.registerCommand('keeper.fail', {
    description: 'Puts a blob, then fails.', input: z.object({ text: z.string() }),
    handle: async ({ text }, ctx) => {
      await ctx.store.blobs.put(text);
      throw ctx.problem('keeper/BROKEN');
    },
  });
  registerHandOvers(ext);
});

function registerHandOvers(ext: Ext): void {
  ext.registerCommand('keeper.fetch', {
    description: 'Reads the blob named in the holder’s reply and query result.', input: z.object({ text: z.string() }),
    handle: async ({ text }, ctx) => {
      const made = z.object({ blobId: z.string() }).parse(await ctx.command('holder.make', { text }));
      const found = z.object({ blobId: z.string() }).parse(await ctx.query('holder.find', {}));
      return { made: await ctx.store.blobs.text(made.blobId), found: await ctx.store.blobs.text(found.blobId) };
    },
  });
  ext.registerCommand('keeper.continue', {
    description: 'Asks the holder to make a blob, with a continuation.', input: z.object({ text: z.string() }),
    handle: async ({ text }, ctx) => {
      ctx.send('holder.make', { text }, { onReply: { type: 'keeper.made' } });
      return {};
    },
  });
  ext.registerCommand('keeper.made', {
    description: 'Reads the blob the holder made.', access: 'internal',
    input: z.object({ reply: z.object({ ok: z.boolean(), value: z.object({ blobId: z.string() }).optional() }).loose(), context: z.record(z.string(), z.string()).optional() }),
    handle: async ({ reply }, ctx) => {
      ctx.store.kv.set('made', reply.value === undefined ? null : await ctx.store.blobs.text(reply.value.blobId));
      return {};
    },
  });
  ext.registerQuery('keeper.look', {
    description: 'Reads a blob in a query.', input: z.object({ blobId: z.string() }), output: z.object({ text: z.string() }),
    handle: async ({ blobId }, ctx) => ({ text: await ctx.store.blobs.text(blobId) }),
  });
  ext.registerQuery('keeper.point', {
    description: 'Returns any blob id from a query.', input: z.object({ blobId: z.string() }), output: z.object({ blobId: z.blobId() }),
    handle: async ({ blobId }) => ({ blobId }),
  });
  ext.registerQuery('keeper.query.put', {
    description: 'Tries to write blobs in a query.', input: z.object({ blobId: z.string() }), output: z.array(z.unknown()),
    handle: async ({ blobId }, ctx) => [
      await attempt(async () => (await ctx.store.blobs.put('from a query')).blobId),
      await attempt(async () => {
        ctx.store.blobs.keep(blobId);
        return null;
      }),
      await attempt(async () => {
        ctx.store.blobs.release(blobId);
        return null;
      }),
    ],
  });
  ext.registerCommand('keeper.global.put', {
    description: 'Puts from a handler without a workspace.', input: z.object({ text: z.string() }), scope: 'global',
    handle: async ({ text }, ctx) => [await attempt(async () => (await ctx.store.blobs.put(text)).blobId), await attempt(async () => (await ctx.store.global.blobs.put(text)).blobId)],
  });
}
