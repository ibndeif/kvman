import { statSync } from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright-core';
import type { Ctx } from '@kvman/sdk';
import { launchChannel, launchDrawing } from '../browser/launch.ts';
import { startBrowser } from '../browser/start-browser.ts';
import { answerPath } from '../files/answer-path.ts';
import { placeOutput, workFolder } from '../files/place-output.ts';
import { sidecarOutputPath, writeSidecar } from '../files/sidecar.ts';
import { inputPath, outputPath } from '../files/workspace-paths.ts';
import { mediaDuration } from '../programs/media-duration.ts';
import { programOf } from '../programs/programs.ts';
import type { Program } from '../programs/run-program.ts';
import { invalid, kvvideoProblem } from '../problems.ts';
import { ownPortOf } from '../record/own-port.ts';
import { sceneAssetsOf } from '../record/scene-address.ts';
import { arabicLetter, captionFont } from './caption-font.ts';
import { defaultAccent } from './compose-drawing.ts';
import { composeInputSchema, composeOutputSchema, type Scene } from './compose-input.ts';
import { backgroundInputOf, captionsOf } from './compose-plan.ts';
import { composeSize, type Composition } from './compose-size.ts';
import type { Size } from './frame-layout.ts';
import { keepCopy } from './player-copies.ts';
import { audioExtensions, checkScene, imageExtensions, isImage, planScene, videoExtensions, type PlannedScene, type SceneFiles } from './scene-plan.ts';
import { sceneStarts, transitionsOf } from './transitions.ts';
import { captionChoice } from './ass-file.ts';

// `video compose` (plan 16 §16.8): every file and output is checked before ffmpeg runs; each size is composed in its
// own folder; the render runs inside the call (ADR 0107, 12); the video, its poster and sidecar, and the other
// sizes are placed beside its path, and the video is copied for the chat's player.

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

// The files a size writes, each checked as an output: the video, its poster, and the main one's sidecar (no `.srt`, ADR 0117, 7).
function outputsOf(root: string, file: string, size: Size | undefined, replace: boolean): { video: string; poster: string; sidecar: string | undefined } {
  outputPath(root, file, '.mp4', replace);
  const base = file.slice(0, file.length - path.extname(file).length) + (size === undefined ? '' : `-${String(size.width)}x${String(size.height)}`);
  const video = outputPath(root, `${base}.mp4`, '.mp4', replace);
  return { video, poster: outputPath(root, `${base}.jpg`, '.jpg', replace), sidecar: size === undefined ? sidecarOutputPath(video, replace, file) : undefined };
}

function checkSizes(main: Size, extra: readonly Size[]): void {
  const key = (size: Size): string => `${String(size.width)}x${String(size.height)}`;
  const keys = [main, ...extra].map(key);
  if (new Set(keys).size !== keys.length) throw invalid('Each extra size differs from the main size and from the others.', { sizes: keys });
}

