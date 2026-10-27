import { lastLines, runProgram, type Program } from './run-program.ts';

// A file's length, read with ffprobe (plan 16 §16.6 and §16.7).

export type Duration = { ok: true; ms: number } | { ok: false; reason: string };

export async function mediaDuration(ffprobe: Program, file: string, signal: AbortSignal): Promise<Duration> {
  const run = await runProgram(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { signal });
  const answer = run.stdout.trim();
  const seconds = Number(answer);
  if (run.exitCode !== 0 || answer === '' || !Number.isFinite(seconds)) return { ok: false, reason: lastLines(run.output) || `ffprobe answered ${answer}` };
  return { ok: true, ms: Math.round(seconds * 1000) };
}
