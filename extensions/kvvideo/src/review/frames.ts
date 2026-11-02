import type { z } from '@kvman/sdk';
import type { videoSidecarSchema } from '../files/sidecar.ts';

// The frames of `review`'s contact sheets (plan 16 §16.10; ADR 0115, 48): from the video's sidecar, the middle of each
// scene, 400 ms after each transition, and the middle of each caption line; without one, every 5 s. A frame within
// 500 ms of an earlier one is dropped; past 96, 96 are kept, evenly spread; 12 to a sheet.

export type VideoSidecar = z.output<typeof videoSidecarSchema>;

const closest = 500;
const most = 96;
export const perSheet = 12;

function wanted(sidecar: VideoSidecar | undefined, durationMs: number): number[] {
  if (sidecar === undefined) return Array.from({ length: Math.max(1, Math.ceil(durationMs / 5000)) }, (_, index) => index * 5000);
  const middles = sidecar.scenes.map((scene) => Math.round((scene.startMs + scene.endMs) / 2));
  const afterTransitions = sidecar.scenes.slice(1).map((scene) => scene.startMs + 400);
  const captions = sidecar.captions.map((caption) => Math.round((caption.startMs + caption.endMs) / 2));
  return [...middles, ...afterTransitions, ...captions];
}

/** The frames' times in ms, in order. */
export function frameTimes(sidecar: VideoSidecar | undefined, durationMs: number): number[] {
  const kept: number[] = [];
  for (const time of wanted(sidecar, durationMs).filter((at) => at >= 0 && at < durationMs).sort((a, b) => a - b)) {
    const last = kept.at(-1);
    if (last === undefined || time - last >= closest) kept.push(time);
  }
  if (kept.length <= most) return kept;
  return Array.from({ length: most }, (_, index) => kept[Math.round((index * (kept.length - 1)) / (most - 1))] ?? 0);
}

/** The frames in sheets of 12. */
export function sheetsOf(times: readonly number[]): number[][] {
  return Array.from({ length: Math.ceil(times.length / perSheet) }, (_, index) => times.slice(index * perSheet, (index + 1) * perSheet));
}
