import type { Brand } from '../brand/brand.ts';
import { readSidecar } from '../files/sidecar.ts';
import { inputPath } from '../files/workspace-paths.ts';
import type { Caption } from '../narration/captions.ts';
import { mediaSize } from '../programs/media-duration.ts';
import type { Program } from '../programs/run-program.ts';
import { invalid, kvvideoProblem } from '../problems.ts';
import { backgroundOf, type Background } from './background.ts';
import type { Scene } from './compose-input.ts';
import { phoneLayout, windowLayout, type Layout, type Size } from './frame-layout.ts';
import { defaultFrame, lookOf, overlayBoxes, type Recording, type SceneLook } from './scene-look.ts';
import { imageExtensions, type PlannedScene } from './scene-plan.ts';

// What each scene shows (plan 16 §16.8): its clip's recording, beside it, and its narration's captions; its look,
// background, and frame's layout. A clip without a recording is measured with ffprobe only when its frame or its
// overlays need its size.

export type ScenePicture = { look: SceneLook; background: Background; layout: Layout | undefined; source: Size | undefined; captions: Caption[] };

const colourPattern = /^#[0-9a-fA-F]{6}$/;

/** A scene's `background`, checked: a colour, or an image file of the workspace. */
export function backgroundInputOf(root: string, number: number, background: string | undefined): { colour: string } | { file: string } | undefined {
  if (background === undefined) return undefined;
  if (background.startsWith('#')) {
    if (!colourPattern.test(background)) throw invalid(`Scene ${String(number)}'s background ${background} isn't #RRGGBB.`, { scene: number, background });
    return { colour: background };
  }
  return { file: inputPath(root, background, imageExtensions) };
}

/** A scene's captions: its own, else its narration's sidecar's. */
export function captionsOf(scene: Scene, narration: string | undefined): Caption[] {
  if (scene.captions !== undefined) return scene.captions;
  if (narration === undefined) return [];
  const sidecar = readSidecar(narration);
  return sidecar?.kind === 'narration' ? sidecar.captions : [];
}

function recordingOf(clip: string): Recording | undefined {
  const sidecar = readSidecar(clip);
  return sidecar?.kind === 'site' || sidecar?.kind === 'page' ? sidecar : undefined;
}

async function sourceSize(ffprobe: Program, scene: PlannedScene, recording: Recording | undefined, signal: AbortSignal): Promise<Size> {
  if (recording !== undefined) return { width: recording.width * recording.scale, height: recording.height * recording.scale };
  const size = await mediaSize(ffprobe, scene.clip, signal);
  if (!size.ok) throw kvvideoProblem('RENDER_FAILED', `ffprobe couldn't read scene ${String(scene.number)}'s size: ${size.reason}`, { scene: scene.number, reason: size.reason });
  return { width: size.width, height: size.height };
}

export type PictureContext = { root: string; picture: Size; brand: Brand | null; captionsAtBottom: boolean; ffprobe: Program; signal: AbortSignal };

export async function pictureOf(context: PictureContext, input: Scene, scene: PlannedScene): Promise<ScenePicture> {
  const recording = scene.kind === 'video' ? recordingOf(scene.clip) : undefined;
  const background = backgroundOf(backgroundInputOf(context.root, scene.number, input.background), context.brand);
  const captions = captionsOf(input, scene.narration);
  const frame = input.frame ?? defaultFrame(recording);
  const measured = frame !== 'none' || overlayBoxes(scene.number, input, recording).length > 0;
  const source = measured ? await sourceSize(context.ffprobe, scene, recording, context.signal) : undefined;
  const look = lookOf(scene.number, input, scene.kind, recording, source, scene.lengthMs);
  const atBottom = context.captionsAtBottom && captions.length > 0;
  const layout = source === undefined || look.frame === 'none' ? undefined : look.frame === 'phone' ? phoneLayout(context.picture, source) : windowLayout(context.picture, source, atBottom);
  return { look, background, layout, source, captions };
}
