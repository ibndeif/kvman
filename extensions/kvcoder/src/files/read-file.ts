import { readFile, stat } from 'node:fs/promises';
import { invalid, notFound } from '../problems.ts';
import { fingerprintOf } from './file-change.ts';
import { resolveInWorkspace } from './workspace-path.ts';

// `fs read` (plan 08 §8.5, ADR 0011, 8): whole lines of a text file inside the workspace folder, at most 2000 of them
// and 30 KB, with the file's line count, and where to read on when something was left out, also inside one very long
// line (ADR 0055, 1).

/** The most lines one read returns, and the default. */
export const readLinesLimit = 2000;

/** The bytes of content one read returns at most; `fs read-files` shares them among its files (ADR 0097, 1). */
export const readBytesLimit = 30 * 1024;

const text = new TextDecoder('utf-8', { fatal: true });

export const isMissing = (error: unknown): boolean => error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');

/** A file's bytes as text, without a leading BOM; `undefined` when they aren't valid UTF-8. */
export function decodeText(bytes: Uint8Array): string | undefined {
  try {
    return text.decode(bytes);
  } catch (error) {
    if (error instanceof TypeError) return undefined;
    throw error;
  }
}

export type FileRead = { path: string; fromLine: number; totalLines: number; content: string; truncated: boolean; next?: { fromLine: number; fromColumn?: number } };

/** What the chat last saw of a file, by its real path, when it has read it. */
export type SeenFile = (real: string) => Promise<string | undefined>;

// The whole characters of `text` that fit the limit, counted from its start.
function fitting(characters: readonly string[], limit: number): number {
  let bytes = 0;
  let count = 0;
  for (const character of characters) {
    bytes += Buffer.byteLength(character);
    if (bytes > limit) break;
    count += 1;
  }
  return count;
}

export async function readLines(workspace: string, input: { path: string; fromLine?: number | undefined; fromColumn?: number | undefined; lines?: number | undefined }, seen?: SeenFile, limit = readBytesLimit): Promise<FileRead> {
  const target = await resolveInWorkspace(workspace, input.path);
  const found = await stat(target).catch((error: unknown) => {
    if (isMissing(error)) throw notFound(`${input.path} doesn't exist.`, { path: input.path });
    throw error;
  });
  if (found.isDirectory()) throw invalid(`${input.path} is a folder; list it with fs list.`, { path: input.path });
  const bytes = await readFile(target);
  const decoded = decodeText(bytes);
  if (decoded === undefined) throw invalid(`${input.path} isn't valid UTF-8 text, so it isn't read.`, { path: input.path });
  // Reading on inside a line joins two reads, so both must be of the same content (ADR 0055, 1).
  const view = input.fromColumn === undefined ? undefined : await seen?.(target);
  if (view !== undefined && view !== fingerprintOf(bytes)) throw invalid(`${input.path} changed since you started reading it. Read it again from its start.`, { path: input.path });
  const all = decoded.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const fromLine = input.fromLine ?? 1;
  const fromColumn = input.fromColumn ?? 1;
  const wanted = all.slice(fromLine - 1, fromLine - 1 + (input.lines ?? readLinesLimit));
  const first = [...(wanted[0] ?? '')].slice(fromColumn - 1);
  const lines = wanted.length === 0 ? [] : [first.join(''), ...wanted.slice(1)];
  const kept: string[] = [];
  let size = 0;
  for (const line of lines) {
    size += Buffer.byteLength(line);
    if (size > limit) break;
    kept.push(line);
  }
  const base = { path: input.path, fromLine, totalLines: all.length };
  if (kept.length === 0 && lines.length > 0) {
    const taken = fitting(first, limit);
    return { ...base, content: first.slice(0, taken).join(''), truncated: true, next: { fromLine, fromColumn: fromColumn + taken } };
  }
  const nextLine = fromLine + kept.length;
  return nextLine > all.length ? { ...base, content: kept.join(''), truncated: false } : { ...base, content: kept.join(''), truncated: true, next: { fromLine: nextLine } };
}
