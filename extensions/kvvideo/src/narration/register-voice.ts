import path from 'node:path';
import { z, type Ctx } from '@kvman/sdk';
import { answerPath } from '../files/answer-path.ts';
import { placeOutput, workFolder } from '../files/place-output.ts';
import { sidecarCaptionSchema, sidecarOutputPath, writeSidecar } from '../files/sidecar.ts';
import { inputPath, outputPath } from '../files/workspace-paths.ts';
import { mediaDuration } from '../programs/media-duration.ts';
import { programOf } from '../programs/programs.ts';
import { lastLines, runProgram } from '../programs/run-program.ts';
import { kvvideoProblem } from '../problems.ts';
import { captionsOf, sentencesOf, type PlacedSentence } from './captions.ts';
import { joinNarrationArgs, sentenceGapMs } from './join-args.ts';
import { spokenOf } from './pronunciations.ts';
import { takeArgs } from './voice-args.ts';

// `video voice` (plan 16 §16.7; ADR 0115, 28 and 50): the person's takes of a scene, as `ask record` wrote them, each
// cleaned (or only converted), joined as `narrate` joins sentences into an MP3 of the workspace, with each take's
// captions lasting its own length; a sidecar beside it. The takes are never changed.

export const takeExtensions = ['.webm', '.ogg', '.m4a', '.mp4', '.mp3', '.wav'];

export const voiceInputSchema = z.strictObject({
  lines: z.array(z.strictObject({ take: z.string().min(1).max(1000).describe('A take of the person, as ask record wrote it.'), text: z.string().min(1).max(500).describe('What is said in the take.') })).min(1).max(20),
  file: z.string().min(1).max(1000).describe('The .mp3 file to write, in the workspace.'),
  clean: z.boolean().describe('false only converts the takes; true (the default) removes noise, trims silence, and evens the level.').exactOptional(),
  replace: z.boolean().describe('Write over an existing file.').exactOptional(),
});

export const voiceOutputSchema = z.object({ file: z.string(), durationMs: z.number().int().nonnegative(), captions: z.array(sidecarCaptionSchema) });

function failed(take: number | null, reason: string): Error {
  return kvvideoProblem('RENDER_FAILED', `ffmpeg couldn't make ${take === null ? 'the joined voice' : `take ${String(take)}`}: ${reason}`, { take, reason });
}

export function registerVoice(ctx: Ctx): void {
  ctx.registerCommand('kvvideo.voice.make', {
    description: "Makes a narration from the person's own takes: each cleaned, joined into an MP3 file in the workspace, with its length and captions.",
    input: voiceInputSchema,
    output: voiceOutputSchema,
    public: true,
    retries: 0,
    timeoutMs: 300_000,
    handle: async (input) => {
      const root = ctx.job.workspace.path;
      const replace = input.replace === true;
      const takes = input.lines.map((line) => inputPath(root, line.take, takeExtensions));
      const output = outputPath(root, input.file, '.mp3', replace);
      const sidecar = sidecarOutputPath(output, replace, input.file);
      const [ffmpeg, ffprobe] = [await programOf(ctx, 'ffmpeg'), await programOf(ctx, 'ffprobe')];
      const work = workFolder();
      try {
        const cleaned: string[] = [];
        const placed: PlacedSentence[] = [];
        let startMs = 0;
        for (const [index, take] of takes.entries()) {
          ctx.job.progress({ key: 'kvvideo.progress.take', params: { n: index + 1, of: takes.length } });
          const made = path.join(work.folder, `take-${String(index + 1)}.wav`);
          const run = await runProgram(ffmpeg, takeArgs(take, input.clean !== false, made), { signal: ctx.job.signal });
          if (run.exitCode !== 0) throw failed(index + 1, lastLines(run.output));
          const length = await mediaDuration(ffprobe, made, ctx.job.signal);
          if (!length.ok) throw failed(index + 1, length.reason);
          const text = sentencesOf(input.lines[index]?.text ?? '').join(' ');
          placed.push({ text, spoken: spokenOf(text, []), startMs, durationMs: length.ms, alignment: null });
          cleaned.push(made);
          startMs += length.ms + sentenceGapMs;
        }
        const joined = path.join(work.folder, 'voice.mp3');
        const run = await runProgram(ffmpeg, joinNarrationArgs(cleaned, joined), { signal: ctx.job.signal });
        if (run.exitCode !== 0) throw failed(null, lastLines(run.output));
        const duration = await mediaDuration(ffprobe, joined, ctx.job.signal);
        if (!duration.ok) throw failed(null, duration.reason);
        const captions = captionsOf(placed, duration.ms);
        const madeSidecar = writeSidecar(work.folder, { kind: 'narration', durationMs: duration.ms, captions });
        placeOutput(joined, output);
        placeOutput(madeSidecar, sidecar);
        return { file: answerPath(root, output), durationMs: duration.ms, captions };
      } finally {
        work.remove();
      }
    },
  });
}
