import { z } from 'zod';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type JsonObject = { [key: string]: Json };

export const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([z.null(), z.boolean(), z.number(), z.string(), z.array(jsonSchema), z.record(z.string(), jsonSchema)]),
);

export const jsonObjectSchema: z.ZodType<JsonObject> = z.record(z.string(), jsonSchema);
