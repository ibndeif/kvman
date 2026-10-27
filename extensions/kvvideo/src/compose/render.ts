import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { lastLines, runProgram, type Program } from '../programs/run-program.ts';
import { kvvideoProblem } from '../problems.ts';
import { assFile, type CaptionStyle } from './ass-file.ts';
import type { CaptionFont } from './caption-font.ts';
import { assName, joinArgs, joinList, sceneArgs, type Size } from './scene-args.ts';
import type { PlannedScene } from './scene-plan.ts';

// The render (plan 16 §16.7, ADR 0107, 23): one ffmpeg run per scene, in the work folder, then one that joins the
// parts without encoding again. Answers the joined file.

export type RenderPlan = { scenes: readonly PlannedScene[]; size: Size; font: CaptionFont | undefined; style: Omit<CaptionStyle, 'family' | 'width' | 'height'>; folder: string; ffmpeg: Program; signal: AbortSignal };

function failed(scene: number | null, reason: string): Error {
  return kvvideoProblem('RENDER_FAILED', `ffmpeg couldn't make ${scene === null ? 'the joined video' : `scene ${String(scene)}`}: ${reason}`, { scene, reason });
}

function writeCaptions(plan: RenderPlan, scene: PlannedScene): void {
  if (scene.captions.length === 0 || plan.font === undefined) return;
  const style = { ...plan.style, ...plan.size, family: plan.font.family };
  writeFileSync(path.join(plan.folder, assName(scene)), assFile(style, scene.captions));
}

export async function render(plan: RenderPlan): Promise<string> {
  mkdirSync(path.join(plan.folder, 'fonts'));
  if (plan.font !== undefined) copyFileSync(plan.font.file, path.join(plan.folder, 'fonts', path.basename(plan.font.file)));
  const parts: string[] = [];
  for (const scene of plan.scenes) {
    writeCaptions(plan, scene);
    const part = `part-${String(scene.number)}.mp4`;
    const run = await runProgram(plan.ffmpeg, sceneArgs(scene, plan.size, part), { cwd: plan.folder, signal: plan.signal });
    if (run.exitCode !== 0) throw failed(scene.number, lastLines(run.output));
    parts.push(part);
  }
  writeFileSync(path.join(plan.folder, 'parts.txt'), joinList(parts));
  const joined = await runProgram(plan.ffmpeg, joinArgs('parts.txt', 'video.mp4'), { cwd: plan.folder, signal: plan.signal });
  if (joined.exitCode !== 0) throw failed(null, lastLines(joined.output));
  return path.join(plan.folder, 'video.mp4');
}
