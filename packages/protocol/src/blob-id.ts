import { z } from 'zod';

export const blobIdFormat = 'kvman-blob-id';

export const blobIdSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'expected a blob id (64 lowercase hex characters)')
  .meta({ format: blobIdFormat });
