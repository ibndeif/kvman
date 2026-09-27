import { z } from 'zod';
import { manifestSchema } from './extension/manifest.ts';
import { epochMsSchema, ulidSchema, workspaceIdSchema } from './identifiers.ts';
import { jsonObjectSchema, jsonSchema } from './json.ts';
import { problemSchema } from './problem.ts';

// 04 §4.8, ADR 0143: one data migration step between the kernel and a host. The host asks for the extension's rows in
// batches (`migration.rows`) and hands back the step's writes, each naming its workspace (`null` for global data).

const migrationIdSchema = z.string().min(1);
const scopeWorkspaceSchema = workspaceIdSchema.nullable();

export const migrateFrameSchema = z.strictObject({
  frame: z.literal('migrate'),
  invocationId: migrationIdSchema,
  extension: z.string().min(1),
  to: z.number().int().min(2),
  deadlineAt: epochMsSchema,
  correlationId: ulidSchema,
  module: z.strictObject({ entry: z.string().min(1), manifest: manifestSchema }),
});
export type MigrateFrame = z.infer<typeof migrateFrameSchema>;

export const migrationDataSchema = z.enum(['kv', 'docs', 'logs']);
export type MigrationData = z.infer<typeof migrationDataSchema>;

// Where the previous batch ended: the workspace ('' for global), then the key, the document id, or the log and seq.
export const migrationCursorSchema = z.array(z.union([z.string(), z.number().int()])).min(2).max(3);
export type MigrationCursor = z.infer<typeof migrationCursorSchema>;

export const migrationCalls = [
  z.strictObject({
    name: z.literal('migration.rows'), data: migrationDataSchema, collection: z.string().min(1).exactOptional(), log: z.string().min(1).exactOptional(),
    after: migrationCursorSchema.exactOptional(),
  }),
  z.strictObject({ name: z.literal('migration.config.get'), scope: z.enum(['global', 'workspace']), workspaceId: workspaceIdSchema.exactOptional() }),
] as const;

export const migrationKvRowSchema = z.strictObject({ workspaceId: scopeWorkspaceSchema, key: z.string(), value: jsonSchema });
export const migrationDocRowSchema = z.strictObject({ workspaceId: scopeWorkspaceSchema, id: z.string(), doc: jsonObjectSchema });
export const migrationLogRowSchema = z.strictObject({ workspaceId: scopeWorkspaceSchema, log: z.string(), seq: z.number().int().positive(), value: jsonSchema });

export const migrationRowsSchema = z.strictObject({
  rows: z.array(z.union([migrationKvRowSchema, migrationDocRowSchema, migrationLogRowSchema])),
  next: migrationCursorSchema.exactOptional(),
});
export type MigrationRows = z.infer<typeof migrationRowsSchema>;

export const migrationWriteSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('kv.set'), workspaceId: scopeWorkspaceSchema, key: z.string().min(1), value: jsonSchema }),
  z.strictObject({ kind: z.literal('kv.delete'), workspaceId: scopeWorkspaceSchema, key: z.string().min(1) }),
  z.strictObject({ kind: z.literal('doc.put'), workspaceId: scopeWorkspaceSchema, collection: z.string().min(1), id: z.string().min(1), data: jsonObjectSchema }),
  z.strictObject({ kind: z.literal('doc.delete'), workspaceId: scopeWorkspaceSchema, collection: z.string().min(1), id: z.string().min(1) }),
  z.strictObject({ kind: z.literal('log.set'), workspaceId: scopeWorkspaceSchema, log: z.string().min(1), seq: z.number().int().positive(), value: jsonSchema }),
  z.strictObject({ kind: z.literal('log.delete'), workspaceId: scopeWorkspaceSchema, log: z.string().min(1), seq: z.number().int().positive() }),
]);
export type MigrationWrite = z.infer<typeof migrationWriteSchema>;

export const migrationConfigWriteSchema = z.strictObject({
  scope: z.enum(['global', 'workspace']), workspaceId: workspaceIdSchema.exactOptional(), value: jsonObjectSchema,
});
export type MigrationConfigWrite = z.infer<typeof migrationConfigWriteSchema>;

export const migratedFrameSchema = z.strictObject({
  frame: z.literal('migrated'),
  invocationId: migrationIdSchema,
  outcome: z.discriminatedUnion('ok', [z.strictObject({ ok: z.literal(true) }), z.strictObject({ ok: z.literal(false), problem: problemSchema })]),
  writes: z.array(migrationWriteSchema),
  config: z.array(migrationConfigWriteSchema),
});
export type MigratedFrame = z.infer<typeof migratedFrameSchema>;
