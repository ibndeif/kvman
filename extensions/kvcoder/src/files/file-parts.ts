import type { Ctx } from '@kvman/sdk';
import { invalid, notFound, tooLarge } from '../problems.ts';
import { now } from '../sessions/session-lookup.ts';
import { txRecords, type TxRecords } from '../store/collections.ts';
import { changeFile, type ChangedFile } from './file-change.ts';

// A long file written in numbered pieces (ADR 0054, 2 and 3): each piece is held in kvman's store, a number sent again
// replaces its piece, and `assemble` writes the whole file at once through the safe change.

/** The most pieces of one file, and the bytes one piece holds at most. */
export const partsLimit = 200;
export const partBytes = 64 * 1024;

const held = (store: TxRecords, file: ChangedFile) => store.fileParts.find({ sessionId: file.sessionId, path: file.real }, { limit: partsLimit }).sort((left, right) => left.part - right.part);

export function savePart(ctx: Ctx, file: ChangedFile, part: number, content: string): Promise<{ path: string; part: number; parts: number[]; bytes: number }> {
  if (Buffer.byteLength(content) > partBytes) throw tooLarge(`Part ${String(part)} of ${file.shown} is over ${String(partBytes)} bytes. Send it as smaller parts.`, partBytes);
  return ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    const [same] = store.fileParts.find({ sessionId: file.sessionId, path: file.real, part }, { limit: 1 });
    if (same === undefined) store.fileParts.insert({ sessionId: file.sessionId, path: file.real, part, content, updatedAt: now() });
    else store.fileParts.update(same.id, { content, updatedAt: now() });
    const parts = held(store, file);
    return { path: file.shown, part, parts: parts.map((saved) => saved.part), bytes: parts.reduce((total, saved) => total + Buffer.byteLength(saved.content), 0) };
  });
}

export function assembleParts(ctx: Ctx, file: ChangedFile): Promise<{ path: string; created: boolean; bytes: number; parts: number }> {
  return changeFile(ctx, file, (_previous, store) => {
    const parts = held(store, file);
    const last = parts.at(-1)?.part;
    if (last === undefined) throw notFound(`This chat holds no parts of ${file.shown}. Save them with fs part first.`, { path: file.shown });
    const missing = Array.from({ length: last }, (_, index) => index + 1).filter((number) => !parts.some((saved) => saved.part === number));
    if (missing.length > 0) throw invalid(`${file.shown} is missing part ${missing.join(', ')}. Save it with fs part, then assemble again. Nothing was written.`, { path: file.shown });
    const content = Buffer.from(parts.map((saved) => saved.content).join(''), 'utf8');
    for (const saved of parts) store.fileParts.delete(saved.id);
    return { content, value: { path: file.shown, bytes: content.length, parts: parts.length } };
  });
}
