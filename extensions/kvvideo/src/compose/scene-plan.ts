import path from 'node:path';
import { invalid } from '../problems.ts';
import type { Caption } from '../narration/captions.ts';
import type { Scene } from './compose-input.ts';

// A scene's length (plan 16 §16.7): its `durationMs`, else its narration's, else its video part's. A video part
// shorter than the scene holds its last frame, and a longer one is cut.

export const videoExtensions = ['.webm', '.mp4', '.mov', '.mkv'];
export const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
export const audioExtensions = ['.mp3', '.wav', '.m4a'];

export type PlannedScene = { number: number; kind: 'video' | 'image'; clip: string; startMs: number; partMs: number; lengthMs: number; narration: string | undefined; captions: Caption[] };

export type SceneFiles = { clip: string; narration: string | undefined };

export type SceneDurations = { clipMs: number | undefined; narrationMs: number | undefined };

export function isImage(file: string): boolean {
  return imageExtensions.includes(path.extname(file).toLowerCase());
}

/** Checks what a scene needs before any file is read: an image has no part and has a length. */
export function checkScene(number: number, scene: Scene): void {
  if (!isImage(scene.clip)) return;
  if (scene.from !== undefined || scene.to !== undefined) throw invalid(`Scene ${String(number)} is an image, which has no from or to.`, { scene: number });
  if (scene.durationMs === undefined && scene.narration === undefined) throw invalid(`Scene ${String(number)} is an image without a narration or durationMs, so it has no length.`, { scene: number });
}

export function planScene(number: number, scene: Scene, files: SceneFiles, durations: SceneDurations): PlannedScene {
  checkScene(number, scene);
  const base = { number, clip: files.clip, narration: files.narration, captions: scene.captions ?? [] };
  if (isImage(files.clip)) return { ...base, kind: 'image', startMs: 0, partMs: 0, lengthMs: scene.durationMs ?? durations.narrationMs ?? 0 };
  const clipMs = durations.clipMs ?? 0;
  const startMs = scene.from ?? 0;
  if (startMs >= clipMs) throw invalid(`Scene ${String(number)} starts at ${String(startMs)} ms, past its clip's end.`, { scene: number });
  const partMs = Math.min(scene.to ?? clipMs, clipMs) - startMs;
  return { ...base, kind: 'video', startMs, partMs, lengthMs: scene.durationMs ?? durations.narrationMs ?? partMs };
}
