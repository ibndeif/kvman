import { statSync } from 'node:fs';
import type { Ctx } from '@kvman/sdk';
import { answerPath } from '../files/answer-path.ts';
import { placeOutput, workFolder } from '../files/place-output.ts';
import { inputPath, outputPath } from '../files/workspace-paths.ts';
import { mediaDuration } from '../programs/media-duration.ts';
import { programOf } from '../programs/programs.ts';
import type { Program } from '../programs/run-program.ts';
import { kvvideoProblem } from '../problems.ts';
import { captionFont } from './caption-font.ts';
import { composeInputSchema, composeOutputSchema, type Scene } from './compose-input.ts';
import { keepCopy } from './player-copies.ts';
import { render } from './render.ts';
import { audioExtensions, checkScene, imageExtensions, isImage, planScene, videoExtensions, type PlannedScene, type SceneFiles } from './scene-plan.ts';

// `video compose` (plan 16 §16.7): every file is checked before ffmpeg runs; the render runs inside the call (ADR 0107,
// 12); the video is placed at its path and copied for the chat's player.

async function lengthOf(ffprobe: Program, file: string, scene: number, signal: AbortSignal): Promise<number> {
  const duration = await mediaDuration(ffprobe, file, signal);
  if (!duration.ok) throw kvvideoProblem('RENDER_FAILED', `ffprobe couldn't read scene ${String(scene)}'s ${file}: ${duration.reason}`, { scene, reason: duration.reason });
  return duration.ms;
}

async function planAll(scenes: readonly Scene[], files: readonly SceneFiles[], ffprobe: Program, signal: AbortSignal): Promise<PlannedScene[]> {
  const planned: PlannedScene[] = [];
  for (const [index, scene] of scenes.entries()) {
    const file = files[index] ?? { clip: '', narration: undefined };
    const clipMs = isImage(file.clip) ? undefined : await lengthOf(ffprobe, file.clip, index + 1, signal);
    const narrationMs = file.narration === undefined ? undefined : await lengthOf(ffprobe, file.narration, index + 1, signal);
    planned.push(planScene(index + 1, scene, file, { clipMs, narrationMs }));
  }
  return planned;
}

export function registerCompose(ctx: Ctx): void {
  ctx.registerCommand('kvvideo.video.compose', {
    description: 'Joins scenes of recorded clips or images, with their narrations and burned-in captions, into an MP4 file in the workspace.',
    input: composeInputSchema,
    output: composeOutputSchema,
    public: true,
    retries: 0,
    timeoutMs: 1_800_000,
    handle: async (input) => {
      const root = ctx.job.workspace.path;
      const output = outputPath(root, input.file, '.mp4', input.replace === true);
      const files = input.scenes.map((scene) => ({ clip: inputPath(root, scene.clip, [...videoExtensions, ...imageExtensions]), narration: scene.narration === undefined ? undefined : inputPath(root, scene.narration, audioExtensions) }));
      for (const [index, scene] of input.scenes.entries()) checkScene(index + 1, scene);
      const texts = input.scenes.flatMap((scene) => (scene.captions ?? []).map((caption) => caption.text));
      const font = texts.length === 0 ? undefined : captionFont(root, input.captions?.font, texts);
      const [ffmpeg, ffprobe] = [await programOf(ctx, 'ffmpeg'), await programOf(ctx, 'ffprobe')];
      const work = workFolder();
      try {
        const scenes = await planAll(input.scenes, files, ffprobe, ctx.job.signal);
        const size = { width: input.width ?? 1280, height: input.height ?? 720 };
        const style = { size: input.captions?.size, position: input.captions?.position ?? 'bottom' };
        const made = await render({ scenes, size, font, style, folder: work.folder, ffmpeg, signal: ctx.job.signal });
        placeOutput(made, output);
        const shown = answerPath(root, output);
        const bytes = statSync(output).size;
        return { file: shown, durationMs: scenes.reduce((sum, scene) => sum + scene.lengthMs, 0), bytes, fileId: await keepCopy(ctx, output, shown, bytes) };
      } finally {
        work.remove();
      }
    },
  });
}
