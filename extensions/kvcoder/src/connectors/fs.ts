import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { z, type Ctx } from '@kvman/sdk';
import { applyEdits, type EditedText } from '../files/edit-text.ts';
import { changeFile, undoChange } from '../files/file-change.ts';
import { assembleParts, partsLimit, savePart } from '../files/file-parts.ts';
import { findPaths } from '../files/find-paths.ts';
import { listEntries } from '../files/list-entries.ts';
import { readLines } from '../files/read-file.ts';
import { searchText } from '../files/search-text.ts';
import { resolveInWorkspace } from '../files/workspace-path.ts';
import { invalid, notFound } from '../problems.ts';
import { records } from '../store/collections.ts';
import { callInput, type ConnectorCommand } from './connector-command.ts';
import { edits, risky } from './payload-fields.ts';

// The `fs` connector (plan 08 §8.5, ADR 0009, 157 to 160; ADR 0011, 8): `read`, `list`, and `search` look inside the
// workspace folder; `write` creates or replaces a file and `edit` replaces text in one, after the approval the shell's
// calls get. A change is checked against what the chat last saw of the file, replaces it whole, and can be undone
// (ADR 0053).

/** What the prompt's index says the connector is for. */
export const fsDescription =
  'Read, list, search, create, and change files in the workspace folder. Use it instead of cat, ls, find, grep, or shell redirection: find a file by name or path pattern with find, not by listing folder after folder; read a file before you change it (a change to a file this chat has not read, or that changed since, fails), write for a new file or a full rewrite (a long file in pieces with part, then assemble), one file per call, and edit for exact text replacements in an existing file.';

const filePath = (what: string) => z.string().min(1).describe(`${what}, relative to the workspace folder, or absolute inside it.`);

const payloads = {
  read: z.strictObject({
    path: filePath('The file to read'),
    fromLine: z.number().int().min(1).describe('The first line to return, counting from 1. The default is 1.').exactOptional(),
    fromColumn: z.number().int().min(1).describe('The character of fromLine to start at, from 1: pass it only as a result gave it in next.').exactOptional(),
    lines: z.number().int().min(1).max(2000).describe('How many lines to return: 2000 by default, which is also the most.').exactOptional(),
  }),
  list: z.strictObject({ path: z.string().describe('The folder to list, relative to the workspace folder, or absolute inside it; the workspace folder when left out or empty.').exactOptional() }),
  find: z.strictObject({
    pattern: z.string().min(1).describe('A glob: ** is any run of characters, * any run but /, and ? one character but /. With a /, it matches the path from path, as src/**/*.ts; without one, the file name, as *.test.ts.'),
    path: z.string().describe('The folder to look under, relative to the workspace folder, or absolute inside it; the workspace folder when left out or empty.').exactOptional(),
  }),
  search: z.strictObject({
    pattern: z.string().min(1).describe('A JavaScript regular expression, matched against each line, case-sensitive; plain text with literal.'),
    path: z.string().describe('The file or folder to search, relative to the workspace folder, or absolute inside it; the workspace folder when left out or empty.').exactOptional(),
    literal: z.boolean().describe('true to match pattern as plain text, not as a regular expression.').exactOptional(),
    glob: z.string().min(1).describe('Which files to search, such as *.ts or src/**/*.vue.').exactOptional(),
    context: z.number().int().describe('How many lines to show before and after each match, from 0 to 10; a number outside them is cut into them. Lines around a match are marked context.').exactOptional(),
    filesOnly: z.boolean().describe('true gives each matching file with its count of matching lines, and no lines; not with context.').exactOptional(),
  }),
  write: z.strictObject({ path: filePath('The file to create or replace'), content: z.string().describe('The whole content of the file.'), risky }),
  edit: z.strictObject({ path: filePath('The existing text file to change'), edits, risky }),
  undo: z.strictObject({ path: filePath('The file whose latest change by this chat to take back'), risky }),
  part: z.strictObject({ path: filePath('The long file being written'), part: z.number().int().min(1).max(partsLimit).describe('The number of this piece, from 1; a number sent again replaces its piece.'), content: z.string().describe('The text of this piece, at most 64 KB.') }),
  assemble: z.strictObject({ path: filePath('The file to write from its saved parts'), risky }),
};

