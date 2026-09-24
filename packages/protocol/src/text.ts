import { z } from 'zod';
import { jsonSchema } from './json.ts';

export const translatedTextSchema = z.object({ $t: z.string().min(1) }).catchall(jsonSchema);

export const textSchema = z.union([z.string(), translatedTextSchema]);

export type Text = z.infer<typeof textSchema>;
