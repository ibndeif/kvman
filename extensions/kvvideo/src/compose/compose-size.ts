import { mkdirSync } from 'node:fs';
import type { Browser } from 'playwright-core';
import type { Brand } from '../brand/brand.ts';
import type { Caption } from '../narration/captions.ts';
import { narrationLeadMs } from '../record/narration-cues.ts';
import type { SceneAssets } from '../record/scene-address.ts';
import type { Program } from '../programs/run-program.ts';
import type { CaptionLook } from './ass-file.ts';
import type { CaptionFont } from './caption-font.ts';
import { drawScene, needsDrawing } from './compose-drawing.ts';
import type { Scene } from './compose-input.ts';
import { pictureOf, recordingOf, type ScenePicture } from './compose-plan.ts';
import { painterOf } from './drawn-images.ts';
import type { Size } from './frame-layout.ts';
import { otherShape, recordPageAgain } from './page-again.ts';
import { render } from './render.ts';
import type { SceneDrawn, SceneRender } from './scene-args.ts';
import type { PlannedScene } from './scene-plan.ts';
import { soundEvents } from './sound-effects.ts';
import type { Transition } from './transitions.ts';

// One size of a composition (plan 16 §16.8): its recorded pages again at its shape when that differs, each scene's
// picture, drawings, and captions, the render, and the captions on the video's time line for its sidecar.

export type Composition = {
  root: string;
  scenes: readonly Scene[];
  planned: readonly PlannedScene[];
  transitions: readonly Transition[];
  starts: readonly number[];
  durationMs: number;
  direction: 'ltr' | 'rtl';
  sounds: boolean;
  brand: Brand | null;
  captions: { look: CaptionLook | 'off'; position: 'bottom' | 'top'; size: number | undefined; highlight: string; font: CaptionFont | undefined };
  programs: { ffmpeg: Program; ffprobe: Program };
  ownPort: number | null;
  assets: SceneAssets;
  signal: AbortSignal;
  browsers: { drawing(): Promise<Browser>; recording(): Promise<Browser> };
  progress: { scene(): void; final(percent: number): void };
};

export type SizeResult = { video: string; poster: string; captions: Caption[] };

const noDrawing = (picture: ScenePicture): SceneDrawn => ({ layout: undefined, chrome: undefined, mask: undefined, overlayImages: picture.look.overlays.map(() => undefined) });

async function scenesFor(composition: Composition, size: Size, folder: string): Promise<PlannedScene[]> {
  const scenes: PlannedScene[] = [];
  for (const scene of composition.planned) {
    const recording = scene.kind === 'video' ? recordingOf(scene.clip) : undefined;
    if (recording?.kind !== 'page' || !otherShape(recording, size)) {
      scenes.push(scene);
      continue;
    }
    const clip = await recordPageAgain({ root: composition.root, folder, number: scene.number, recording, narration: scene.narration, size, browser: composition.browsers.recording, ffmpeg: composition.programs.ffmpeg, ownPort: composition.ownPort, assets: composition.assets, signal: composition.signal });
    scenes.push({ ...scene, clip });
  }
  return scenes;
}

// A scene's captions from its start: a narration's start 300 ms in.
const fromSceneStart = (captions: readonly Caption[], narrated: boolean): Caption[] => captions.map((caption) => (narrated ? { ...caption, startMs: caption.startMs + narrationLeadMs, endMs: caption.endMs + narrationLeadMs, ...(caption.words === undefined ? {} : { words: caption.words.map((word) => ({ ...word, startMs: word.startMs + narrationLeadMs, endMs: word.endMs + narrationLeadMs })) }) } : caption));

export async function composeSize(composition: Composition, size: Size, folder: string): Promise<SizeResult> {
  mkdirSync(folder, { recursive: true });
  const scenes = await scenesFor(composition, size, folder);
  const context = { root: composition.root, picture: size, brand: composition.brand, captionsAtBottom: composition.captions.look !== 'off' && composition.captions.position === 'bottom', ffprobe: composition.programs.ffprobe, signal: composition.signal };
  const pictures: ScenePicture[] = [];
  for (const [index, scene] of scenes.entries()) pictures.push(await pictureOf(context, composition.scenes[index] ?? { clip: '' }, scene));
  const captions = pictures.map((picture, index) => (composition.captions.look === 'off' ? [] : fromSceneStart(picture.captions, scenes[index]?.narration !== undefined)));
  const renders: SceneRender[] = [];
  for (const [index, scene] of scenes.entries()) {
    const picture = pictures[index];
    if (picture === undefined) continue;
    const drawn = needsDrawing(picture) ? await drawScene({ root: composition.root, folder, picture: size, brand: composition.brand, painter: painterOf(await composition.browsers.drawing()) }, scene.number, picture) : noDrawing(picture);
    renders.push({ scene, look: picture.look, background: picture.background, drawn, captioned: (captions[index] ?? []).length > 0 && composition.captions.font !== undefined });
  }
  const events = soundEvents(
    scenes.map((scene, index) => ({
      startMs: composition.starts[index] ?? 0,
      lengthMs: scene.lengthMs,
      fromMs: scene.startMs,
      partMs: scene.kind === 'image' ? scene.lengthMs : scene.partMs,
      actions: pictures[index]?.recording?.actions ?? [],
      calloutsFromMs: (composition.scenes[index]?.overlays ?? []).filter((overlay) => overlay.kind === 'callout').map((overlay) => overlay.fromMs),
      on: composition.scenes[index]?.sounds !== false,
    })),
    composition.transitions,
    composition.sounds,
  );
  const { look, position, highlight } = composition.captions;
  const made = await render({
    scenes: renders,
    captions,
    size,
    font: composition.captions.font,
    style: { size: composition.captions.size, position, look: look === 'off' ? 'boxed' : look, highlight },
    final: { starts: composition.starts, transitions: composition.transitions, direction: composition.direction, events, durationMs: composition.durationMs },
    folder,
    ffmpeg: composition.programs.ffmpeg,
    signal: composition.signal,
    sceneStarted: composition.progress.scene,
    finalAt: composition.progress.final,
  });
  const timeline = captions.flatMap((sceneCaptions, index) => sceneCaptions.map((caption) => ({ text: caption.text, startMs: caption.startMs + (composition.starts[index] ?? 0), endMs: caption.endMs + (composition.starts[index] ?? 0) })));
  return { ...made, captions: timeline };
}
