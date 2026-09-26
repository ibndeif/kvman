import { z } from 'zod';
import { packageNameSchema } from './extension/grammar.ts';
import { jsonSchema } from './json.ts';
import { problemSchema } from './problem.ts';

// Files the install pipeline reads and writes (06 §6.2, §6.9, ADRs 0115–0118), validated wherever they are read.

const relativePathSchema = z.string().min(1).refine((path) => !path.startsWith('/') && !path.split('/').includes('..'), 'expected a path inside the snapshot');

// files.json: every file of a snapshot, and each symlink that stays inside it, sorted by path.
export const fileListEntrySchema = z.union([
  z.strictObject({ path: relativePathSchema, size: z.number().int().nonnegative(), sha256: z.string().regex(/^[0-9a-f]{64}$/) }),
  z.strictObject({ path: relativePathSchema, link: z.string().min(1) }),
]);
export type FileListEntry = z.infer<typeof fileListEntrySchema>;

export const fileListSchema = z.array(fileListEntrySchema);
export type FileList = z.infer<typeof fileListSchema>;

// digests.json next to the builtin tarballs: each package's tarball and the snapshot digest of its unpacked tree.
export const builtinDigestsSchema = z.record(packageNameSchema, z.strictObject({ file: z.string().regex(/^[a-z0-9._~-]+\.tgz$/), digest: z.string().regex(/^[0-9a-f]{64}$/) }));
export type BuiltinDigests = z.infer<typeof builtinDigestsSchema>;

const dependencyMapSchema = z.record(z.string(), z.string());

// The package.json fields the pipeline reads; the rest are the package's own business.
export const packageJsonSchema = z.looseObject({
  name: z.string().exactOptional(),
  version: z.string().exactOptional(),
  description: z.string().exactOptional(),
  main: z.string().exactOptional(),
  dependencies: dependencyMapSchema.exactOptional(),
  peerDependencies: dependencyMapSchema.exactOptional(),
});
export type PackageJson = z.infer<typeof packageJsonSchema>;

// The registry's metadata of one published version (npm's GET /<name>/<version>).
export const npmVersionMetadataSchema = z.looseObject({
  name: z.string().min(1),
  version: z.string().min(1),
  dist: z.looseObject({ tarball: z.url(), integrity: z.string().regex(/^sha512-[A-Za-z0-9+/]+={0,2}$/) }),
});
export type NpmVersionMetadata = z.infer<typeof npmVersionMetadataSchema>;

// The install-time loader's one message to the kernel (03 §3.5): the recorded manifest as JSON, which the kernel
// validates again, or the problem that stopped it.
export const loaderResultSchema = z.union([
  z.strictObject({ ok: z.literal(true), manifest: jsonSchema }),
  z.strictObject({ ok: z.literal(false), problem: problemSchema }),
]);
export type LoaderResult = z.infer<typeof loaderResultSchema>;

export const loaderRequestSchema = z.strictObject({ entry: z.string().min(1), packageName: z.string().min(1), version: z.string().min(1), correlationId: z.string().min(1) });
export type LoaderRequest = z.infer<typeof loaderRequestSchema>;
