import { z } from '@kvman/sdk';

// What a chat knows of the files it changes (plan 08 §8.5): what it last saw of a file, the files it changed, a copy of
// each change, and the pieces of a long file it is writing (ADR 0053, 2 and 4; ADR 0093, 2; ADR 0118, 3 and 4).

const fingerprint = z.string().regex(/^[0-9a-f]{64}$/);
// The chat's `nextSeq` when a record was made, which tells what came after a message (ADR 0118, 4); none before it.
const atSeq = z.number().int().nonnegative().nullable().default(null);

export const fileViewDocSchema = z.object({ sessionId: z.string(), path: z.string(), fingerprint, updatedAt: z.iso.datetime() });

// A file a chat changed with `fs`, under the chat at the root, for its Changes view (ADR 0093, 2).
// `turnId` is the root chat's turn of the latest change (ADR 0102, 9); records from before it read `null`.
export const fileChangeDocSchema = z.object({ sessionId: z.string(), path: z.string(), firstAt: z.iso.datetime(), lastAt: z.iso.datetime(), turnId: z.string().nullable().default(null) });

// One change: what the file held before it and the fingerprint after it (`null` when it removed the file). The content
// before is in `file-copies` under `kept` (inline as `previous` in records from before ADR 0118); with neither, and not
// `tooLarge` (over 1 MB, so none was kept), the file didn't exist. `order` is the chat's change counter; an undo's own
// record names the record it undid in `undoes`, and that one is `undone`.
export const fileBackupDocSchema = z.object({
  sessionId: z.string(),
  path: z.string(),
  previous: z.string().nullable(),
  kept: z.string().nullable().default(null),
  written: fingerprint.nullable(),
  tooLarge: z.boolean().default(false),
  atSeq,
  order: z.number().int().nonnegative().nullable().default(null),
  turnId: z.string().nullable().default(null),
  undoes: z.string().nullable().default(null),
  undone: z.boolean().default(false),
  createdAt: z.iso.datetime(),
});

// The content a change replaced, base64, apart from its record so a chat's records read light (ADR 0118, 3).
export const fileCopyDocSchema = z.object({ sessionId: z.string(), content: z.string() });

// One numbered piece of a long file a chat is writing, held until `fs assemble` (ADR 0054, 2).
export const filePartDocSchema = z.object({ sessionId: z.string(), path: z.string(), part: z.number().int().min(1), content: z.string(), atSeq, updatedAt: z.iso.datetime() });

export { atSeq as atSeqSchema };

export type FileViewDoc = z.output<typeof fileViewDocSchema>;
export type FileChangeDoc = z.output<typeof fileChangeDocSchema>;
export type FileBackupDoc = z.output<typeof fileBackupDocSchema>;
