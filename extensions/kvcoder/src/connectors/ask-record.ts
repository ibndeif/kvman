import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ProblemError, z, type Ctx } from '@kvman/sdk';
import { resolveInWorkspace } from '../files/workspace-path.ts';
import { invalid } from '../problems.ts';
import type { QuestionDoc } from '../schemas/records.ts';
import { callInput } from './connector-command.ts';

// `ask record` (plan 08 §8.5; ADR 0115, 24 to 27 and 49): the person records each line in their own voice. The check
// copies each line's example into the kernel's files so the card can play it; the answer's takes, uploaded by the card,
// are checked and written into the workspace as `<folder>/line-<n>.<ext>` before the answer applies.

const word = z.string().min(1).max(50);

export const recordPayload = z.strictObject({
  prompt: z.string().min(1).max(500).describe('What the person is asked, as they read it.'),
  lines: z
    .array(
      z.strictObject({
        text: z.string().min(1).max(500).describe('The line to say.'),
        stress: z.array(word).max(10).describe('Words to stress, shown in bold: each a word or a run of words, as the line writes them.').exactOptional(),
        pauses: z.array(word).max(10).describe('Where to pause: each a word or a run of words, as the line writes them, paused after.').exactOptional(),
        seconds: z.number().int().min(1).max(60).describe('About how long the take is.').exactOptional(),
        example: z.string().min(1).max(1000).describe('An .mp3, .wav, or .m4a of the workspace the person can hear first.').exactOptional(),
      }),
    )
    .min(1)
    .max(20),
  tone: z.string().min(1).max(200).describe('How to say it, as "warm and friendly".').exactOptional(),
  pace: z.string().min(1).max(200).describe('How fast, as "relaxed".').exactOptional(),
  folder: z.string().min(1).max(1000).describe('The workspace folder the takes are written to.'),
});

/** A recording question as it is stored: its payload and the kernel files its check made of the examples. */
const recordQuestionSchema = recordPayload.extend({ exampleFileIds: z.array(z.string().nullable()).exactOptional() });

export const recordAnswerSchema = z.strictObject({ takes: z.array(z.strictObject({ fileId: z.string().min(1), durationMs: z.number().int().min(1).max(61_000) })).min(1).max(20) });

/** The takes as the model reads them: workspace paths and lengths. */
export type RecordedTakes = { file: string; durationMs: number }[];

const exampleTypes: Record<string, string> = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4' };
const takeExtensions: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };
const largestExample = 10 * 1024 * 1024;
const largestTake = 25 * 1024 * 1024;

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A word or a run of words found in the line as whole words, in any case, across any spacing (ADR 0120, 25).
const hasWords = (text: string, found: string): boolean => new RegExp(`(?<![\\p{L}\\p{N}_])${found.trim().split(/\s+/u).map(escaped).join('\\s+')}(?![\\p{L}\\p{N}_])`, 'iu').test(text);

async function exampleFileId(ctx: Ctx, root: string, example: string): Promise<string> {
  const type = exampleTypes[path.extname(example).toLowerCase()];
  if (type === undefined) throw invalid(`The example ${example} isn't an .mp3, .wav, or .m4a.`, { path: example });
  const file = await resolveInWorkspace(root, example);
  const found = await stat(file).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') throw new ProblemError({ code: 'NOT_FOUND', message: `${example} doesn't exist.` });
    throw error;
  });
  if (!found.isFile() || found.size > largestExample) throw invalid(`The example ${example} must be a file of at most 10 MiB.`, { path: example });
  return (await ctx.files.write(path.basename(file), await readFile(file), type)).id;
}

export function registerRecordCheck(ctx: Ctx, registration: string): void {
  ctx.registerCommand(registration, {
    description: 'Checks a recording question and keeps its examples for the card.',
    input: callInput(recordPayload),
    output: z.object({ examples: z.array(z.string().nullable()) }),
    retries: 0,
    handle: async ({ payload }) => {
      const root = ctx.job.workspace.path;
      for (const line of payload.lines) {
        const missing = [...(line.stress ?? []), ...(line.pauses ?? [])].find((found) => !hasWords(line.text, found));
        if (missing !== undefined) throw invalid(`"${missing}" isn't found as whole words of the line "${line.text}"; give each word as the line writes it, with what is joined to it.`, { word: missing });
      }
      await resolveInWorkspace(root, payload.folder);
      const examples: (string | null)[] = [];
      for (const line of payload.lines) examples.push(line.example === undefined ? null : await exampleFileId(ctx, root, line.example));
      return { examples };
    },
  });
}

/** The answer's takes checked and written into the workspace, with the person's uploads to delete once it applies; a file another extension made is left. */
export async function writtenTakes(ctx: Ctx, question: QuestionDoc, answer: unknown): Promise<{ takes: RecordedTakes; uploads: string[] }> {
  const asked = recordQuestionSchema.parse(question.question);
  const given = recordAnswerSchema.safeParse(answer);
  if (!given.success) throw invalid('A recording is answered { takes: [{ fileId, durationMs }] }.');
  if (given.data.takes.length !== asked.lines.length) throw invalid(`There are ${String(asked.lines.length)} lines, so ${String(asked.lines.length)} takes.`);
  const root = ctx.job.workspace.path;
  const folder = await resolveInWorkspace(root, asked.folder);
  await mkdir(folder, { recursive: true });
  const takes: RecordedTakes = [];
  const uploads: string[] = [];
  for (const [index, take] of given.data.takes.entries()) {
    const file = await ctx.files.get(take.fileId).catch((error: unknown) => {
      if (error instanceof ProblemError && error.problem.code === 'NOT_FOUND') throw invalid(`The take of line ${String(index + 1)} isn't an uploaded file.`);
      throw error;
    });
    const extension = takeExtensions[file.type];
    if (extension === undefined || file.size > largestTake || file.workspaceId !== ctx.job.workspace.id) throw invalid(`The take of line ${String(index + 1)} must be WebM, Ogg, MP4, MP3, or WAV sound of at most 25 MiB.`);
    const target = path.join(folder, `line-${String(index + 1)}.${extension}`);
    await writeFile(target, await ctx.files.read(take.fileId));
    takes.push({ file: path.relative(root, target).split(path.sep).join('/'), durationMs: take.durationMs });
    if (file.owner.kind === 'user') uploads.push(take.fileId);
  }
  return { takes, uploads };
}
