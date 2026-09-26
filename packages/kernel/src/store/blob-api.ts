import {
  blobChunkSchema, blobIdSchema, blobInfoSchema, blobLimits, blobNameSchema, blobStatSchema, blobUploadSchema, mimeTypeSchema, type BlobInfo, type BlobStat,
  type Json, type RpcCall,
} from '@kvman/protocol';
import type { BlobPutOptions, BlobSource, BlobStore } from '@kvman/sdk';
import { requireWritable, storeFailure, type ScopeBinding } from './store-context.ts';

// Where a handler's blob calls go: the kernel answers each one, or throws its ProblemError (03 §3.5).
export interface BlobChannel {
  call(call: RpcCall): Promise<Json | undefined>;
}

function base64Of(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
}

// A chunk of at most 1 MB, the size one frame carries.
function* chunksOf(bytes: Uint8Array): Generator<Uint8Array> {
  for (let offset = 0; offset < bytes.byteLength; offset += blobLimits.chunkBytes) yield bytes.subarray(offset, offset + blobLimits.chunkBytes);
}

async function* streamChunks(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    yield* chunksOf(value);
  }
}

function checked<Value>(binding: ScopeBinding, result: { success: true; data: Value } | { success: false }, what: string): Value {
  if (result.success) return result.data;
  throw storeFailure(binding.context, 'VALIDATION_FAILED', { detail: `the ${what} is not valid` });
}

// 04 §4.3, ADR 0134: ctx.store.blobs. Bytes go to the kernel in chunks, which it hashes and stores; reads come back in
// chunks after the kernel checked the handler may read the blob; keep and release wait for the commit.
export function createBlobStore(binding: ScopeBinding): BlobStore {
  const { context, scope } = binding;
  const call = (rpc: RpcCall): Promise<Json | undefined> => context.blobs.call(rpc);
  const blobIdOf = (blobId: string): string => checked(binding, blobIdSchema.safeParse(blobId), 'blob id');

  async function stat(blobId: string): Promise<BlobStat | undefined> {
    const value = await call({ name: 'blobs.stat', blobId: blobIdOf(blobId) });
    return value === undefined ? undefined : blobStatSchema.parse(value);
  }

  async function sizeOf(blobId: string): Promise<number> {
    const found = await stat(blobId);
    if (found === undefined) throw storeFailure(context, 'BLOB_NOT_FOUND', { detail: `no blob ${blobId} exists` });
    return found.size;
  }

  async function* read(blobId: string, size: number): AsyncGenerator<Uint8Array> {
    for (let offset = 0; offset < size; offset += blobLimits.chunkBytes) {
      const chunk = blobChunkSchema.parse(await call({ name: 'blobs.read', blobId, offset, length: Math.min(blobLimits.chunkBytes, size - offset) }));
      yield Buffer.from(chunk.bytes, 'base64');
    }
  }

  async function bytes(blobId: string): Promise<Uint8Array> {
    const size = await sizeOf(blobIdOf(blobId));
    if (size > blobLimits.readBytes) {
      throw storeFailure(context, 'BLOB_TOO_LARGE', { params: { max: blobLimits.readBytes }, hint: 'read a blob over 16 MB with ctx.store.blobs.stream' });
    }
    const parts: Uint8Array[] = [];
    for await (const part of read(blobId, size)) parts.push(part);
    return Buffer.concat(parts);
  }

  async function put(source: BlobSource, options: BlobPutOptions = {}): Promise<BlobInfo> {
    requireWritable(context);
    const mime = options.mime === undefined ? undefined : checked(binding, mimeTypeSchema.safeParse(options.mime), 'mime type');
    const fileName = options.name === undefined ? undefined : checked(binding, blobNameSchema.safeParse(options.name), 'blob name');
    const meta = { scope, ...(fileName === undefined ? {} : { fileName }) };
    if (typeof source === 'object' && 'workspacePath' in source) {
      return blobInfoSchema.parse(await call({ name: 'blobs.put.file', path: source.workspacePath, ...meta, ...(mime === undefined ? {} : { mime }) }));
    }
    const text = typeof source === 'string';
    const { upload } = blobUploadSchema.parse(await call({ name: 'blobs.put.open' }));
    const chunks = text ? chunksOf(Buffer.from(source, 'utf8')) : source instanceof Uint8Array ? chunksOf(source) : streamChunks(source);
    for await (const chunk of chunks) await call({ name: 'blobs.put.write', upload, bytes: base64Of(chunk) });
    const typed = mime ?? (text ? 'text/plain' : undefined);
    return blobInfoSchema.parse(await call({ name: 'blobs.put.close', upload, ...meta, ...(typed === undefined ? {} : { mime: typed }) }));
  }

  return {
    put,
    text: async (blobId) => new TextDecoder().decode(await bytes(blobId)),
    bytes,
    stream: async (blobId) => {
      const size = await sizeOf(blobIdOf(blobId));
      const parts = read(blobId, size);
      return new ReadableStream<Uint8Array>({
        pull: async (controller) => {
          const next = await parts.next();
          if (next.done) controller.close();
          else controller.enqueue(next.value);
        },
      });
    },
    stat,
    keep: (blobId) => {
      requireWritable(context);
      context.pending.blobRefs.push({ blobId: blobIdOf(blobId), scope, op: 'keep' });
    },
    release: (blobId) => {
      requireWritable(context);
      context.pending.blobRefs.push({ blobId: blobIdOf(blobId), scope, op: 'release' });
    },
  };
}
