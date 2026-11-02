import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Caption } from '../narration/captions.ts';
import { lastLines, runProgram, type Program } from '../programs/run-program.ts';
import { kvvideoProblem } from '../problems.ts';
import { assFile, type CaptionStyle } from './ass-file.ts';
import type { CaptionFont } from './caption-font.ts';
import { finalArgs, finalGraph, measureArgs, measuredLoudness, posterArgs, type FinalPlan } from './final-pass.ts';
import { assName, graphName, sceneArgs, type SceneRender, type Size } from './scene-args.ts';

// The render of one size (plan 16 §16.8; ADR 0107, 23; ADR 0115, 2 and 37): one ffmpeg run per scene, in the work
// folder, each from its graph file, into a near-lossless part; then the final pass measures the loudness, encodes the
// video once, and its poster is taken from the middle of the first scene.

export type RenderPlan = {
  scenes: readonly SceneRender[];
  captions: readonly (readonly Caption[])[];
  size: Size;
  font: CaptionFont | undefined;
  style: Omit<CaptionStyle, 'family' | 'width' | 'height'>;
  final: Omit<FinalPlan, 'parts'>;
  folder: string;
  ffmpeg: Program;
  signal: AbortSignal;
  sceneStarted(): void;
  finalAt(percent: number): void;
};

function failed(scene: number | null, reason: string): Error {
  return kvvideoProblem('RENDER_FAILED', `ffmpeg couldn't make ${scene === null ? 'the final video' : `scene ${String(scene)}`}: ${reason}`, { scene, reason });
}

async function parts(plan: RenderPlan): Promise<string[]> {
  const made: string[] = [];
  for (const [index, scene] of plan.scenes.entries()) {
    plan.sceneStarted();
    const captions = plan.captions[index] ?? [];
    if (scene.captioned && plan.font !== undefined) writeFileSync(path.join(plan.folder, assName(scene.scene)), assFile({ ...plan.style, ...plan.size, family: plan.font.family }, captions));
    const part = `part-${String(scene.scene.number)}.mkv`;
    const { args, graph } = sceneArgs(scene, plan.size, part);
    writeFileSync(path.join(plan.folder, graphName(scene.scene)), graph);
    const run = await runProgram(plan.ffmpeg, args, { cwd: plan.folder, signal: plan.signal });
    if (run.exitCode !== 0) throw failed(scene.scene.number, lastLines(run.output));
    made.push(part);
  }
  return made;
}

// Reports the encode's progress in tenths, from ffmpeg's `out_time_us` lines.
function progressOf(plan: RenderPlan): (text: string) => void {
  let reported = 0;
  return (text) => {
    for (const match of text.matchAll(/out_time_us=(\d+)/g)) {
      const percent = Math.min(100, Math.floor(Number(match[1]) / 1000 / Math.max(1, plan.final.durationMs) * 10) * 10);
      if (percent <= reported) continue;
      reported = percent;
      plan.finalAt(percent);
    }
  };
}

/** Renders the size; answers the video and its poster, in the work folder. */
export async function render(plan: RenderPlan): Promise<{ video: string; poster: string }> {
  mkdirSync(path.join(plan.folder, 'fonts'), { recursive: true });
  if (plan.font !== undefined) copyFileSync(plan.font.file, path.join(plan.folder, 'fonts', path.basename(plan.font.file)));
  const final: FinalPlan = { ...plan.final, parts: await parts(plan) };
  writeFileSync(path.join(plan.folder, 'measure.graph'), finalGraph(final, undefined));
  plan.finalAt(0);
  const measure = await runProgram(plan.ffmpeg, measureArgs(final, 'measure.graph'), { cwd: plan.folder, signal: plan.signal });
  if (measure.exitCode !== 0) throw failed(null, lastLines(measure.output));
  writeFileSync(path.join(plan.folder, 'final.graph'), finalGraph(final, measuredLoudness(measure.output)));
  const encoded = await runProgram(plan.ffmpeg, finalArgs(final, 'final.graph', 'video.mp4'), { cwd: plan.folder, signal: plan.signal, onStdout: progressOf(plan) });
  if (encoded.exitCode !== 0) throw failed(null, lastLines(encoded.output));
  const poster = await runProgram(plan.ffmpeg, posterArgs('video.mp4', Math.round((plan.scenes[0]?.scene.lengthMs ?? 0) / 2), 'poster.jpg'), { cwd: plan.folder, signal: plan.signal });
  if (poster.exitCode !== 0) throw failed(null, lastLines(poster.output));
  return { video: path.join(plan.folder, 'video.mp4'), poster: path.join(plan.folder, 'poster.jpg') };
}
