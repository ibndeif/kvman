import { z } from 'zod';
import { iconNameSchema, jsonSchemaDocumentSchema, localeSchema } from '../extension/grammar.ts';
import { workspaceIdSchema } from '../identifiers.ts';
import { jsonSchema } from '../json.ts';
import { textSchema } from '../text.ts';
import { viewNodeSchema } from './view-node.ts';

export const uiItemSchema = z.strictObject({ id: z.string().min(1), owner: z.string().min(1), kind: z.string().min(1), def: jsonSchema });
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
    icon: iconNameSchema.exactOptional(), hidden: z.boolean(),
  })),
  actions: z.record(z.string(), z.array(uiItemSchema)),
  renderers: z.record(z.string(), z.array(uiItemSchema)),
  components: z.array(z.strictObject({
    name: z.string().min(1), owner: z.string().min(1), form: z.enum(['composite', 'widget']), visibility: z.enum(['public', 'private']),
  })),
  extensions: z.record(z.string(), z.strictObject({ namespace: z.string().min(1), title: textSchema, icon: iconNameSchema.exactOptional() })),
  settingsSections: z.array(z.strictObject({
    id: z.string().min(1), owner: z.string().min(1), title: textSchema, scopes: z.array(z.enum(['global', 'workspace'])).min(1),
    schema: jsonSchemaDocumentSchema, view: viewNodeSchema.exactOptional(),
  })),
  catalogs: z.strictObject({ defaults: z.record(z.string(), localeSchema), locales: z.array(localeSchema) }),
});
export type UiRegistry = z.infer<typeof uiRegistrySchema>;
