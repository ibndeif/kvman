import type { Stats } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z, type Ctx } from '@kvman/sdk';
import { applyEdits, type EditedText } from '../files/edit-text.ts';
import { listEntries } from '../files/list-entries.ts';
import { readLines } from '../files/read-file.ts';
import { searchText } from '../files/search-text.ts';
import { resolveInWorkspace } from '../files/workspace-path.ts';
import { invalid, notFound } from '../problems.ts';
import { callInput, type ConnectorCommand } from './connector-command.ts';
import { edits, risky } from './payload-fields.ts';

// The `fs` connector (plan 08 §8.5, ADR 0009, 157 to 160; ADR 0011, 8): `read`, `list`, and `search` look inside the
// workspace folder; `write` creates or replaces a file and `edit` replaces text in one, after the approval the shell's
// calls get. The step runs the changes to one file one after another.

/** What the prompt's index says the connector is for. */
export const fsDescription =
  'Read, list, search, create, and change files in the workspace folder. Use it instead of cat, ls, grep, or shell redirection: read a file before you edit it, write for a new file or a full rewrite, one file per call, and edit for exact text replacements in an existing file.';

const filePath = (what: string) => z.string().min(1).describe(`${what}, relative to the workspace folder, or absolute inside it.`);

const payloads = {
  read: z.strictObject({
    path: filePath('The file to read'),
    fromLine: z.number().int().min(1).describe('The first line to return, counting from 1. The default is 1.').exactOptional(),
    lines: z.number().int().min(1).max(2000).describe('How many lines to return: 2000 by default, which is also the most.').exactOptional(),
  }),
  list: z.strictObject({ path: z.string().describe('The folder to list, relative to the workspace folder, or absolute inside it; the workspace folder when left out or empty.').exactOptional() }),
  search: z.strictObject({
    pattern: z.string().min(1).describe('A JavaScript regular expression, matched against each line, case-sensitive.'),
    path: z.string().describe('The file or folder to search, relative to the workspace folder, or absolute inside it; the workspace folder when left out or empty.').exactOptional(),
  }),
  write: z.strictObject({ path: filePath('The file to create or replace'), content: z.string().describe('The whole content of the file.'), risky }),
  edit: z.strictObject({ path: filePath('The existing text file to change'), edits, risky }),
};

export const fsCommands = {
  read: { registration: 'kvcoder.fs.file.get', description: 'Reads lines of a text file.', payload: payloads.read, asks: false, bounded: true },
  list: { registration: 'kvcoder.fs.entry.list', description: 'Lists the files and folders of one folder.', payload: payloads.list, asks: false, bounded: true },
  search: { registration: 'kvcoder.fs.text.search', description: 'Finds the lines that match a regular expression, in a file or under a folder.', payload: payloads.search, asks: false, bounded: true },
  write: { registration: 'kvcoder.fs.write', description: 'Creates a file and its parent folders, or replaces the file.', payload: payloads.write, asks: true },
  edit: { registration: 'kvcoder.fs.edit', description: 'Replaces exact pieces of text in an existing file; if one replacement fails, nothing is written.', payload: payloads.edit, asks: true },
} satisfies Record<string, ConnectorCommand>;

const strictText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

const missing = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'ENOENT';

// The file system's own refusals (a folder in the way, no permission) are the model's to read and fix.
const refusedByFileSystem = (error: unknown): error is Error & { code: string } => error instanceof Error && 'code' in error && typeof error.code === 'string' && /^E[A-Z]+$/.test(error.code);

async function asProblems<Result>(run: () => Promise<Result>): Promise<Result> {
  try {
    return await run();
  } catch (error) {
    if (refusedByFileSystem(error)) throw invalid(error.message);
    throw error;
  }
}

async function statOrUndefined(target: string): Promise<Stats | undefined> {
  try {
    return await stat(target);
  } catch (error) {
    if (missing(error)) return undefined;
    throw error;
  }
}

