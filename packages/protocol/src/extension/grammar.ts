import { z } from 'zod';
import { jsonObjectSchema } from '../json.ts';
import { segmentSource, typeNameSource, typePatternSource } from '../naming/name-patterns.ts';
const uiSegment = '[a-z][a-zA-Z0-9]*(?:-[a-z0-9]+)*';

export const descriptionSchema = z.string().regex(/\S/, 'a description is required');

export const packageNameSchema = z
  .string()
  .regex(/^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/, 'expected an npm package name');

export const semverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/, 'expected an exact version such as 1.4.2');

export const namespaceSchema = z
  .string()
  .regex(new RegExp(`^(?=[a-z0-9-]{2,32}$)${segmentSource}$`), 'expected a namespace: 2–32 characters, lowercase kebab-case');

export const publicNameSchema = z
  .string()
  .regex(new RegExp(`^(?=[a-z0-9-]{2,32}\\.)${segmentSource}(?:\\.${uiSegment})+$`), 'expected a public name "<namespace>.<name>"');

export const iconNameSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'expected a lucide icon name');

export const contractSchema = z.string().regex(new RegExp(`^${segmentSource}@[1-9][0-9]*$`), 'expected "<contract>@<major>"');

export const durationSchema = z.string().regex(/^[1-9][0-9]*[smhd]$/, 'expected a duration such as 30s, 1h, or 7d');

export const privateNameSchema = z.string().regex(/^[a-z][a-zA-Z0-9-]*$/, 'expected a plain name such as "files"');

export const logFamilySchema = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9-]*(?::\*)?$/, 'expected a log name, or a family such as "history:*"');

export const localeSchema = z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$/, 'expected a BCP 47 language tag');

export const providerIdSchema = z.string().regex(new RegExp(`^${segmentSource}$`), 'expected a provider id such as "anthropic"');

export const modelIdSchema = z.string().regex(/^[^\s/]+$/, 'expected a model id without spaces or "/"');

export const jsonSchemaDocumentSchema = jsonObjectSchema;

export const positiveIntegerSchema = z.number().int().positive();

const functionReferencePattern = new RegExp(
  `^(?:(?:command|query):${typeNameSource}|subscription:${typePatternSource}|migration:[1-9][0-9]*|provider:${segmentSource}\\.(?:complete|status|listModels|countTokens))$`,
);

export const functionReferenceSchema = z.string().regex(functionReferencePattern, 'expected a function reference such as "command:pdf.translate"');
