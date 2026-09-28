import { z } from 'zod';
import { jsonSchema } from './json.ts';
import { textPropFormat } from './ui/prop-formats.ts';

export const translatedTextSchema = z.object({ $t: z.string().min(1) }).catchall(jsonSchema);

// Marked like every user-facing Text, so validation can find it in a converted schema (ADR 0160).
export const textSchema = z.union([z.string(), translatedTextSchema]).meta({ format: textPropFormat });

export type Text = z.infer<typeof textSchema>;
