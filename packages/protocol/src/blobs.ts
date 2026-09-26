import { z } from 'zod';
import { blobIdSchema } from './blob-id.ts';
import { storeScopeSchema } from './unit-of-work.ts';

// 04 §4.3, §4.6, 13 §13.7, ADRs 0134, 0135: the fixed blob limits of v2.
export const blobLimits = {
  putBytes: 100 * 1024 * 1024,
  readBytes: 16 * 1024 * 1024,
  inlineBytes: 256 * 1024,
  chunkBytes: 1024 * 1024,
} as const;

// A media type's essence, `type/subtype` in lowercase, without parameters.
export const mimeTypeSchema = z
  .string()
  .max(255)
  .regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/, 'expected a media type such as "text/plain"');
export type MimeType = z.infer<typeof mimeTypeSchema>;

// A file name shown for a blob: no folders, no control characters (ADR 0138).
export const blobNameSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^/\\\p{Cc}]+$/u, 'expected a file name without folders or control characters');

export const blobStatSchema = z.strictObject({ size: z.number().int().nonnegative(), mime: mimeTypeSchema, name: blobNameSchema.exactOptional() });
export type BlobStat = z.infer<typeof blobStatSchema>;

// What a put answers, from ctx.store.blobs.put and PUT /blobs alike (ADR 0134: the first put's mime and name).
export const blobInfoSchema = blobStatSchema.extend({ blobId: blobIdSchema });
export type BlobInfo = z.infer<typeof blobInfoSchema>;

// ctx.store.blobs.keep and release, buffered in the unit of work; the owner comes from the invocation.
export const blobRefChangeSchema = z.strictObject({ blobId: blobIdSchema, scope: storeScopeSchema, op: z.enum(['keep', 'release']) });
export type BlobRefChange = z.infer<typeof blobRefChangeSchema>;

// Bytes between a host and the kernel travel as base64 in frames.
export const base64Schema = z.base64();

// What `blobs.put.open` and `blobs.read` answer a host.
export const blobUploadSchema = z.strictObject({ upload: z.number().int().positive() });
export const blobChunkSchema = z.strictObject({ bytes: base64Schema });
