import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Caption } from '../narration/captions.ts';
import { lastLines, runProgram, type Program } from '../programs/run-program.ts';
import { kvvideoProblem } from '../problems.ts';
import { assFile, type CaptionStyle } from './ass-file.ts';
import type { CaptionFont } from './caption-font.ts';
import { assName, graphName, joinArgs, joinList, sceneArgs, type SceneRender, type Size } from './scene-args.ts';

// The render (plan 16 §16.8, ADR 0107, 23): one ffmpeg run per scene, in the work folder, each from its graph file,
// then one that joins the parts without encoding again. Answers the joined file.

export type RenderPlan = { scenes: readonly SceneRender[]; captions: readonly (readonly Caption[])[]; size: Size; font: CaptionFont | undefined; style: Omit<CaptionStyle, 'family' | 'width' | 'height'>; folder: string; ffmpeg: Program; signal: AbortSignal };

function failed(scene: number | null, reason: string): Error {
  return kvvideoProblem('RENDER_FAILED', `ffmpeg couldn't make ${scene === null ? 'the joined video' : `scene ${String(scene)}`}: ${reason}`, { scene, reason });
}

export async function render(plan: RenderPlan): Promise<string> {
  mkdirSync(path.join(plan.folder, 'fonts'), { recursive: true });
  if (plan.font !== undefined) copyFileSync(plan.font.file, path.join(plan.folder, 'fonts', path.basename(plan.font.file)));
  const parts: string[] = [];
  for (const [index, scene] of plan.scenes.entries()) {
    const captions = plan.captions[index] ?? [];
    if (scene.captioned && plan.font !== undefined) writeFileSync(path.join(plan.folder, assName(scene.scene)), assFile({ ...plan.style, ...plan.size, family: plan.font.family }, captions));
    const part = `part-${String(scene.scene.number)}.mp4`;
    const { args, graph } = sceneArgs(scene, plan.size, part);
    writeFileSync(path.join(plan.folder, graphName(scene.scene)), graph);
    const run = await runProgram(plan.ffmpeg, args, { cwd: plan.folder, signal: plan.signal });
    if (run.exitCode !== 0) throw failed(scene.scene.number, lastLines(run.output));
    parts.push(part);
  }
  writeFileSync(path.join(plan.folder, 'parts.txt'), joinList(parts));
  const joined = await runProgram(plan.ffmpeg, joinArgs('parts.txt', 'video.mp4'), { cwd: plan.folder, signal: plan.signal });
  if (joined.exitCode !== 0) throw failed(null, lastLines(joined.output));
  return path.join(plan.folder, 'video.mp4');
}
