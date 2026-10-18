import { z } from 'zod';

/** Accepts an npm package name, such as `@kvman/kvai`. */
export const packageNameSchema = z.string().regex(/^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/);

/** Accepts an exact semantic version, such as `1.2.3` or `1.0.0-beta.1`. */
export const exactVersionSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/);

/** Accepts an extension namespace: lowercase, with kebab-case words. */
export const namespaceSchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);

/** Accepts a store index: a non-empty list of distinct top-level field names. */
export const storeIndexSchema = z
  .array(z.string().min(1))
  .min(1)
  .refine((fields) => new Set(fields).size === fields.length, { message: 'An index names each field once.' });

/** Accepts `kvman.indexes`: each collection's non-empty list of indexes. */
export const storeIndexesSchema = z.record(z.string().min(1), z.array(storeIndexSchema).min(1));

/** The indexes an extension declares, by collection name. */
export type StoreIndexes = z.infer<typeof storeIndexesSchema>;

/** Accepts the `kvman` field of an extension's package.json; unknown keys fail. */
export const kvmanFieldSchema = z.strictObject({
  namespace: namespaceSchema,
  source: z.string().min(1).optional(),
  web: z.string().min(1).optional(),
  dependencies: z.record(packageNameSchema, z.string().min(1)).optional(),
  indexes: storeIndexesSchema.optional(),
});

/** The `kvman` field: namespace, optional TypeScript source, web folder, extension dependencies with ranges, and store indexes. */
export type KvmanField = z.infer<typeof kvmanFieldSchema>;

/** Accepts an extension's package.json: name, version, `main`, the `@kvman/sdk` peer, and the `kvman` field. */
export const extensionManifestSchema = z.object({
  name: packageNameSchema,
  version: exactVersionSchema,
  main: z.string().min(1),
  peerDependencies: z.looseObject({ '@kvman/sdk': z.string().min(1) }),
  kvman: kvmanFieldSchema,
});

/** The parts of an extension's package.json that the kernel reads. */
export type ExtensionManifest = z.infer<typeof extensionManifestSchema>;
