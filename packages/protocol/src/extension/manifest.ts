import { z } from 'zod';
import { errorCodePattern } from '../naming/name-patterns.ts';
import { typeNameSchema } from '../identifiers.ts';
import { textSchema } from '../text.ts';
import { capabilityRequestSchema, isolationRequestSchema } from './capabilities.ts';
import { configScopeSchema } from './config-meta.ts';
import {
  contractSchema, descriptionSchema, iconNameSchema, jsonSchemaDocumentSchema, logFamilySchema, namespaceSchema,
  packageNameSchema, positiveIntegerSchema, privateNameSchema, publicNameSchema, semverSchema,
} from './grammar.ts';
import { llmManifestSchema } from './manifest-llm.ts';
import { scheduleEntrySchema, subscriptionEntrySchema, typeEntrySchema } from './manifest-types.ts';
import { translationsSchema } from './translations.ts';
import {
  actionDefSchema, navGroupDefSchema, navItemDefSchema, pageDefSchema, panelDefSchema, rendererDefSchema, rendererTargetDefSchema,
  settingsSectionDefSchema, slotDefSchema, statusItemDefSchema, toolbarItemDefSchema,
} from '../ui/contributions.ts';
import { componentDefSchema, withIdentity } from '../ui/entries.ts';

const metaSchema = z.strictObject({
  name: packageNameSchema,
  version: semverSchema,
  namespace: namespaceSchema,
  title: textSchema,
  summary: textSchema.optional(),
  icon: iconNameSchema.optional(),
  description: descriptionSchema,
  implements: z.array(contractSchema),
});

const permissionsSchema = z.strictObject({
  capabilities: z.array(capabilityRequestSchema),
  isolation: isolationRequestSchema.nullable(),
  requireTypes: z.array(z.strictObject({ types: z.array(typeNameSchema).min(1), reason: textSchema })),
  requireComponents: z.array(z.strictObject({ components: z.array(publicNameSchema).min(1), reason: textSchema })),
});

const dataSchema = z.strictObject({
  version: positiveIntegerSchema,
  compatibleWith: z.array(positiveIntegerSchema),
  migrations: z.array(
    z.strictObject({ to: z.number().int().min(2), handler: z.string() }).superRefine((migration, check) => {
      if (migration.handler !== `migration:${migration.to}`) {
        check.addIssue({ code: 'custom', path: ['handler'], message: `expected "migration:${migration.to}"` });
      }
    }),
  ),
  collections: z.array(
    z.strictObject({
      name: privateNameSchema,
      description: descriptionSchema,
      schema: jsonSchemaDocumentSchema,
      idField: z.string().min(1),
      indexes: z.array(z.array(z.string().min(1)).min(1)).optional(),
    }),
  ),
  logs: z.array(z.strictObject({ prefix: logFamilySchema, description: descriptionSchema, entry: jsonSchemaDocumentSchema })),
});

const entitySchema = z.strictObject({
  name: publicNameSchema,
  description: descriptionSchema,
  title: textSchema,
  schema: jsonSchemaDocumentSchema,
  idField: z.string().min(1),
  display: z.strictObject({ title: textSchema, subtitle: textSchema.optional(), icon: iconNameSchema.optional() }),
  route: z.string().startsWith('/').optional(),
});

const errorSchema = z.strictObject({
  code: z.string().regex(errorCodePattern, 'expected "<namespace>/UPPER_SNAKE"'),
  description: descriptionSchema,
  title: z.string().min(1),
  retryable: z.boolean(),
  hint: z.string().min(1).optional(),
});

const entries = (definition: z.ZodType) => z.array(withIdentity(definition, 'id', publicNameSchema));

const uiSchema = z.strictObject({
  pages: entries(pageDefSchema),
  navGroups: entries(navGroupDefSchema),
  navItems: entries(navItemDefSchema),
  toolbarItems: entries(toolbarItemDefSchema),
  statusItems: entries(statusItemDefSchema),
  panels: entries(panelDefSchema),
  slots: entries(slotDefSchema),
  actions: entries(actionDefSchema),
  rendererTargets: entries(rendererTargetDefSchema),
  renderers: entries(rendererDefSchema),
  components: entries(componentDefSchema),
  settingsSection: settingsSectionDefSchema.nullable(),
});

export const manifestSchema = z.strictObject({
  manifestVersion: z.literal(1, 'requires a newer kvman'),
  meta: metaSchema,
  permissions: permissionsSchema,
  types: z.array(typeEntrySchema),
  subscriptions: z.array(subscriptionEntrySchema),
  schedules: z.array(scheduleEntrySchema),
  data: dataSchema,
  entities: z.array(entitySchema),
  config: z.strictObject({ scope: configScopeSchema, schema: jsonSchemaDocumentSchema }).nullable(),
  errors: z.array(errorSchema),
  ui: uiSchema,
  translations: translationsSchema.nullable(),
  llm: llmManifestSchema,
});
export type Manifest = z.infer<typeof manifestSchema>;