export const fsCommands = {
  read: { registration: 'kvcoder.fs.file.get', description: 'Reads lines of a text file.', payload: payloads.read, asks: false, bounded: true },
  list: { registration: 'kvcoder.fs.entry.list', description: 'Lists the files and folders of one folder.', payload: payloads.list, asks: false, bounded: true },
  find: { registration: 'kvcoder.fs.path.list', description: 'Finds the files whose path matches a glob, under a folder, newest first.', payload: payloads.find, asks: false, bounded: true },
  search: { registration: 'kvcoder.fs.text.search', description: 'Finds the lines that match a regular expression, in a file or under a folder.', payload: payloads.search, asks: false, bounded: true },
  write: { registration: 'kvcoder.fs.write', description: 'Creates a file and its parent folders, or replaces the file.', payload: payloads.write, asks: true },
  edit: { registration: 'kvcoder.fs.edit', description: 'Replaces exact pieces of text in an existing file; if one replacement fails, nothing is written.', payload: payloads.edit, asks: true },
  undo: { registration: 'kvcoder.fs.undo', description: "Takes back this chat's latest change to a file, when the file hasn't changed since.", payload: payloads.undo, asks: true },
  part: { registration: 'kvcoder.fs.part', description: 'Saves one numbered piece of a long file, without writing the file yet.', payload: payloads.part, asks: false },
  assemble: { registration: 'kvcoder.fs.assemble', description: 'Writes a file from its saved parts, in order, and drops them; names the missing numbers when one is absent.', payload: payloads.assemble, asks: true },
} satisfies Record<string, ConnectorCommand>;

const strictText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });


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

function textOf(bytes: Buffer, requested: string): string {
  try {
    return strictText.decode(bytes);
  } catch {
    throw invalid(`${requested} isn't valid UTF-8 text, so it isn't edited.`, { path: requested });
  }
}

async function changed(ctx: Ctx, sessionId: string, requested: string) {
  return { sessionId, shown: requested, real: await resolveInWorkspace(ctx.job.workspace.path, requested) };
}

async function writeTo(ctx: Ctx, sessionId: string, input: z.output<typeof payloads.write>) {
  const file = await changed(ctx, sessionId, input.path);
  // A path below a file is refused as the file system says it, before any folder is made.
  await stat(file.real).catch((error: unknown) => {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  });
  await mkdir(path.dirname(file.real), { recursive: true });
  ctx.job.signal.throwIfAborted();
  const content = Buffer.from(input.content, 'utf8');
  return changeFile(ctx, file, () => ({ content, value: { path: input.path, bytes: content.length } }));
}

const shownAround = 3;
const shownEdge = 6;

// What an edit changed (ADR 0034, 1; ADR 0069, 2): the file's lines from 3 before the first changed line to 3 after
// the last. A longer change shows its two ends: the model wrote the lines between them itself.
function changedLines(edited: EditedText): { fromLine: number; content: string } {
  const lines = edited.text.replace(/^\uFEFF/, '').match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const fromLine = Math.max(edited.firstChangedLine - shownAround, 1);
  const shown = lines.slice(fromLine - 1, edited.lastChangedLine + shownAround);
  if (shown.length <= 2 * shownEdge + 1) return { fromLine, content: shown.join('') };
  return { fromLine, content: [...shown.slice(0, shownEdge), `[… ${String(shown.length - 2 * shownEdge)} lines not shown …]\n`, ...shown.slice(-shownEdge)].join('') };
}

async function editIn(ctx: Ctx, sessionId: string, input: z.output<typeof payloads.edit>) {
  const file = await changed(ctx, sessionId, input.path);
  ctx.job.signal.throwIfAborted();
  return changeFile(ctx, file, (previous) => {
    if (previous === undefined) throw notFound(`${input.path} doesn't exist.`, { path: input.path });
    const edited = applyEdits(textOf(previous, input.path), input.edits);
    return { content: Buffer.from(edited.text, 'utf8'), value: { path: input.path, replacements: edited.replacements, firstChangedLine: edited.firstChangedLine, ...changedLines(edited) } };
  });
}

const commands = fsCommands;