async function readText(target: string, requested: string): Promise<string> {
  let bytes: Buffer;
  try {
    bytes = await readFile(target);
  } catch (error) {
    throw missing(error) ? notFound(`${requested} doesn't exist.`, { path: requested }) : error;
  }
  try {
    return strictText.decode(bytes);
  } catch {
    throw invalid(`${requested} isn't valid UTF-8 text, so it isn't edited.`, { path: requested });
  }
}

async function writeTo(ctx: Ctx, input: z.output<typeof payloads.write>) {
  const target = await resolveInWorkspace(ctx.job.workspace.path, input.path);
  const existing = await statOrUndefined(target);
  if (existing?.isDirectory() === true) throw invalid(`${input.path} is a folder.`, { path: input.path });
  await mkdir(path.dirname(target), { recursive: true });
  ctx.job.signal.throwIfAborted();
  await writeFile(target, input.content, 'utf8');
  return { path: input.path, created: existing === undefined, bytes: Buffer.byteLength(input.content) };
}

const shownAround = 3;
const shownLimit = 80;

// What an edit changed (ADR 0034, 1): the file's lines from 3 before the first changed line to 3 after the last, at most 80.
function changedLines(edited: EditedText): { fromLine: number; content: string } {
  const lines = edited.text.replace(/^\uFEFF/, '').match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const fromLine = Math.max(edited.firstChangedLine - shownAround, 1);
  const last = Math.min(edited.lastChangedLine + shownAround, fromLine + shownLimit - 1);
  return { fromLine, content: lines.slice(fromLine - 1, last).join('') };
}

async function editIn(ctx: Ctx, input: z.output<typeof payloads.edit>) {
  const target = await resolveInWorkspace(ctx.job.workspace.path, input.path);
  const edited = applyEdits(await readText(target, input.path), input.edits);
  ctx.job.signal.throwIfAborted();
  await writeFile(target, edited.text, 'utf8');
  return { path: input.path, replacements: edited.replacements, firstChangedLine: edited.firstChangedLine, ...changedLines(edited) };
}

const commands = fsCommands;

export function registerFsConnector(ctx: Ctx): void {
  ctx.registerQuery('kvcoder.fs.file.get', {
    description: commands.read.description,
    input: callInput(payloads.read),
    output: z.object({ path: z.string(), fromLine: z.number().int(), totalLines: z.number().int(), content: z.string() }),
    handle: ({ payload }) => asProblems(() => readLines(ctx.job.workspace.path, payload)),
  });
  ctx.registerQuery('kvcoder.fs.entry.list', {
    description: commands.list.description,
    input: callInput(payloads.list),
    output: z.object({ path: z.string(), entries: z.array(z.object({ name: z.string(), kind: z.enum(['file', 'folder']), bytes: z.number().int() })), truncated: z.boolean() }),
    handle: ({ payload }) => asProblems(() => listEntries(ctx.job.workspace.path, payload)),
  });
  ctx.registerQuery('kvcoder.fs.text.search', {
    description: commands.search.description,
    input: callInput(payloads.search),
    output: z.object({ files: z.array(z.object({ path: z.string(), matches: z.array(z.object({ line: z.number().int(), text: z.string() })) })), truncated: z.boolean() }),
    handle: ({ payload }) => asProblems(() => searchText(ctx.job.workspace.path, payload, ctx.job.signal)),
  });
  ctx.registerCommand('kvcoder.fs.write', {
    description: commands.write.description,
    input: callInput(payloads.write),
    output: z.object({ path: z.string(), created: z.boolean(), bytes: z.number().int() }),
    retries: 0,
    maxInputBytes: 33_554_432,
    handle: ({ payload }) => asProblems(() => writeTo(ctx, payload)),
  });
  ctx.registerCommand('kvcoder.fs.edit', {
    description: commands.edit.description,
    input: callInput(payloads.edit),
    output: z.object({ path: z.string(), replacements: z.number().int(), firstChangedLine: z.number().int(), fromLine: z.number().int(), content: z.string() }),
    retries: 0,
    maxInputBytes: 33_554_432,
    handle: ({ payload }) => asProblems(() => editIn(ctx, payload)),
  });
}