export function registerCompose(ctx: Ctx): void {
  ctx.registerCommand('kvvideo.video.compose', {
    description: 'Composes scenes of recorded clips, pages, or images, framed, with camera moves, overlays, transitions, sound effects, narrations, and burned-in captions, into an MP4 file in the workspace, levelled, with its poster.',
    input: composeInputSchema,
    output: composeOutputSchema,
    public: true,
    retries: 0,
    timeoutMs: 3_600_000,
    handle: async (input) => {
      const root = ctx.job.workspace.path;
      const replace = input.replace === true;
      const size = { width: input.width ?? 1920, height: input.height ?? 1080 };
      const extraSizes = input.extraSizes ?? [];
      checkSizes(size, extraSizes);
      const outputs = [outputsOf(root, input.file, undefined, replace), ...extraSizes.map((extra) => outputsOf(root, input.file, extra, replace))];
      const files = input.scenes.map((scene) => ({ clip: inputPath(root, scene.clip, [...videoExtensions, ...imageExtensions]), narration: scene.narration === undefined ? undefined : inputPath(root, scene.narration, audioExtensions) }));
      for (const [index, scene] of input.scenes.entries()) {
        checkScene(index + 1, scene);
        backgroundInputOf(root, index + 1, scene.background);
      }
      const brand = await ctx.settings.get('kvvideo.brand');
      const { look, box } = captionChoice(input.captions?.style, brand?.colors.primary);
      const texts = look === 'off' ? [] : input.scenes.flatMap((scene, index) => captionsOf(scene, files[index]?.narration).map((caption) => caption.text));
      const font = texts.length === 0 ? undefined : captionFont(root, input.captions?.font ?? brand?.font ?? undefined, texts);
      const programs = { ffmpeg: await programOf(ctx, 'ffmpeg'), ffprobe: await programOf(ctx, 'ffprobe') };
      const planned = await planAll(input.scenes, files, programs.ffprobe, ctx.job.signal);
      const lengths = planned.map((scene) => scene.lengthMs);
      const transitions = transitionsOf(input.scenes, lengths);
      const { starts, durationMs } = sceneStarts(lengths, transitions);
      const opened: Browser[] = [];
      const browserOf = (launch: typeof launchChannel): (() => Promise<Browser>) => {
        let started: Browser | undefined;
        return async () => {
          if (started !== undefined) return started;
          started = await startBrowser(await ctx.settings.get('kvvideo.browser'), launch);
          opened.push(started);
          return started;
        };
      };
      const work = workFolder();
      const sizes = [size, ...extraSizes];
      let scenesDone = 0;
      try {
        const composition: Composition = {
          root,
          scenes: input.scenes,
          planned,
          transitions,
          starts,
          durationMs,
          direction: input.direction ?? (texts.some((text) => arabicLetter.test(text)) ? 'rtl' : 'ltr'),
          sounds: input.sounds !== false,
          brand,
          captions: { look, position: input.captions?.position ?? 'bottom', size: input.captions?.size, highlight: brand?.colors.primary ?? defaultAccent, box, font },
          programs,
          ownPort: ownPortOf(process.env['KVMAN_HOME']),
          assets: sceneAssetsOf(root, brand),
          signal: ctx.job.signal,
          browsers: { drawing: browserOf(launchDrawing), recording: browserOf(launchChannel) },
          progress: {
            scene: () => ctx.job.progress({ key: 'kvvideo.progress.scene', params: { n: (scenesDone += 1), of: planned.length * sizes.length } }),
            final: (percent) => ctx.job.progress({ key: 'kvvideo.progress.final', params: { percent } }),
          },
        };
        const results = [];
        for (const [index, each] of sizes.entries()) results.push(await composeSize(composition, each, path.join(work.folder, `size-${String(index + 1)}`)));
        const main = results[0];
        const mainOutputs = outputs[0];
        if (main === undefined || mainOutputs === undefined) throw invalid('There is no size to compose.');
        const others = [];
        for (const [index, result] of results.entries()) {
          const placed = outputs[index];
          if (placed === undefined) continue;
          placeOutput(result.video, placed.video);
          placeOutput(result.poster, placed.poster);
          if (index > 0) others.push({ file: answerPath(root, placed.video), bytes: statSync(placed.video).size });
        }
        if (mainOutputs.sidecar !== undefined) placeOutput(writeSidecar(work.folder, { kind: 'video', durationMs, ...size, scenes: starts.map((startMs, index) => ({ startMs, endMs: startMs + (lengths[index] ?? 0) })), captions: main.captions }), mainOutputs.sidecar);
        const shown = answerPath(root, mainOutputs.video);
        const bytes = statSync(mainOutputs.video).size;
        const copy = await keepCopy(ctx, mainOutputs.video, shown, bytes, mainOutputs.poster);
        return { file: shown, durationMs, bytes, fileId: copy.fileId, poster: answerPath(root, mainOutputs.poster), posterFileId: copy.posterFileId, others };
      } finally {
        for (const browser of opened) await browser.close();
        work.remove();
      }
    },
  });
}
