import { statSync } from 'node:fs';
import type { Browser } from 'playwright-core';
import type { Ctx } from '@kvman/sdk';
import { launchDrawing } from '../browser/launch.ts';
import { startBrowser } from '../browser/start-browser.ts';
import { answerPath } from '../files/answer-path.ts';
import { placeOutput, workFolder } from '../files/place-output.ts';
import { inputPath, outputPath } from '../files/workspace-paths.ts';
import { mediaDuration } from '../programs/media-duration.ts';
import { programOf } from '../programs/programs.ts';
import type { Program } from '../programs/run-program.ts';
import { kvvideoProblem } from '../problems.ts';
import { captionFont } from './caption-font.ts';
import { defaultAccent, drawScene, needsDrawing } from './compose-drawing.ts';
import { composeInputSchema, composeOutputSchema, type Scene } from './compose-input.ts';
import { backgroundInputOf, pictureOf, type ScenePicture } from './compose-plan.ts';
import { painterOf } from './drawn-images.ts';
import { keepCopy } from './player-copies.ts';
import { render } from './render.ts';
import type { SceneDrawn, SceneRender } from './scene-args.ts';
import { audioExtensions, checkScene, imageExtensions, isImage, planScene, videoExtensions, type PlannedScene, type SceneFiles } from './scene-plan.ts';

// `video compose` (plan 16 §16.8): every file is checked before ffmpeg runs; each scene's picture is planned from its
// clip's and narration's sidecars and the brand, its frame and overlays drawn by the browser when it has any; the render
// runs inside the call (ADR 0107, 12); the video is placed at its path and copied for the chat's player.

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

const noDrawing = (picture: ScenePicture): SceneDrawn => ({ layout: undefined, chrome: undefined, mask: undefined, overlayImages: picture.look.overlays.map(() => undefined) });

export function registerCompose(ctx: Ctx): void {
  ctx.registerCommand('kvvideo.video.compose', {
    description: 'Composes scenes of recorded clips, pages, or images, framed, with camera moves, overlays, narrations, and burned-in captions, into an MP4 file in the workspace.',
    input: composeInputSchema,
    output: composeOutputSchema,
    public: true,
    retries: 0,
    timeoutMs: 1_800_000,
    handle: async (input) => {
      const root = ctx.job.workspace.path;
      const output = outputPath(root, input.file, '.mp4', input.replace === true);
      const files = input.scenes.map((scene) => ({ clip: inputPath(root, scene.clip, [...videoExtensions, ...imageExtensions]), narration: scene.narration === undefined ? undefined : inputPath(root, scene.narration, audioExtensions) }));
      for (const [index, scene] of input.scenes.entries()) {
        checkScene(index + 1, scene);
        backgroundInputOf(root, index + 1, scene.background);
      }
      const brand = await ctx.settings.get('kvvideo.brand');
      const style = input.captions?.style ?? 'boxed';
      const size = { width: input.width ?? 1920, height: input.height ?? 1080 };
      const [ffmpeg, ffprobe] = [await programOf(ctx, 'ffmpeg'), await programOf(ctx, 'ffprobe')];
      const work = workFolder();
      let browser: Browser | undefined;
      try {
        const scenes = await planAll(input.scenes, files, ffprobe, ctx.job.signal);
        const position = input.captions?.position ?? 'bottom';
        const context = { root, picture: size, brand, captionsAtBottom: style !== 'off' && position === 'bottom', ffprobe, signal: ctx.job.signal };
        const pictures: ScenePicture[] = [];
        for (const [index, scene] of scenes.entries()) pictures.push(await pictureOf(context, input.scenes[index] ?? { clip: '' }, scene));
        const captions = pictures.map((picture) => (style === 'off' ? [] : picture.captions));
        const texts = captions.flat().map((caption) => caption.text);
        const font = texts.length === 0 ? undefined : captionFont(root, input.captions?.font ?? brand?.font ?? undefined, texts);
        if (pictures.some(needsDrawing)) browser = await startBrowser(await ctx.settings.get('kvvideo.browser'), launchDrawing);
        const painter = browser === undefined ? undefined : painterOf(browser);
        const renders: SceneRender[] = [];
        for (const [index, scene] of scenes.entries()) {
          const picture = pictures[index];
          if (picture === undefined) continue;
          const drawn = painter === undefined || !needsDrawing(picture) ? noDrawing(picture) : await drawScene({ root, folder: work.folder, picture: size, brand, painter }, scene.number, picture);
          renders.push({ scene, look: picture.look, background: picture.background, drawn, captioned: (captions[index] ?? []).length > 0 });
        }
        const look = style === 'off' ? 'boxed' : style;
        const made = await render({ scenes: renders, captions, size, font, style: { size: input.captions?.size, position, look, highlight: brand?.colors.primary ?? defaultAccent }, folder: work.folder, ffmpeg, signal: ctx.job.signal });
        placeOutput(made, output);
        const shown = answerPath(root, output);
        const bytes = statSync(output).size;
        return { file: shown, durationMs: scenes.reduce((sum, scene) => sum + scene.lengthMs, 0), bytes, fileId: await keepCopy(ctx, output, shown, bytes) };
      } finally {
        await browser?.close();
        work.remove();
      }
    },
  });
}
