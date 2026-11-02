import { invalid } from '../problems.ts';
import type { Scene } from './compose-input.ts';

// The transitions between scenes (plan 16 §16.8; ADR 0115, 12): a cut, a crossfade (the default, 500 ms, or half the
// shorter scene when that is less), a fade through black, or a slide, whose `start` is left in an `ltr` video and right
// in an `rtl` one. A transition overlaps its two scenes by its length, at most half of each.

export type Transition = { kind: 'cut' | 'crossfade' | 'fade-black' | 'slide'; toward: 'start' | 'end' | 'up' | 'down'; ms: number };

const defaultMs = 500;

/** Each transition, between scene `i` and `i + 1`, from the scenes and their lengths. */
export function transitionsOf(scenes: readonly Scene[], lengths: readonly number[]): Transition[] {
  const last = scenes.at(-1);
  if (last?.transition !== undefined) throw invalid(`Scene ${String(scenes.length)} is the last, so it has no transition.`, { scene: scenes.length });
  return scenes.slice(0, -1).map((scene, index) => {
    const most = Math.floor(Math.min(lengths[index] ?? 0, lengths[index + 1] ?? 0) / 2);
    const kind = scene.transition?.kind ?? 'crossfade';
    const ms = kind === 'cut' ? 0 : (scene.transition?.ms ?? Math.min(defaultMs, most));
    if (ms > most) throw invalid(`Scene ${String(index + 1)}'s transition of ${String(ms)} ms is longer than half of a scene it joins (${String(most)} ms).`, { scene: index + 1, ms, most });
    return { kind, toward: scene.transition?.toward ?? 'start', ms };
  });
}

/** Where each scene starts in the video, and the video's length. */
export function sceneStarts(lengths: readonly number[], transitions: readonly Transition[]): { starts: number[]; durationMs: number } {
  const starts: number[] = [];
  let at = 0;
  lengths.forEach((length, index) => {
    starts.push(at);
    at += length - (transitions[index]?.ms ?? 0);
  });
  return { starts, durationMs: at };
}

/** The transition as ffmpeg's `xfade` names it, or `undefined` for a cut. */
export function xfadeName(transition: Transition, direction: 'ltr' | 'rtl'): string | undefined {
  if (transition.kind === 'cut' || transition.ms === 0) return undefined;
  if (transition.kind === 'crossfade') return 'fade';
  if (transition.kind === 'fade-black') return 'fadeblack';
  const sideways = { start: direction === 'ltr' ? 'left' : 'right', end: direction === 'ltr' ? 'right' : 'left', up: 'up', down: 'down' };
  return `slide${sideways[transition.toward]}`;
}
