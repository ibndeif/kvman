import { z } from 'zod';
import { capabilitiesSchema } from './extension/capabilities.ts';
import { iconNameSchema, localeSchema, packageNameSchema, publicNameSchema } from './extension/grammar.ts';
import { integrityProblem, sourceSchema } from './extension/source.ts';
import { translationsSchema } from './extension/translations.ts';
import { typeNameSchema } from './identifiers.ts';
import { jsonSchema } from './json.ts';
import { modelRefSchema } from './llm.ts';
import { textSchema } from './text.ts';
import { navGroupDefSchema, navItemDefSchema, pageDefSchema } from './ui/contributions.ts';
import { withIdentity } from './ui/entries.ts';

// 07 §7.6: the platform pack namespaces hidden as one group.
export const platformNamespaces = ['settings', 'presets', 'extensions', 'inspector'] as const;

export const presetIdSchema = z.string().regex(/^[a-z0-9-]{1,64}$/, 'preset ids match ^[a-z0-9-]{1,64}$');

const presetExtensionSchema = z
  .strictObject({
    source: sourceSchema,
    integrity: z.string().min(1).exactOptional(),
    digest: z.string().regex(/^[0-9a-f]{64}$/, 'expected a snapshot digest (64 lowercase hex characters)').exactOptional(),
    enabled: z.boolean(),
    grants: capabilitiesSchema,
    disable: z.array(typeNameSchema).exactOptional(),
  })
  .superRefine((entry, check) => {
    const problem = integrityProblem(entry.source, entry.integrity);
    if (problem !== undefined) check.addIssue({ code: 'custom', path: ['integrity'], message: problem });
  });

const presetContributionName = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, 'expected a kebab-case name');
const presetEntries = (definition: z.ZodType) => z.array(withIdentity(definition, 'name', presetContributionName));

const homeRouteSchema = z.string().regex(/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/, 'app.home is the route of a page without :params');

export const presetSchema = z.strictObject({
  presetVersion: z.literal(1, 'requires a newer kvman'),
  id: presetIdSchema,
  name: z.string().min(1),
  description: z.string().min(1).exactOptional(),
  icon: iconNameSchema.exactOptional(),
  revision: z.number().int().nonnegative(),
  app: z.strictObject({
    title: textSchema,
    icon: iconNameSchema.exactOptional(),
    theme: z
      .strictObject({
        accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'the accent is a color #RRGGBB').exactOptional(),
        mode: z.enum(['system', 'light', 'dark']).exactOptional(),
      })
      .exactOptional(),
    home: homeRouteSchema,
  }),
  extensions: z.record(packageNameSchema, presetExtensionSchema),
  layout: z
    .strictObject({
      sidebar: z.enum(['expanded', 'collapsed', 'hidden']).exactOptional(),
      statusbar: z.enum(['shown', 'hidden']).exactOptional(),
      order: z.record(publicNameSchema, z.array(z.string().min(1))).exactOptional(),
    })
    .exactOptional(),
  hidden: z.array(publicNameSchema).exactOptional(),
  labels: z.record(publicNameSchema, z.union([z.string(), z.record(localeSchema, z.string())])).exactOptional(),
  pages: presetEntries(pageDefSchema).exactOptional(),
  navGroups: presetEntries(navGroupDefSchema).exactOptional(),
  nav: presetEntries(navItemDefSchema).exactOptional(),
  translations: translationsSchema.exactOptional(),
  config: z.record(packageNameSchema, jsonSchema).exactOptional(),
  llm: z
    .strictObject({
      defaults: z
        .strictObject({
          chat: modelRefSchema.exactOptional(),
          summary: modelRefSchema.exactOptional(),
          extension: modelRefSchema.exactOptional(),
          child: modelRefSchema.exactOptional(),
        })
        .exactOptional(),
    })
    .exactOptional(),
});
export type Preset = z.infer<typeof presetSchema>;
