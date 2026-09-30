import { z } from 'zod';

/** A JSON value that is not an array or object. */
export type JsonPrimitive = string | number | boolean | null;

/** Any JSON value; an object field may be `undefined` (as zod infers optional fields), which JSON leaves out. */
export type Json = JsonPrimitive | Json[] | { [key: string]: Json | undefined };

/** A JSON object; a field may be `undefined`, which JSON leaves out. */
export type JsonObject = { [key: string]: Json | undefined };

/** Accepts any JSON value: finite numbers, strings, booleans, null, arrays, and plain objects. */
export const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonSchema), z.record(z.string(), jsonSchema)]),
);
