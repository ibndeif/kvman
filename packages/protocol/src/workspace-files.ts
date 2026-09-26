import { z } from 'zod';
import { epochMsSchema } from './identifiers.ts';

// 05 §5.4, 07 §7.2, ADR 0136: ctx.files. Paths are relative to the workspace root.
export const filesLimits = { fileBytes: 16 * 1024 * 1024, globMatches: 5000 } as const;

export const fileKindSchema = z.enum(['file', 'directory', 'symlink', 'other']);
export type FileKind = z.infer<typeof fileKindSchema>;

export const workspacePathSchema = z.string().min(1).max(4096);

export const fileEntrySchema = z.strictObject({ name: z.string().min(1), kind: fileKindSchema, size: z.number().int().nonnegative() });
export type FileEntry = z.infer<typeof fileEntrySchema>;

export const fileStatSchema = z.strictObject({ kind: fileKindSchema, size: z.number().int().nonnegative(), modifiedAt: epochMsSchema });
export type FileStat = z.infer<typeof fileStatSchema>;

// What ctx.files.write sends: text as it is, bytes as base64.
export const fileContentSchema = z.union([z.strictObject({ text: z.string() }), z.strictObject({ base64: z.base64() })]);
export type FileContent = z.infer<typeof fileContentSchema>;
