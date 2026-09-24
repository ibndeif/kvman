import { z } from 'zod';

export type FilterScalar = string | number | boolean | null;

const alternativesKey = '$or';

const fieldPathPattern = /^[^.$][^.]*(?:\.[^.]+)*$/;

const scalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const orderedSchema = z.union([z.number(), z.string()]);

export const filterOperatorsSchema = z.strictObject({
  eq: scalarSchema.optional(),
  ne: scalarSchema.optional(),
  gt: orderedSchema.optional(),
  gte: orderedSchema.optional(),
  lt: orderedSchema.optional(),
  lte: orderedSchema.optional(),
  in: z.array(scalarSchema).optional(),
  prefix: z.string().optional(),
  exists: z.boolean().optional(),
});

export type FilterOperators = z.infer<typeof filterOperatorsSchema>;

export type FieldCondition = FilterScalar | FilterOperators;

export type Filter = { $or?: Filter[] | undefined; [path: string]: FieldCondition | Filter[] | undefined };

export const filterSchema: z.ZodType<Filter> = z
  .object({
    get $or() {
      return z.array(filterSchema).optional();
    },
  })
  .catchall(z.union([scalarSchema, filterOperatorsSchema]))
  .superRefine((filter, check) => {
    for (const key of Object.keys(filter)) {
      if (key !== alternativesKey && !fieldPathPattern.test(key)) {
        check.addIssue({ code: 'custom', path: [key], message: `"${key}" is not a field path; the only $ key is $or` });
      }
    }
  });
