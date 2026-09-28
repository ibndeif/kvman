import { z } from 'zod';
import { iconNameSchema, jsonSchemaDocumentSchema, localeSchema } from '../extension/grammar.ts';
import { catalogSchema } from '../extension/translations.ts';
import { workspaceIdSchema } from '../identifiers.ts';
import { jsonSchema } from '../json.ts';
import { textSchema } from '../text.ts';
import { compositeDefSchema, pageDefSchema } from './contributions.ts';
import { viewNodeSchema } from './view-node.ts';

export const presetLabelSchema = z.union([z.string(), z.record(localeSchema, z.string())]);
export type PresetLabel = z.infer<typeof presetLabelSchema>;

export const uiItemSchema = z.strictObject({
  id: z.string().min(1), owner: z.string().min(1), kind: z.string().min(1), def: jsonSchema,
  label: presetLabelSchema.exactOptional(),
});
export type UiItem = z.infer<typeof uiItemSchema>;

export const uiRegistrySchema = z.strictObject({
  workspaceId: workspaceIdSchema,
  revision: z.string().min(1),
  app: z.strictObject({
    title: textSchema, icon: iconNameSchema.exactOptional(), accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/).exactOptional(),
    themeMode: z.enum(['system', 'light', 'dark']), home: z.string().startsWith('/'),
  }),
  layout: z.strictObject({ sidebar: z.enum(['expanded', 'collapsed', 'hidden']), statusbar: z.enum(['shown', 'hidden']) }),
  slots: z.record(z.string(), z.strictObject({
    owner: z.string().min(1), accepts: z.array(z.string().min(1)), layout: z.string().min(1).exactOptional(),
    max: z.number().int().positive().exactOptional(), items: z.array(uiItemSchema),
  })),
  pages: z.array(z.strictObject({
    id: z.string().min(1), owner: z.string().min(1), route: z.string().startsWith('/'), title: textSchema,
    icon: iconNameSchema.exactOptional(), hidden: z.boolean(), label: presetLabelSchema.exactOptional(),
  })),
  actions: z.record(z.string(), z.array(uiItemSchema)),
  renderers: z.record(z.string(), z.array(uiItemSchema)),
  components: z.array(z.strictObject({
    name: z.string().min(1), owner: z.string().min(1), form: z.enum(['composite', 'widget']), visibility: z.enum(['public', 'private']),
    def: compositeDefSchema.exactOptional(),
  }).superRefine((component, check) => {
    if (component.form === 'widget' && component.def !== undefined) {
      check.addIssue({ code: 'custom', path: ['def'], message: 'only a composite carries its definition' });
    }
  })),
  extensions: z.record(z.string(), z.strictObject({ namespace: z.string().min(1), title: textSchema, icon: iconNameSchema.exactOptional() })),
  settingsSections: z.array(z.strictObject({
    id: z.string().min(1), owner: z.string().min(1), title: textSchema, scopes: z.array(z.enum(['global', 'workspace'])).min(1),
    schema: jsonSchemaDocumentSchema, view: viewNodeSchema.exactOptional(), label: presetLabelSchema.exactOptional(),
  })),
  catalogs: z.strictObject({ defaults: z.record(z.string(), localeSchema), locales: z.array(localeSchema) }),
});
export type UiRegistry = z.infer<typeof uiRegistrySchema>;

export const uiGetRequestSchema = z.strictObject({ workspaceId: workspaceIdSchema });
export type UiGetRequest = z.infer<typeof uiGetRequestSchema>;

export const uiPageGetRequestSchema = z.strictObject({ workspaceId: workspaceIdSchema, pageId: z.string().min(1) });
export type UiPageGetRequest = z.infer<typeof uiPageGetRequestSchema>;

export const uiTranslationsGetRequestSchema = z.strictObject({ workspaceId: workspaceIdSchema });
export type UiTranslationsGetRequest = z.infer<typeof uiTranslationsGetRequestSchema>;

export const uiComponentDefinitionSchema = z.strictObject({
  name: z.string().min(1), owner: z.string().min(1), def: compositeDefSchema,
});
export type UiComponentDefinition = z.infer<typeof uiComponentDefinitionSchema>;

export const uiPageAnswerSchema = z.strictObject({ page: pageDefSchema, components: z.array(uiComponentDefinitionSchema) });
export type UiPageAnswer = z.infer<typeof uiPageAnswerSchema>;

export const uiTranslationsAnswerSchema = z.strictObject({
  locale: localeSchema, catalogs: z.record(z.string().min(1), z.record(localeSchema, catalogSchema)),
});
export type UiTranslationsAnswer = z.infer<typeof uiTranslationsAnswerSchema>;
