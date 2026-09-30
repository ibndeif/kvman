import { z } from 'zod';

/** A JSON value that is not an array or object. */
export type JsonPrimitive = string | number | boolean | null;

/** Any JSON value. */
export type Json = JsonPrimitive | Json[] | { [key: string]: Json };

/** A JSON object. */
export type JsonObject = { [key: string]: Json };

/** Accepts any JSON value: finite numbers, strings, booleans, null, arrays, and plain objects. */
export const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonSchema), z.record(z.string(), jsonSchema)]),
);
