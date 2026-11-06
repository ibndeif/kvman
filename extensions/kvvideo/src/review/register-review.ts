import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z, type Ctx } from '@kvman/sdk';
import { readSidecar } from '../files/sidecar.ts';
import { inputPath } from '../files/workspace-paths.ts';
import { workFolder } from '../files/place-output.ts';
import { bundledFonts, fontsFolder } from '../fonts/bundled-fonts.ts';
import { trimOldest } from '../narration/narration-cache.ts';
import { hasSound, mediaDuration, mediaSize } from '../programs/media-duration.ts';
import { programOf } from '../programs/programs.ts';
import { lastLines, runProgram } from '../programs/run-program.ts';
import { kvvideoProblem } from '../problems.ts';
import { analysisArgs, analysisOf } from './analysis.ts';
import { frameTimes, sheetsOf } from './frames.ts';
import { sheetArgs, sheetGraph, tileOf } from './sheet-args.ts';

// `video review` (plan 16 §16.10; ADR 0115, 20 and 48): measures a video's silences, black and frozen pictures, and
// loudness, and makes contact sheets of its frames that the model sees through kvcoder (`images: true`). The newest 24
// sheets of the workspace are kept in the kernel's files.

const keptSheets = 24;

const problemSchema = z.object({ kind: z.enum(['silence', 'black', 'frozen', 'loudness']), atMs: z.number().int().nonnegative(), lengthMs: z.number().int().nonnegative(), reason: z.string() });

export const reviewOutputSchema = z.object({
  durationMs: z.number().int().nonnegative(),
  loudness: z.object({ integratedLufs: z.number(), truePeakDb: z.number() }).nullable(),
  problems: z.array(problemSchema),
  images: z.array(z.object({ fileId: z.string(), name: z.string() })),
});

const sheetRowSchema = z.object({ fileId: z.string(), createdAt: z.string() });

function failed(reason: string): Error {
  return kvvideoProblem('RENDER_FAILED', `ffmpeg couldn't review the video: ${reason}`, { scene: null, reason });
}

export function registerReview(ctx: Ctx): void {
  ctx.registerCommand('kvvideo.video.review', {
    description: "Reviews an MP4 of the workspace: its silences, black and frozen pictures, and loudness, and contact sheets of its frames to look at before telling the person it's ready.",
    input: z.strictObject({ file: z.string().min(1).max(1000).describe('The .mp4 file to review, in the workspace.') }),
    output: reviewOutputSchema,
    public: true,
    retries: 0,
    timeoutMs: 600_000,
    handle: async ({ file }) => {
      const video = inputPath(ctx.job.workspace.path, file, ['.mp4']);
      const [ffmpeg, ffprobe] = [await programOf(ctx, 'ffmpeg'), await programOf(ctx, 'ffprobe')];
      const signal = ctx.job.signal;
      const duration = await mediaDuration(ffprobe, video, signal);
      const size = await mediaSize(ffprobe, video, signal);
      if (!duration.ok || !size.ok) throw failed(duration.ok ? (size.ok ? '' : size.reason) : duration.reason);
      const sound = await hasSound(ffprobe, video, signal);
      const measured = await runProgram(ffmpeg, analysisArgs(video, sound), { signal });
      if (measured.exitCode !== 0) throw failed(lastLines(measured.output));
      const analysis = analysisOf(measured.output, duration.ms, sound);
      const sidecar = readSidecar(video);
      const sheets = sheetsOf(frameTimes(sidecar?.kind === 'video' ? sidecar : undefined, duration.ms)).slice(0, 8);
      const tile = tileOf(size.width, size.height);
      const work = workFolder();
      try {
        copyFileSync(path.join(fontsFolder, bundledFonts.find((font) => font.name === 'Poppins')?.file ?? ''), path.join(work.folder, 'font.ttf'));
        const images = [];
        for (const [index, times] of sheets.entries()) {
          ctx.job.progress({ key: 'kvvideo.progress.sheet', params: { n: index + 1, of: sheets.length } });
          writeFileSync(path.join(work.folder, 'sheet.graph'), sheetGraph(times, tile));
          const made = await runProgram(ffmpeg, sheetArgs(video, times, 'sheet.graph', 'sheet.jpg'), { cwd: work.folder, signal });
          if (made.exitCode !== 0) throw failed(lastLines(made.output));
          const name = `review-${String(index + 1)}.jpg`;
          const stored = await ctx.files.write(name, readFileSync(path.join(work.folder, 'sheet.jpg')), 'image/jpeg');
          images.push({ fileId: stored.id, name });
        }
        const rows = ctx.store.collection('reviewSheets', sheetRowSchema);
        for (const image of images) await rows.insert({ fileId: image.fileId, createdAt: new Date().toISOString() });
        await trimOldest(rows, ctx.files, keptSheets);
        return { durationMs: duration.ms, loudness: analysis.loudness, problems: analysis.problems, images };
      } finally {
        work.remove();
      }
    },
  });
}
