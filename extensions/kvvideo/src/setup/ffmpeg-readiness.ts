import type { ProgramName } from '../settings.ts';

// Whether ffmpeg can make kvvideo's videos (plan 16 §16.4): it and ffprobe run, and ffmpeg has the encoders and the
// libass `subtitles` filter that kvvideo uses. A program that can't run answers `undefined`.

/** What one program printed with its exit code, or `undefined` when it couldn't run. */
export type Answer = { exitCode: number; stdout: string } | undefined;

/** Runs a program with its arguments, giving it 5 s. */
export type CheckRun = (program: ProgramName, args: readonly string[]) => Promise<Answer>;

export type FfmpegReadiness = { ready: boolean; version: string | null; missing: string[] };

const encoders = ['libx264', 'aac', 'libmp3lame'] as const;
const filters = ['subtitles'] as const;

function succeeded(answer: Answer): answer is { exitCode: number; stdout: string } {
  return answer !== undefined && answer.exitCode === 0;
}

/** The names in an `-encoders` or `-filters` listing: each row's second word, after its flags. */
export function listedNames(listing: string): Set<string> {
  return new Set(listing.split('\n').map((line) => line.trim().split(/\s+/)[1]).filter((name): name is string => name !== undefined));
}

/** The version in ffmpeg's first line, `ffmpeg version <version> …`. */
export function versionOf(text: string): string | null {
  const words = (text.split('\n')[0] ?? '').trim().split(/\s+/);
  return words[0] === 'ffmpeg' && words[1] === 'version' && words[2] !== undefined ? words[2] : null;
}

export async function ffmpegReadiness(run: CheckRun): Promise<FfmpegReadiness> {
  const [version, probe, encoderList, filterList] = await Promise.all([
    run('ffmpeg', ['-hide_banner', '-version']),
    run('ffprobe', ['-hide_banner', '-version']),
    run('ffmpeg', ['-hide_banner', '-encoders']),
    run('ffmpeg', ['-hide_banner', '-filters']),
  ]);
  const ffmpegRuns = succeeded(version);
  const encoderNames = ffmpegRuns && succeeded(encoderList) ? listedNames(encoderList.stdout) : new Set<string>();
  const filterNames = ffmpegRuns && succeeded(filterList) ? listedNames(filterList.stdout) : new Set<string>();
  const missing = [
    ...(ffmpegRuns ? [] : ['ffmpeg']),
    ...(succeeded(probe) ? [] : ['ffprobe']),
    ...encoders.filter((name) => !encoderNames.has(name)),
    ...filters.filter((name) => !filterNames.has(name)),
  ];
  return { ready: missing.length === 0, version: ffmpegRuns ? versionOf(version.stdout) : null, missing };
}
