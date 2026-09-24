import { z } from 'zod';
import { descriptionSchema, iconNameSchema, jsonSchemaDocumentSchema, publicNameSchema } from '../extension/grammar.ts';
import { typeNameSchema, typePatternSchema } from '../identifiers.ts';
import { jsonSchema } from '../json.ts';
import { actionSchema, commandActionSchema, navigateActionSchema, openDialogActionSchema } from './action.ts';
import { pageQueriesSchema, toneSchema } from './base-types.ts';
import { boundJsonSchema, viewTextSchema } from './bound-values.ts';
import { conditionSchema } from './condition.ts';
import { forwardIssues } from './issues.ts';
import { compositeViewSchema, viewNodeSchema } from './view-node.ts';

const orderSchema = z.number().int().min(0).max(1000);
const badgeSchema = z.strictObject({
  query: typeNameSchema, payload: z.record(z.string(), boundJsonSchema).optional(), field: z.string().min(1),
  refreshOn: z.array(typePatternSchema).optional(),
});
const visibilitySchema = z.enum(['private', 'public']);

export const pageDefSchema = z.strictObject({
  description: descriptionSchema,
  route: z.string().startsWith('/'),
  title: viewTextSchema,
  icon: iconNameSchema.optional(),
  params: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/), z.enum(['string', 'number', 'boolean'])).optional(),
  state: z.record(z.string(), jsonSchema).optional(),
  queries: pageQueriesSchema.optional(),
  view: viewNodeSchema,
});

export const navGroupDefSchema = z.strictObject({ description: descriptionSchema, label: viewTextSchema, icon: iconNameSchema.optional(), order: orderSchema.optional() });

export const navItemDefSchema = z.strictObject({
  description: descriptionSchema, page: publicNameSchema, label: viewTextSchema, icon: iconNameSchema,
  group: publicNameSchema.optional(), order: orderSchema.optional(), badge: badgeSchema.optional(),
});

export const toolbarItemDefSchema = z
  .strictObject({
    description: descriptionSchema, slot: publicNameSchema, as: z.enum(['button', 'menu', 'badge']), label: viewTextSchema,
    icon: iconNameSchema.optional(), order: orderSchema.optional(), queries: pageQueriesSchema.optional(), visibleIf: conditionSchema.optional(),
    action: actionSchema.optional(),
    items: z.array(z.strictObject({ label: viewTextSchema, icon: iconNameSchema.optional(), action: actionSchema })).optional(),
    badge: badgeSchema.optional(),
  })
  .superRefine((item, check) => {
    const required = { button: 'action', menu: 'items', badge: 'badge' } as const;
    const field = required[item.as];
    if (item[field] === undefined) check.addIssue({ code: 'custom', path: [field], message: `a toolbar item shown as ${item.as} needs ${field}` });
  });

export const statusItemDefSchema = z.strictObject({
  description: descriptionSchema, side: z.enum(['start', 'end']).optional(), label: viewTextSchema, icon: iconNameSchema.optional(),
  tone: toneSchema.optional(), order: orderSchema.optional(), queries: pageQueriesSchema.optional(), visibleIf: conditionSchema.optional(),
  action: actionSchema.optional(),
});

export const panelDefSchema = z.strictObject({
  description: descriptionSchema, slot: publicNameSchema, title: viewTextSchema.optional(), order: orderSchema.optional(),
  queries: pageQueriesSchema.optional(), visibleIf: conditionSchema.optional(), view: viewNodeSchema,
});

const entityActionBase = {
  description: descriptionSchema, entity: publicNameSchema, label: viewTextSchema, icon: iconNameSchema.optional(),
  visibleIf: conditionSchema.optional(), placement: z.array(z.enum(['row', 'detail', 'palette'])).optional(),
};

export const actionDefSchema = z.union([
  commandActionSchema.omit({ busyLabel: true }).extend(entityActionBase),
  navigateActionSchema.extend(entityActionBase),
  openDialogActionSchema.extend(entityActionBase),
]);

export const rendererDefSchema = z
  .strictObject({
    description: descriptionSchema, target: z.string().min(1), view: viewNodeSchema.optional(), component: z.string().min(1).optional(),
    props: z.record(z.string(), boundJsonSchema).optional(),
  })
  .superRefine((renderer, check) => {
    if ((renderer.view === undefined) === (renderer.component === undefined)) {
      check.addIssue({ code: 'custom', path: ['view'], message: 'a renderer has exactly one of view and component' });
    }
  });

export const slotDefSchema = z.strictObject({
  description: descriptionSchema, accepts: z.array(z.enum(['panel', 'toolbarItem'])).min(1), props: jsonSchemaDocumentSchema.optional(),
  layout: z.enum(['stack', 'row', 'tabs']).optional(), max: z.number().int().positive().optional(),
});

export const rendererTargetDefSchema = z.strictObject({ description: descriptionSchema, item: jsonSchemaDocumentSchema });

const childrenRuleSchema = z.union([z.enum(['none', 'any']), z.array(z.string().min(1))]);

export const compositeDefSchema = z
  .strictObject({
    description: descriptionSchema, props: jsonSchemaDocumentSchema, view: z.looseObject({ type: z.string() }),
    children: childrenRuleSchema.optional(), visibility: visibilitySchema.optional(), examples: z.array(jsonSchema).optional(),
  })
  .superRefine((composite, check) => {
    forwardIssues(compositeViewSchema((composite.children ?? 'none') !== 'none').safeParse(composite.view), check, ['view']);
  });

export const widgetDefSchema = z.strictObject({
  description: descriptionSchema, props: jsonSchemaDocumentSchema,
  widget: z.string().regex(/^(?!\/)(?!.*\.\.)[A-Za-z0-9._/-]+\.html$/, 'a widget is an .html file inside the package'),
  visibility: visibilitySchema.optional(),
});

export const settingsSectionDefSchema = z.strictObject({ description: descriptionSchema, view: viewNodeSchema });
