import { readFile, stat } from 'node:fs/promises';
import { invalid, notFound } from '../problems.ts';
import { resolveInWorkspace } from './workspace-path.ts';

// `fs read` (plan 08 §8.5, ADR 0011, 8): whole lines of a text file inside the workspace folder, at most 2000 of them
// and 30 KB, with the file's line count so the agent can go on from `fromLine`.

/** The most lines one read returns, and the default. */
export const readLinesLimit = 2000;

const contentLimit = 30 * 1024;

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

// The start of a line that alone passes the limit, cut where a character ends.
function cutLine(line: string): string {
  return new TextDecoder('utf-8').decode(Buffer.from(line, 'utf8').subarray(0, contentLimit)).replace(/�+$/, '');
}

export type FileRead = { path: string; fromLine: number; totalLines: number; content: string };

export async function readLines(workspace: string, input: { path: string; fromLine?: number | undefined; lines?: number | undefined }): Promise<FileRead> {
  const target = await resolveInWorkspace(workspace, input.path);
  const found = await stat(target).catch((error: unknown) => {
    if (isMissing(error)) throw notFound(`${input.path} doesn't exist.`, { path: input.path });
    throw error;
  });
  if (found.isDirectory()) throw invalid(`${input.path} is a folder; list it with fs list.`, { path: input.path });
  const decoded = decodeText(await readFile(target));
  if (decoded === undefined) throw invalid(`${input.path} isn't valid UTF-8 text, so it isn't read.`, { path: input.path });
  const all = decoded.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const fromLine = input.fromLine ?? 1;
  const wanted = all.slice(fromLine - 1, fromLine - 1 + (input.lines ?? readLinesLimit));
  const kept: string[] = [];
  let bytes = 0;
  for (const line of wanted) {
    bytes += Buffer.byteLength(line);
    if (bytes > contentLimit) break;
    kept.push(line);
  }
  const [first] = wanted;
  const content = kept.length === 0 && first !== undefined ? cutLine(first) : kept.join('');
  return { path: input.path, fromLine, totalLines: all.length, content };
}
