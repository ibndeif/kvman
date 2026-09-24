import { z } from 'zod';
import { capabilitiesSchema } from './extension/capabilities.ts';
import { descriptionSchema, iconNameSchema, localeSchema, packageNameSchema, publicNameSchema } from './extension/grammar.ts';
import { integrityProblem, sourceSchema } from './extension/source.ts';
import { translationsSchema } from './extension/translations.ts';
import { typeNameSchema } from './identifiers.ts';
import { jsonSchema } from './json.ts';
import { modelRefSchema } from './llm.ts';
import { textSchema } from './text.ts';

const presetExtensionSchema = z
  .strictObject({
    source: sourceSchema,
    integrity: z.string().min(1).optional(),
    digest: z.string().regex(/^[0-9a-f]{64}$/, 'expected a snapshot digest (64 lowercase hex characters)').optional(),
    enabled: z.boolean(),
    grants: capabilitiesSchema,
    disable: z.array(typeNameSchema).optional(),
  })
  .superRefine((entry, check) => {
    const problem = integrityProblem(entry.source, entry.integrity);
    if (problem !== undefined) check.addIssue({ code: 'custom', path: ['integrity'], message: problem });
  });

const presetContributionName = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, 'expected a kebab-case name');
const presetContributionSchema = z.looseObject({ name: presetContributionName, description: descriptionSchema });

const homeRouteSchema = z.string().regex(/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/, 'app.home is the route of a page without :params');

export const presetSchema = z.strictObject({
  presetVersion: z.literal(1, 'requires a newer kvman'),
  id: z.string().regex(/^[a-z0-9-]{1,64}$/, 'preset ids match ^[a-z0-9-]{1,64}$'),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  icon: iconNameSchema.optional(),
  revision: z.number().int().nonnegative(),
  app: z.strictObject({
    title: textSchema,
    icon: iconNameSchema.optional(),
    theme: z
      .strictObject({
        accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'the accent is a color #RRGGBB').optional(),
        mode: z.enum(['system', 'light', 'dark']).optional(),
      })
      .optional(),
    home: homeRouteSchema,
  }),
  extensions: z.record(packageNameSchema, presetExtensionSchema),
  layout: z
    .strictObject({
      sidebar: z.enum(['expanded', 'collapsed', 'hidden']).optional(),
      statusbar: z.enum(['shown', 'hidden']).optional(),
      order: z.record(publicNameSchema, z.array(z.string().min(1))).optional(),
    })
    .optional(),
  hidden: z.array(publicNameSchema).optional(),
  labels: z.record(publicNameSchema, z.union([z.string(), z.record(localeSchema, z.string())])).optional(),
  pages: z.array(presetContributionSchema).optional(),
  navGroups: z.array(presetContributionSchema).optional(),
  nav: z.array(presetContributionSchema).optional(),
  translations: translationsSchema.optional(),
  config: z.record(packageNameSchema, jsonSchema).optional(),
  llm: z
    .strictObject({
      defaults: z
        .strictObject({
          chat: modelRefSchema.optional(),
          summary: modelRefSchema.optional(),
          extension: modelRefSchema.optional(),
          child: modelRefSchema.optional(),
        })
        .optional(),
    })
    .optional(),
});
export type Preset = z.infer<typeof presetSchema>;
