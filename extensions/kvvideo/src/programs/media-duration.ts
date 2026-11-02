import { lastLines, runProgram, type Program } from './run-program.ts';

// A file's length and a picture's size, read with ffprobe (plan 16 §16.6 and §16.8).

export type Duration = { ok: true; ms: number } | { ok: false; reason: string };

export async function mediaDuration(ffprobe: Program, file: string, signal: AbortSignal): Promise<Duration> {
  const run = await runProgram(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { signal });
  const answer = run.stdout.trim();
  const seconds = Number(answer);
  if (run.exitCode !== 0 || answer === '' || !Number.isFinite(seconds)) return { ok: false, reason: lastLines(run.output) || `ffprobe answered ${answer}` };
  return { ok: true, ms: Math.round(seconds * 1000) };
}

export type MediaSize = { ok: true; width: number; height: number } | { ok: false; reason: string };

/** A video's or an image's size in pixels, read with ffprobe from its first video stream. */
export async function mediaSize(ffprobe: Program, file: string, signal: AbortSignal): Promise<MediaSize> {
  const run = await runProgram(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0', file], { signal });
  const match = /^(\d+)x(\d+)/.exec(run.stdout.trim());
  if (run.exitCode !== 0 || match === null) return { ok: false, reason: lastLines(run.output) || `ffprobe answered ${run.stdout.trim()}` };
  return { ok: true, width: Number(match[1]), height: Number(match[2]) };
}
