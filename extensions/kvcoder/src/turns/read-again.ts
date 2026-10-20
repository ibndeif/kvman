import { z, type Ctx, type Json } from '@kvman/sdk';
import { fileReadSchema, filesEntrySchema, type FileReadValue } from '../files/read-text.ts';
import { records } from '../store/collections.ts';
import { sentHistory, textOf } from './model-context.ts';

// A read the chat already holds (ADR 0034, 2; ADR 0097, 1 and 2). It is worked out from the stored results after the
// latest summary, from the reads their `details` keep as JSON: an `fs read`'s, also one stored before ADR 0097, whose
// text was that JSON, and each file of an `fs read-files`. So a summary, a fork, and a subagent's own chat need no
// bookkeeping, and a file that changed in any way never matches.

const readFilesSchema = z.object({ files: z.array(filesEntrySchema) });

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

/**
 * The reads a result holds: none for a call that isn't a read, or a read answered as unchanged. Its `details` keep the
 * JSON, or, for a read stored before ADR 0097, its text was the JSON and the details kept no copy (ADR 0034, 7).
 */
export function readsOf(details: Json | undefined, text: string): FileReadValue[] {
  if (typeof details !== 'object' || details === null || Array.isArray(details) || details['connector'] !== 'fs') return [];
  const output = parsedJson(typeof details['output'] === 'string' ? details['output'] : text);
  if (details['command'] === 'read') {
    const read = fileReadSchema.safeParse(output);
    return read.success ? [read.data] : [];
  }
  const files = details['command'] === 'read-files' ? readFilesSchema.safeParse(output) : undefined;
  return files?.success === true ? files.data.files.flatMap((entry) => ('content' in entry ? [entry] : [])) : [];
}

/** Whether two reads returned the same lines of the same file. */
export const sameRead = (first: FileReadValue, second: FileReadValue): boolean =>
  first.path === second.path && first.fromLine === second.fromLine && first.totalLines === second.totalLines && first.content === second.content && first.truncated === second.truncated && first.next?.fromLine === second.next?.fromLine && first.next?.fromColumn === second.next?.fromColumn;

/** The reads a step still sends whole: those of results that aren't cleared (ADR 0094, 1). */
export async function heldReads(ctx: Ctx, sessionId: string): Promise<FileReadValue[]> {
  const session = await records(ctx.store).sessions.get(sessionId);
  if (session === undefined) return [];
  const { messages, cleared } = await sentHistory(ctx, sessionId, session.nextSeq);
  return messages.filter((message) => message.kind === 'toolResult' && message.seq > cleared).flatMap((message) => readsOf(message.content['details'], textOf(message.content['content'])));
}
