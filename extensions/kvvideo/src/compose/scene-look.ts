import type { z } from '@kvman/sdk';
import type { recordingSidecarSchema } from '../files/sidecar.ts';
import { invalid } from '../problems.ts';
import { cameraOfActions, imageZoom, pagePushIn, type CameraPlan } from './camera.ts';
import type { Overlay, Scene } from './compose-input.ts';
import type { Rect, Size } from './frame-layout.ts';
import { insidePage } from './overlays.ts';

// How a scene looks before it is drawn (plan 16 §16.8; ADR 0115, 7, 10, 11, and 58): its frame and camera, by default
// from what its clip is (a recorded website gets a window, or a phone, and the camera; an image gets a slow zoom; a
// recorded page a slow push-in, ADR 0120, 1; any other video is never moved), and its overlays placed on the recording's
// pixels.

export type Recording = z.output<typeof recordingSidecarSchema>;

export type Camera = { plan: CameraPlan; scale: number | 'input'; offsetMs: number };

export type OverlayMark = { kind: Overlay['kind']; box: Rect; text: string | undefined; fromMs: number; toMs: number };

export type SceneLook = { frame: 'window' | 'phone' | 'none'; camera: Camera | undefined; overlays: OverlayMark[]; scale: number };

/** A clip's frame when the scene names none: a window for a recorded website, a phone for one on a phone. */
export function defaultFrame(recording: Recording | undefined): SceneLook['frame'] {
  if (recording?.kind !== 'site') return 'none';
  return recording.device === 'phone' ? 'phone' : 'window';
}

function cameraOf(scene: Scene, kind: 'video' | 'image', recording: Recording | undefined, lengthMs: number): Camera | undefined {
  const wanted = scene.camera ?? (kind === 'image' || recording !== undefined ? 'auto' : 'none');
  if (wanted === 'none') return undefined;
  if (kind === 'image') return { plan: imageZoom(lengthMs), scale: 'input', offsetMs: 0 };
  if (recording === undefined) return undefined;
  if (recording.kind === 'page') return { plan: pagePushIn(recording.width, recording.height, scene.from ?? 0, lengthMs), scale: recording.scale, offsetMs: scene.from ?? 0 };
  return { plan: cameraOfActions(recording.actions, recording.width, recording.height), scale: recording.scale, offsetMs: scene.from ?? 0 };
}

/** Each overlay's box in CSS pixels of the recorded page: its own, or its step's; a step it can't find fails. */
export function overlayBoxes(number: number, scene: Scene, recording: Recording | undefined): Rect[] {
  return (scene.overlays ?? []).map((overlay) => boxOf(number, overlay, recording));
}

function boxOf(number: number, overlay: Overlay, recording: Recording | undefined): Rect {
  if (overlay.box !== undefined) return overlay.box;
  const step = overlay.step ?? 0;
  if (recording === undefined) throw invalid(`Scene ${String(number)}'s overlay names step ${String(step)}, but its clip has no recording beside it; give a box.`, { scene: number, step });
  const box = recording.actions[step - 1]?.box;
  if (box === undefined) throw invalid(`Scene ${String(number)}'s overlay names step ${String(step)}, which has no target's box.`, { scene: number, step });
  return box;
}

/** The look of scene `number`: its clip's recording, if any, and its source size in pixels for the overlays. */
export function lookOf(number: number, scene: Scene, kind: 'video' | 'image', recording: Recording | undefined, source: Size | undefined, lengthMs: number): SceneLook {
  const scale = recording?.scale ?? 1;
  const boxes = overlayBoxes(number, scene, recording);
  const overlays = (scene.overlays ?? []).map((overlay, index) => {
    const box = boxes[index] ?? { x: 0, y: 0, width: 0, height: 0 };
    const scaled = { x: box.x * scale, y: box.y * scale, width: box.width * scale, height: box.height * scale };
    return { kind: overlay.kind, box: source === undefined ? scaled : insidePage(scaled, source), text: overlay.text, fromMs: overlay.fromMs, toMs: overlay.toMs };
  });
  return { frame: scene.frame ?? defaultFrame(recording), camera: cameraOf(scene, kind, recording, lengthMs), overlays, scale };
}
