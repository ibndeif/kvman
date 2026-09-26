import { z } from 'zod';
import { filterSchema } from './filter/filter-schema.ts';
import { jsonObjectSchema, jsonSchema } from './json.ts';
import { storeScopeSchema } from './unit-of-work.ts';

// ADR 0131: a sandboxed host's store reads, served by the kernel's read pool. The frame names only the scope; the
// kernel sets the owner (the invocation's extension) and the workspace (the invocation's) itself.

const rowCountSchema = z.number().int().positive();
const seqBoundSchema = z.number().int().nonnegative();
const collectionNameSchema = z.string().min(1);
const logNameSchema = z.string().min(1);

export const orderBySchema = z.array(z.tuple([z.string().min(1), z.enum(['asc', 'desc'])]));

export const storeReadSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('kv.get'), scope: storeScopeSchema, key: z.string().min(1) }),
  z.strictObject({ op: z.literal('kv.list'), scope: storeScopeSchema, prefix: z.string(), maxRows: rowCountSchema }),
  z.strictObject({ op: z.literal('doc.get'), scope: storeScopeSchema, collection: collectionNameSchema, id: z.string().min(1) }),
  z.strictObject({
    op: z.literal('doc.find'), scope: storeScopeSchema, collection: collectionNameSchema, where: filterSchema, orderBy: orderBySchema,
    limit: rowCountSchema.exactOptional(),
  }),
  z.strictObject({ op: z.literal('doc.count'), scope: storeScopeSchema, collection: collectionNameSchema, where: filterSchema }),
  z.strictObject({ op: z.literal('doc.matching-ids'), scope: storeScopeSchema, collection: collectionNameSchema, where: filterSchema, ids: z.array(z.string().min(1)) }),
  z.strictObject({ op: z.literal('log.last-seq'), scope: storeScopeSchema, log: logNameSchema }),
  z.strictObject({ op: z.literal('log.read'), scope: storeScopeSchema, log: logNameSchema, after: seqBoundSchema, before: seqBoundSchema, maxRows: rowCountSchema }),
  z.strictObject({ op: z.literal('log.read-newest'), scope: storeScopeSchema, log: logNameSchema, after: seqBoundSchema, before: seqBoundSchema, count: rowCountSchema }),
]);
export type StoreRead = z.infer<typeof storeReadSchema>;

const versionSchema = z.number().int().positive();

// What each read answers.
export const versionedValueSchema = z.strictObject({ value: jsonSchema, version: versionSchema });
export const kvRowSchema = z.strictObject({ key: z.string(), value: jsonSchema, version: versionSchema });
export const storedDocumentSchema = z.strictObject({ id: z.string(), data: jsonObjectSchema, version: versionSchema });
export const storedLogEntrySchema = z.strictObject({ seq: z.number().int().positive(), value: jsonSchema });
export const readCountSchema = z.number().int().nonnegative();
export const documentIdsSchema = z.array(z.string());
