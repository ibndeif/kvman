import { z } from 'zod';
import { localeSchema } from './grammar.ts';

export type Catalog = { [key: string]: string | Catalog };

const catalogKeySchema = z.string().regex(/^[A-Za-z0-9_-]+$/, 'catalog keys are letters, digits, "_", and "-"; nest objects instead of using "."');

export const catalogSchema: z.ZodType<Catalog> = z.lazy(() => z.record(catalogKeySchema, z.union([z.string(), catalogSchema])));

export const translationsSchema = z.strictObject({
  default: localeSchema,
  catalogs: z.record(localeSchema, catalogSchema),
});
export type Translations = z.infer<typeof translationsSchema>;
