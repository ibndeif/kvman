import { jsonSchema, z } from '@kvman/sdk';

// Effects (plan 06 §6.5): what an extension's handler asks the UI to do when the job the UI started or follows ends.
// The browser checks them with the same schema.

const kebab = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*';

/** A full id: `<namespace>.<id>`, as pages and panels have. */
export const fullIdSchema = z.string().regex(new RegExp(`^${kebab}\\.${kebab}$`), 'A full id is <namespace>.<id>.');

export const toastLevelSchema = z.enum(['info', 'success', 'warning', 'error']);

export const effectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('toast'), text: z.string().min(1), params: z.record(z.string(), jsonSchema).exactOptional(), level: toastLevelSchema }),
  z.object({ type: z.literal('navigate'), page: fullIdSchema, params: z.record(z.string(), z.string()).exactOptional() }),
  z.object({ type: z.literal('panel'), panel: fullIdSchema, open: z.boolean() }),
  z.object({ type: z.literal('refresh') }),
]);

export type Effect = z.output<typeof effectSchema>;
