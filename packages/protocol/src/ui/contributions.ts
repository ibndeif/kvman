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
  query: typeNameSchema, payload: z.record(z.string(), boundJsonSchema).exactOptional(), field: z.string().min(1),
  refreshOn: z.array(typePatternSchema).exactOptional(),
});
const visibilitySchema = z.enum(['private', 'public']);

export const pageDefSchema = z.strictObject({
  description: descriptionSchema,
  route: z.string().startsWith('/'),
  title: viewTextSchema,
  icon: iconNameSchema.exactOptional(),
  params: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/), z.enum(['string', 'number', 'boolean'])).exactOptional(),
  state: z.record(z.string(), jsonSchema).exactOptional(),
  queries: pageQueriesSchema.exactOptional(),
  view: viewNodeSchema,
});

export const navGroupDefSchema = z.strictObject({ description: descriptionSchema, label: viewTextSchema, icon: iconNameSchema.exactOptional(), order: orderSchema.exactOptional() });

export const navItemDefSchema = z.strictObject({
  description: descriptionSchema, page: publicNameSchema, label: viewTextSchema, icon: iconNameSchema,
  group: publicNameSchema.exactOptional(), order: orderSchema.exactOptional(), badge: badgeSchema.exactOptional(),
});

export const toolbarItemDefSchema = z
  .strictObject({
    description: descriptionSchema, slot: publicNameSchema, as: z.enum(['button', 'menu', 'badge']), label: viewTextSchema,
    icon: iconNameSchema.exactOptional(), order: orderSchema.exactOptional(), queries: pageQueriesSchema.exactOptional(), visibleIf: conditionSchema.exactOptional(),
    action: actionSchema.exactOptional(),
    items: z.array(z.strictObject({ label: viewTextSchema, icon: iconNameSchema.exactOptional(), action: actionSchema })).exactOptional(),
    badge: badgeSchema.exactOptional(),
  })
  .superRefine((item, check) => {
    const required = { button: 'action', menu: 'items', badge: 'badge' } as const;
    const field = required[item.as];
    if (item[field] === undefined) check.addIssue({ code: 'custom', path: [field], message: `a toolbar item shown as ${item.as} needs ${field}` });
  });

export const statusItemDefSchema = z.strictObject({
  description: descriptionSchema, side: z.enum(['start', 'end']).exactOptional(), label: viewTextSchema, icon: iconNameSchema.exactOptional(),
  tone: toneSchema.exactOptional(), order: orderSchema.exactOptional(), queries: pageQueriesSchema.exactOptional(), visibleIf: conditionSchema.exactOptional(),
  action: actionSchema.exactOptional(),
});

export const panelDefSchema = z.strictObject({
  description: descriptionSchema, slot: publicNameSchema, title: viewTextSchema.exactOptional(), order: orderSchema.exactOptional(),
  queries: pageQueriesSchema.exactOptional(), visibleIf: conditionSchema.exactOptional(), view: viewNodeSchema,
});

const entityActionBase = {
  description: descriptionSchema, entity: publicNameSchema, label: viewTextSchema, icon: iconNameSchema.exactOptional(),
  visibleIf: conditionSchema.exactOptional(), placement: z.array(z.enum(['row', 'detail', 'palette'])).exactOptional(),
};

export const actionDefSchema = z.union([
  commandActionSchema.omit({ busyLabel: true }).extend(entityActionBase),
  navigateActionSchema.extend(entityActionBase),
  openDialogActionSchema.extend(entityActionBase),
]);

export const rendererDefSchema = z
  .strictObject({
    description: descriptionSchema, target: z.string().min(1), view: viewNodeSchema.exactOptional(), component: z.string().min(1).exactOptional(),
    props: z.record(z.string(), boundJsonSchema).exactOptional(),
  })
  .superRefine((renderer, check) => {
    if ((renderer.view === undefined) === (renderer.component === undefined)) {
      check.addIssue({ code: 'custom', path: ['view'], message: 'a renderer has exactly one of view and component' });
    }
  });

export const slotDefSchema = z.strictObject({
  description: descriptionSchema, accepts: z.array(z.enum(['panel', 'toolbarItem'])).min(1), props: jsonSchemaDocumentSchema.exactOptional(),
  layout: z.enum(['stack', 'row', 'tabs']).exactOptional(), max: z.number().int().positive().exactOptional(),
});

export const rendererTargetDefSchema = z.strictObject({ description: descriptionSchema, item: jsonSchemaDocumentSchema });

const childrenRuleSchema = z.union([z.enum(['none', 'any']), z.array(z.string().min(1))]);

export const compositeDefSchema = z
  .strictObject({
    description: descriptionSchema, props: jsonSchemaDocumentSchema, view: z.looseObject({ type: z.string() }),
    children: childrenRuleSchema.exactOptional(), visibility: visibilitySchema.exactOptional(), examples: z.array(jsonSchema).exactOptional(),
  })
  .superRefine((composite, check) => {
    forwardIssues(compositeViewSchema((composite.children ?? 'none') !== 'none').safeParse(composite.view), check, ['view']);
  });

export const widgetDefSchema = z.strictObject({
  description: descriptionSchema, props: jsonSchemaDocumentSchema,
  widget: z.string().regex(/^(?!\/)(?!.*\.\.)[A-Za-z0-9._/-]+\.html$/, 'a widget is an .html file inside the package'),
  visibility: visibilitySchema.exactOptional(),
});

export const settingsSectionDefSchema = z.strictObject({ description: descriptionSchema, view: viewNodeSchema });
