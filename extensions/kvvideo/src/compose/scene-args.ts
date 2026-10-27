import { framesPerSecond } from '../record/frame-writer.ts';
import type { PlannedScene } from './scene-plan.ts';

// ffmpeg's arguments for each scene's part and for the join (plan 16 §16.7, ADR 0107, 23). ffmpeg runs in the work
// folder, so a scene's ASS file and the fonts folder are named by their relative paths and no path is written into
// the filter.

export type Size = { width: number; height: number };

const seconds = (ms: number): string => (ms / 1000).toFixed(3);

const quiet = ['-hide_banner', '-loglevel', 'error'];

function clipInput(scene: PlannedScene): string[] {
  if (scene.kind === 'image') return ['-loop', '1', '-framerate', String(framesPerSecond), '-t', seconds(scene.lengthMs), '-i', scene.clip];
  return ['-ss', seconds(scene.startMs), '-t', seconds(scene.partMs), '-i', scene.clip];
}

function soundInput(scene: PlannedScene): string[] {
  if (scene.narration !== undefined) return ['-i', scene.narration];
  return ['-f', 'lavfi', '-t', seconds(scene.lengthMs), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'];
}

/** The ASS file of a scene with captions, relative to the work folder. */
export function assName(scene: PlannedScene): string {
  return `scene-${String(scene.number)}.ass`;
}

export function sceneArgs(scene: PlannedScene, size: Size, output: string): string[] {
  const { width, height } = size;
  const fit = `scale=${String(width)}:${String(height)}:force_original_aspect_ratio=decrease,pad=${String(width)}:${String(height)}:(ow-iw)/2:(oh-ih)/2:color=black`;
  const hold = `tpad=stop_mode=clone:stop_duration=${seconds(scene.lengthMs)}`;
  const captions = scene.captions.length === 0 ? '' : `,subtitles=filename=${assName(scene)}:fontsdir=fonts`;
  const graph = `[0:v]${fit},fps=${String(framesPerSecond)},format=yuv420p,${hold}${captions}[v];[1:a]aresample=48000,apad[a]`;
  return [
    ...quiet,
    ...clipInput(scene),
    ...soundInput(scene),
    '-filter_complex', graph,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(framesPerSecond),
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
    '-t', seconds(scene.lengthMs), '-y', output,
  ];
}

/** The concat demuxer's list of the parts, in order. */
export function joinList(parts: readonly string[]): string {
  return parts.map((part) => `file '${part.replace(/'/g, "'\\''")}'\n`).join('');
}

export function joinArgs(list: string, output: string): string[] {
  return [...quiet, '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', '-y', output];
}