export function registerFsConnector(ctx: Ctx): void {
  ctx.registerQuery('kvcoder.fs.file.get', {
    description: commands.read.description,
    input: callInput(payloads.read),
    output: z.object({ path: z.string(), fromLine: z.number().int(), totalLines: z.number().int(), content: z.string(), truncated: z.boolean(), next: z.object({ fromLine: z.number().int(), fromColumn: z.number().int().exactOptional() }).exactOptional() }),
    handle: ({ sessionId, payload }) => asProblems(() => readLines(ctx.job.workspace.path, payload, async (real) => (await records(ctx.store).fileViews.find({ sessionId, path: real }, { limit: 1 }))[0]?.fingerprint)),
  });
  ctx.registerQuery('kvcoder.fs.entry.list', {
    description: commands.list.description,
    input: callInput(payloads.list),
    output: z.object({ path: z.string(), entries: z.array(z.object({ name: z.string(), kind: z.enum(['file', 'folder']), bytes: z.number().int() })), truncated: z.boolean() }),
    handle: ({ payload }) => asProblems(() => listEntries(ctx.job.workspace.path, payload)),
  });
  ctx.registerQuery('kvcoder.fs.path.list', {
    description: commands.find.description,
    input: callInput(payloads.find),
    output: z.object({ paths: z.array(z.string()), truncated: z.boolean() }),
    handle: ({ payload }) => asProblems(() => findPaths(ctx.job.workspace.path, payload, ctx.job.signal)),
  });
  ctx.registerQuery('kvcoder.fs.text.search', {
    description: commands.search.description,
    input: callInput(payloads.search),
    output: z.object({ files: z.array(z.union([z.object({ path: z.string(), matches: z.array(z.object({ line: z.number().int(), text: z.string(), context: z.literal(true).exactOptional() })) }), z.object({ path: z.string(), count: z.number().int() })])), truncated: z.boolean(), reason: z.enum(['matches', 'time']).exactOptional() }),
    handle: ({ payload }) => asProblems(() => searchText(ctx.job.workspace.path, payload, ctx.job.signal)),
  });
  ctx.registerCommand('kvcoder.fs.write', {
    description: commands.write.description,
    input: callInput(payloads.write),
    output: z.object({ path: z.string(), created: z.boolean(), bytes: z.number().int() }),
    retries: 0,
    maxInputBytes: 33_554_432,
    handle: ({ sessionId, payload }) => asProblems(() => writeTo(ctx, sessionId, payload)),
  });
  ctx.registerCommand('kvcoder.fs.edit', {
    description: commands.edit.description,
    input: callInput(payloads.edit),
    output: z.object({ path: z.string(), replacements: z.number().int(), firstChangedLine: z.number().int(), fromLine: z.number().int(), content: z.string() }),
    retries: 0,
    maxInputBytes: 33_554_432,
    handle: ({ sessionId, payload }) => asProblems(() => editIn(ctx, sessionId, payload)),
  });
  ctx.registerCommand('kvcoder.fs.part', {
    description: commands.part.description,
    input: callInput(payloads.part),
    output: z.object({ path: z.string(), part: z.number().int(), parts: z.array(z.number().int()), bytes: z.number().int() }),
    retries: 0,
    handle: async ({ sessionId, payload }) => asProblems(async () => savePart(ctx, await changed(ctx, sessionId, payload.path), payload.part, payload.content)),
  });
  ctx.registerCommand('kvcoder.fs.assemble', {
    description: commands.assemble.description,
    input: callInput(payloads.assemble),
    output: z.object({ path: z.string(), created: z.boolean(), bytes: z.number().int(), parts: z.number().int() }),
    retries: 0,
    handle: async ({ sessionId, payload }) => asProblems(async () => {
      const file = await changed(ctx, sessionId, payload.path);
      await mkdir(path.dirname(file.real), { recursive: true });
      return assembleParts(ctx, file);
    }),
  });
  ctx.registerCommand('kvcoder.fs.undo', {
    description: commands.undo.description,
    input: callInput(payloads.undo),
    output: z.object({ path: z.string(), removed: z.boolean(), bytes: z.number().int() }),
    retries: 0,
    handle: async ({ sessionId, payload }) => asProblems(async () => undoChange(ctx, await changed(ctx, sessionId, payload.path))),
  });
}
