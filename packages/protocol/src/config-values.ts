import { z } from 'zod';
import { packageNameSchema } from './extension/grammar.ts';
import { workspaceIdSchema } from './identifiers.ts';
import { jsonObjectSchema, type Json, type JsonObject } from './json.ts';
import { utf8ByteLength } from './unicode.ts';

// The payloads and results of the config and secret kernel types (03 §3.8, 07 §7.5, ADRs 0125 and 0126).

// Where a stored config value lives; a registration's `both` allows the two.
export const configWriteScopeSchema = z.enum(['global', 'workspace']);
export type ConfigWriteScope = z.infer<typeof configWriteScopeSchema>;

// ADR 0125: a row that does not exist reads as { value: {}, revision: 0 }.
export const configRowSchema = z.strictObject({ value: jsonObjectSchema, revision: z.number().int().nonnegative() });
export type ConfigRow = z.infer<typeof configRowSchema>;

export const configGetRequestSchema = z.strictObject({ extension: packageNameSchema, workspaceId: workspaceIdSchema.exactOptional() });
export type ConfigGetRequest = z.infer<typeof configGetRequestSchema>;

export const configGetResultSchema = z.strictObject({ global: configRowSchema, workspace: configRowSchema.nullable(), merged: jsonObjectSchema });
export type ConfigGetResult = z.infer<typeof configGetResultSchema>;

export const configSetRequestSchema = z.strictObject({
  extension: packageNameSchema,
  scope: configWriteScopeSchema,
  workspaceId: workspaceIdSchema.exactOptional(),
  value: jsonObjectSchema,
  revision: z.number().int().nonnegative(),
});
export type ConfigSetRequest = z.infer<typeof configSetRequestSchema>;

export const configSetResultSchema = z.strictObject({ revision: z.number().int().positive() });
export type ConfigSetResult = z.infer<typeof configSetResultSchema>;

export const configChangedSchema = z.strictObject({
  extension: packageNameSchema,
  scope: configWriteScopeSchema,
  workspaceId: workspaceIdSchema.exactOptional(),
  revision: z.number().int().positive(),
});
export type ConfigChanged = z.infer<typeof configChangedSchema>;

// ADR 0126: a secret config field's name is its dotted path; handlers may use any name of this grammar.
export const secretNameSchema = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/, 'a secret name matches ^[A-Za-z0-9._-]{1,128}$');

export const secretValueMaxBytes = 64 * 1024;

export const secretValueSchema = z
  .string()
  .min(1, 'a secret is not empty')
  .refine((value) => utf8ByteLength(value) <= secretValueMaxBytes, 'a secret has at most 64 KB');

export const secretSetRequestSchema = z.strictObject({ extension: packageNameSchema, name: secretNameSchema, value: secretValueSchema });
export type SecretSetRequest = z.infer<typeof secretSetRequestSchema>;

export const secretClearRequestSchema = z.strictObject({ extension: packageNameSchema, name: secretNameSchema });
export type SecretClearRequest = z.infer<typeof secretClearRequestSchema>;

export const secretChangeResultSchema = z.strictObject({});

// secrets.json (04 §4.7): values keyed by `<extension>/<name>`.
export const secretsFileSchema = z.record(z.string().min(1), z.string());
export type SecretsFile = z.infer<typeof secretsFileSchema>;

function asObject(value: Json | undefined): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function secretFieldsAt(schema: JsonObject, prefix: string): string[] {
  const properties = asObject(schema['properties']) ?? {};
  return Object.entries(properties).flatMap(([name, field]) => {
    const fieldSchema = asObject(field);
    if (fieldSchema === undefined) return [];
    const path = prefix === '' ? name : `${prefix}.${name}`;
    return fieldSchema['secret'] === true ? [path] : secretFieldsAt(fieldSchema, path);
  });
}

// The dotted paths of a config schema's fields marked `.meta({ secret: true })` (05 §5.8, ADR 0126).
export function configSecretFields(schema: JsonObject): string[] {
  return secretFieldsAt(schema, '');
}

// The schema stored config values are checked against: every secret field removed, with its `required` entry, so a
// value without its secrets is valid (ADR 0125).
export function withoutSecretFields(schema: JsonObject): JsonObject {
  const properties = asObject(schema['properties']);
  if (properties === undefined) return schema;
  const kept: JsonObject = {};
  const secrets: string[] = [];
  for (const [name, field] of Object.entries(properties)) {
    const fieldSchema = asObject(field);
    if (fieldSchema?.['secret'] === true) secrets.push(name);
    else kept[name] = fieldSchema === undefined ? field : withoutSecretFields(fieldSchema);
  }
  const required = Array.isArray(schema['required']) ? schema['required'].filter((name) => typeof name !== 'string' || !secrets.includes(name)) : undefined;
  return { ...schema, properties: kept, ...(required === undefined ? {} : { required }) };
}
