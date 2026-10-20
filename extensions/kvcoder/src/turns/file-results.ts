import { z, type Ctx, type Json } from '@kvman/sdk';
import type { RunCall } from '../calls/run-tool.ts';
import { builtinCommands } from '../connectors/builtin-connectors.ts';
import { editText, editValueSchema, fileReadSchema, filesEntrySchema, filesEntryText, readText, unchangedText } from '../files/read-text.ts';
import { heldReads, sameRead } from './read-again.ts';

// What the model reads of `fs read`, `fs read-files`, and `fs edit` (plan 08 §8.3 and §8.5, ADR 0097, 2): numbered
// lines, while the call's `details` keep the JSON the call card shows. Lines the chat already holds read as unchanged.

const readFilesSchema = z.object({ files: z.array(filesEntrySchema) });

/** The registrations whose result the model reads as text, not JSON. */
export const fileRead = builtinCommands.fs.read.registration;
export const filesRead = builtinCommands.fs['read-files'].registration;
const fileEdit = builtinCommands.fs.edit.registration;

/** What the model reads, and the output the call's details keep. */
export type FileResult = { text: string; output: string };

/** A file call's result, or `undefined` for any other call. */
export async function fileResult(ctx: Ctx, sessionId: string, call: RunCall, registration: string, value: unknown): Promise<FileResult | undefined> {
  if (registration === fileRead) {
    const read = fileReadSchema.parse(value);
    if ((await heldReads(ctx, sessionId)).some((held) => sameRead(held, read))) return { text: unchangedText(read.path), output: unchangedText(read.path) };
    const fromColumn = call.payload['fromColumn'];
    return { text: readText(read, typeof fromColumn === 'number' ? fromColumn : 1), output: JSON.stringify(read) };
  }
  if (registration === filesRead) {
    const held = await heldReads(ctx, sessionId);
    const files = readFilesSchema.parse(value).files.map((entry) => ('content' in entry && held.some((read) => sameRead(read, entry)) ? { path: entry.path, unchanged: true as const } : entry));
    return { text: files.map(filesEntryText).join('\n\n'), output: JSON.stringify({ files }) };
  }
  if (registration === fileEdit) return { text: editText(editValueSchema.parse(value)), output: JSON.stringify(value) };
  return undefined;
}

/** The files a successful read let the chat see, read now or held from before: what it may change (ADR 0053, 2). */
export function seenFiles(call: RunCall, registration: string, details: Json): string[] {
  if (registration === fileRead) return typeof call.payload['path'] === 'string' ? [call.payload['path']] : [];
  const output = registration === filesRead && typeof details === 'object' && details !== null && !Array.isArray(details) ? details['output'] : undefined;
  if (typeof output !== 'string') return [];
  return readFilesSchema.parse(JSON.parse(output)).files.flatMap((entry) => ('content' in entry || 'unchanged' in entry ? [entry.path] : []));
}
