import type { Stats } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z, type Ctx } from '@kvman/sdk';
import { applyEdits } from '../files/edit-text.ts';
import { listEntries } from '../files/list-entries.ts';
import { readLines } from '../files/read-file.ts';
import { searchText } from '../files/search-text.ts';
import { resolveInWorkspace } from '../files/workspace-path.ts';
import { invalid, notFound } from '../problems.ts';
import { callInput, payloads } from '../schemas/payloads.ts';
import { builtinCommands } from './builtin-connectors.ts';

// The `fs` connector (plan 08 §8.5, ADR 0009, 157 to 160; ADR 0011, 8): `read`, `list`, and `search` look inside the
// workspace folder; `write` creates or replaces a file and `edit` replaces text in one, after the approval the shell's
// calls get. The step runs the changes to one file one after another.

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

async function writeTo(ctx: Ctx, input: z.output<typeof payloads.fsWrite>) {
  const target = await resolveInWorkspace(ctx.job.workspace.path, input.path);
  const existing = await statOrUndefined(target);
  if (existing?.isDirectory() === true) throw invalid(`${input.path} is a folder.`, { path: input.path });
  await mkdir(path.dirname(target), { recursive: true });
  ctx.job.signal.throwIfAborted();
  await writeFile(target, input.content, 'utf8');
  return { path: input.path, created: existing === undefined, bytes: Buffer.byteLength(input.content) };
}

async function editIn(ctx: Ctx, input: z.output<typeof payloads.fsEdit>) {
  const target = await resolveInWorkspace(ctx.job.workspace.path, input.path);
  const edited = applyEdits(await readText(target, input.path), input.edits);
  ctx.job.signal.throwIfAborted();
  await writeFile(target, edited.text, 'utf8');
  return { path: input.path, replacements: edited.replacements, firstChangedLine: edited.firstChangedLine };
}

const commands = builtinCommands.fs;

export function registerFsConnector(ctx: Ctx): void {
  ctx.registerQuery('kvcoder.fs.file.get', {
    description: commands.read.description,
    input: callInput(payloads.fsRead),
    output: z.object({ path: z.string(), fromLine: z.number().int(), totalLines: z.number().int(), content: z.string() }),
    handle: ({ payload }) => asProblems(() => readLines(ctx.job.workspace.path, payload)),
  });
  ctx.registerQuery('kvcoder.fs.entry.list', {
    description: commands.list.description,
    input: callInput(payloads.fsList),
    output: z.object({ path: z.string(), entries: z.array(z.object({ name: z.string(), kind: z.enum(['file', 'folder']), bytes: z.number().int() })), truncated: z.boolean() }),
    handle: ({ payload }) => asProblems(() => listEntries(ctx.job.workspace.path, payload)),
  });
  ctx.registerQuery('kvcoder.fs.text.search', {
    description: commands.search.description,
    input: callInput(payloads.fsSearch),
    output: z.object({ matches: z.array(z.object({ path: z.string(), line: z.number().int(), text: z.string() })), truncated: z.boolean() }),
    handle: ({ payload }) => asProblems(() => searchText(ctx.job.workspace.path, payload, ctx.job.signal)),
  });
  ctx.registerCommand('kvcoder.fs.write', {
    description: commands.write.description,
    input: callInput(payloads.fsWrite),
    output: z.object({ path: z.string(), created: z.boolean(), bytes: z.number().int() }),
    retries: 0,
    maxInputBytes: 33_554_432,
    handle: ({ payload }) => asProblems(() => writeTo(ctx, payload)),
  });
  ctx.registerCommand('kvcoder.fs.edit', {
    description: commands.edit.description,
    input: callInput(payloads.fsEdit),
    output: z.object({ path: z.string(), replacements: z.number().int(), firstChangedLine: z.number().int() }),
    retries: 0,
    maxInputBytes: 33_554_432,
    handle: ({ payload }) => asProblems(() => editIn(ctx, payload)),
  });
}
