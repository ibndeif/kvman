import { z } from 'zod';
import { jsonSchema } from './json.ts';
import { exactVersionSchema, packageNameSchema } from './manifest.ts';

/** Accepts where an extension comes from: `bundled`, `npm:<exact version>`, or `path:<folder>`. */
export const extensionSourceSchema = z.union([
  z.literal('bundled'),
  z.templateLiteral(['npm:', exactVersionSchema]),
  z.templateLiteral(['path:', z.string().min(1)]),
]);

/** Where an extension comes from. */
export type ExtensionSource = z.infer<typeof extensionSourceSchema>;

/** Accepts a preset: its name, the extensions of the run, and preset-level setting values; unknown keys fail. */
export const presetSchema = z.strictObject({
  name: z.string().min(1),
  extensions: z.record(packageNameSchema, extensionSourceSchema),
  settings: z.record(z.string().min(1), jsonSchema).optional(),
});

/** A preset: the whole app for one run. */
export type Preset = z.infer<typeof presetSchema>;
