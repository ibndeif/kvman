import type { Stats } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ProblemError, z, type Ctx } from '@kvman/sdk';
import { builtinHelp, callInput, errorOutput, jsonOutput, type CallResult } from '../connector-line.ts';
import { applyEdits } from '../files/edit-text.ts';
import { inOrder } from '../files/file-queue.ts';
import { lexicalPath, resolveInWorkspace } from '../files/workspace-path.ts';
import { invalid, notFound } from '../problems.ts';
import { withBody } from './write-body.ts';

// The `fs` connector (plan 08 §8.5, ADR 0009, 157 to 160): `write` creates or replaces a file, `edit` replaces text
// in one, both inside the workspace folder. It runs in the step, after the approval the shell's calls get.

const filePath = z.string().min(1);

const inputSchemas = {
  write: z.strictObject({ path: filePath, content: z.string() }),
  edit: z.strictObject({ path: filePath, edits: z.array(z.strictObject({ oldText: z.string(), newText: z.string() })).min(1) }),
};

const strictText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

const missing = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'ENOENT';

// The file system's own refusals (a folder in the way, no permission) are the model's to read and fix.
const refusedByFileSystem = (error: unknown): error is Error & { code: string } => error instanceof Error && 'code' in error && typeof error.code === 'string' && /^E[A-Z]+$/.test(error.code);

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

async function writeTo(ctx: Ctx, input: z.output<typeof inputSchemas.write>): Promise<CallResult> {
  const target = await resolveInWorkspace(ctx.job.workspace.path, input.path);
  const existing = await statOrUndefined(target);
  if (existing?.isDirectory() === true) throw invalid(`${input.path} is a folder.`, { path: input.path });
  await mkdir(path.dirname(target), { recursive: true });
  ctx.job.signal.throwIfAborted();
  await writeFile(target, input.content, 'utf8');
  return jsonOutput({ path: input.path, created: existing === undefined, bytes: Buffer.byteLength(input.content) });
}

async function editIn(ctx: Ctx, input: z.output<typeof inputSchemas.edit>): Promise<CallResult> {
  const target = await resolveInWorkspace(ctx.job.workspace.path, input.path);
  const edited = applyEdits(await readText(target, input.path), input.edits);
  ctx.job.signal.throwIfAborted();
  await writeFile(target, edited.text, 'utf8');
  return jsonOutput({ path: input.path, replacements: edited.replacements, firstChangedLine: edited.firstChangedLine });
}

async function run(ctx: Ctx, command: 'write' | 'edit', input: Record<string, unknown>): Promise<CallResult> {
  try {
    return command === 'write' ? await writeTo(ctx, inputSchemas.write.parse(input)) : await editIn(ctx, inputSchemas.edit.parse(input));
  } catch (error) {
    if (error instanceof ProblemError) return errorOutput(error.problem);
    if (refusedByFileSystem(error)) return errorOutput({ code: 'VALIDATION_FAILED', message: error.message });
    throw error;
  }
}

/** An `fs` call: its result now, after the calls before it on the same file. */
export function fsCall(ctx: Ctx, words: readonly string[], stdin: string | null): Promise<CallResult> {
  if (words.length === 1 && words[0] === '-h') return Promise.resolve({ output: builtinHelp.fs, exitCode: 0 });
  const body = withBody(words, stdin);
  if ('output' in body) return Promise.resolve(body);
  const call = callInput(body.words, body.stdin, 'fs');
  if ('output' in call) return Promise.resolve(call);
  const command = call.command;
  if (command !== 'write' && command !== 'edit') return Promise.resolve(errorOutput({ code: 'NOT_FOUND', message: `fs has no command ${command}; run \`fs -h\`.` }));
  const parsed = inputSchemas[command].safeParse(call.input);
  if (!parsed.success) return Promise.resolve(errorOutput({ code: 'VALIDATION_FAILED', message: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ') }));
  return inOrder(lexicalPath(ctx.job.workspace.path, parsed.data.path), () => run(ctx, command, parsed.data));
}
