import { z } from 'zod';
import { typeNameSchema } from '../identifiers.ts';
import { formOverridesSchema, levelSchema } from './base-types.ts';
import { boundJsonSchema, boundStringSchema, viewTextSchema } from './bound-values.ts';
import { viewNodeSchema } from './view-node.ts';

export const grantCommandSchema = z.enum([
  'kernel.trust.grant', 'kernel.extension.enable', 'kernel.extension.reload', 'kernel.preset.import', 'kernel.preset.apply',
  'kernel.preset.update',
]);
export type GrantCommand = z.infer<typeof grantCommandSchema>;

const paneSchema = z.enum(['main', 'side']);
const routeSchema = boundStringSchema.refine((route) => route.startsWith('/'), 'routes start with "/"');
const stateUpdatesSchema = z.record(
  z.string().regex(/^\$state\.[A-Za-z0-9_-]+$/, 'set keys are "$state.<field>"'),
  boundJsonSchema,
);

export const effectSchema = z.union([
  z.strictObject({ toast: viewTextSchema, level: levelSchema.optional() }),
  z.strictObject({ navigate: routeSchema, pane: paneSchema.optional() }),
  z.strictObject({ refresh: z.string().min(1) }),
  z.strictObject({ set: stateUpdatesSchema }),
  z.strictObject({ closeDialog: z.literal(true) }),
]);
export type Effect = z.infer<typeof effectSchema>;

export const commandActionSchema = z.strictObject({
  command: typeNameSchema,
  payload: boundJsonSchema.optional(),
  form: z.union([z.boolean(), formOverridesSchema]).optional(),
  confirm: z.strictObject({ title: viewTextSchema, body: viewTextSchema.optional() }).optional(),
  busyLabel: viewTextSchema.optional(),
  then: z.array(effectSchema).optional(),
});

export const navigateActionSchema = z.strictObject({ navigate: routeSchema, pane: paneSchema.optional() });

export const openDialogActionSchema = z.strictObject({
  openDialog: z.strictObject({ title: viewTextSchema, view: z.lazy(() => viewNodeSchema) }),
});

export const actionSchema = z.union([
  commandActionSchema,
  navigateActionSchema,
  openDialogActionSchema,
  z.strictObject({ openGrantDialog: z.strictObject({ command: grantCommandSchema, payload: boundJsonSchema }) }),
  z.strictObject({ set: stateUpdatesSchema }),
  z.templateLiteral(['$props.', z.string().regex(/^[A-Za-z0-9_-]+$/)]),
]);
export type Action = z.infer<typeof actionSchema>;
