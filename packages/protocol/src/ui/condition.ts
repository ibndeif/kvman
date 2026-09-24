import { z } from 'zod';
import { parseBindingPath } from './binding.ts';
import { boundStringSchema } from './bound-values.ts';

const boundScalarSchema = z.union([boundStringSchema, z.number(), z.boolean(), z.null()]);
const boundOrderedSchema = z.union([z.number(), boundStringSchema]);

export const conditionOperatorsSchema = z.strictObject({
  eq: boundScalarSchema.exactOptional(),
  ne: boundScalarSchema.exactOptional(),
  gt: boundOrderedSchema.exactOptional(),
  gte: boundOrderedSchema.exactOptional(),
  lt: boundOrderedSchema.exactOptional(),
  lte: boundOrderedSchema.exactOptional(),
  in: z.array(boundScalarSchema).exactOptional(),
  prefix: boundStringSchema.exactOptional(),
  exists: z.boolean().exactOptional(),
});

type ConditionScalar = string | number | boolean | null;
type ConditionOperators = z.infer<typeof conditionOperatorsSchema>;

export type Condition = { [path: string]: ConditionScalar | ConditionOperators | Condition[] | undefined };

const alternativesKey = '$or';

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z
    .record(z.string(), z.union([boundScalarSchema, conditionOperatorsSchema, z.array(conditionSchema)]))
    .superRefine((condition, check) => {
      for (const [key, value] of Object.entries(condition)) {
        if (key === alternativesKey) {
          if (!Array.isArray(value)) check.addIssue({ code: 'custom', path: [key], message: '$or holds a list of conditions' });
          continue;
        }
        const parse = parseBindingPath(key);
        if (!parse.ok) check.addIssue({ code: 'custom', path: [key], message: `condition keys are bindings: ${parse.message}` });
        if (Array.isArray(value)) check.addIssue({ code: 'custom', path: [key], message: 'only $or holds a list of conditions' });
      }
    }),
);
