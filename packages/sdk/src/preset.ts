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

/** Accepts a source that carries the extension's name: `bundled:<name>`, `npm:<name>@<exact version>`, or `path:<folder>`. */
export const installSourceSchema = z.union([
  z.templateLiteral(['bundled:', packageNameSchema]),
  z.templateLiteral(['npm:', packageNameSchema, '@', exactVersionSchema]),
  z.templateLiteral(['path:', z.string().min(1)]),
]);

/** A source as a person gives it to `kernel.extensions.install`. */
export type InstallSource = z.infer<typeof installSourceSchema>;

/** Accepts a preset: its name, the extensions of the run, and preset-level setting values; unknown keys fail. */
export const presetSchema = z.strictObject({
  name: z.string().min(1),
  extensions: z.record(packageNameSchema, extensionSourceSchema),
  settings: z.record(z.string().min(1), jsonSchema).optional(),
});

/** A preset: the whole app for one run. */
export type Preset = z.infer<typeof presetSchema>;

/** Where the running preset came from: bundled with kvman, a person's `<home>/presets/` copy, or a file. */
export const presetOriginSchema = z.enum(['bundled', 'home', 'file']);

/** A preset as stored now, with where it came from and the file an edit writes. */
export const presetStateSchema = presetSchema.extend({ origin: presetOriginSchema, file: z.string().exactOptional() });

/** A preset as stored now. */
export type PresetState = z.infer<typeof presetStateSchema>;
