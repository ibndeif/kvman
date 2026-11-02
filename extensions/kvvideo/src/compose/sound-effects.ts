import { fileURLToPath } from 'node:url';
import type { Action } from '../record/steps.ts';
import type { Transition } from './transitions.ts';

// The sound effects (plan 16 §16.8; ADR 0115, 14 and 62): a click at each click's `actMs`, key taps from each type's
// `actMs` plus 120 ms to its `endMs`, a whoosh at each slide, and a pop as each callout appears, all on the video's
// time line. A scene with `sounds: false` has none of its own, and the video's `sounds: false` has none at all.

export type Sound = 'click' | 'keys' | 'whoosh' | 'pop';

export type SoundEvent = { sound: Sound; atMs: number; untilMs?: number };

/** The folder that holds the bundled sounds, from the source and the build alike. */
export const soundsFolder = fileURLToPath(new URL('../../sounds/', import.meta.url));

/** What a scene gives for its sounds: where it starts in the video, its part of the recording, and its callouts. */
export type SceneSounds = { startMs: number; lengthMs: number; fromMs: number; partMs: number; actions: readonly Action[]; calloutsFromMs: readonly number[]; on: boolean };

function sceneEvents(scene: SceneSounds): SoundEvent[] {
  if (!scene.on) return [];
  const shown = (recordingMs: number): number | undefined => {
    const inScene = recordingMs - scene.fromMs;
    return inScene >= 0 && inScene < Math.min(scene.partMs, scene.lengthMs) ? scene.startMs + inScene : undefined;
  };
  const events: SoundEvent[] = [];
  for (const action of scene.actions) {
    if (action.actMs === undefined) continue;
    const at = shown(action.do === 'type' ? action.actMs + 120 : action.actMs);
    if (at === undefined || (action.do !== 'click' && action.do !== 'type')) continue;
    if (action.do === 'click') events.push({ sound: 'click', atMs: at });
    else events.push({ sound: 'keys', atMs: at, untilMs: scene.startMs + Math.min(action.endMs - scene.fromMs, scene.lengthMs) });
  }
  for (const fromMs of scene.calloutsFromMs) if (fromMs < scene.lengthMs) events.push({ sound: 'pop', atMs: scene.startMs + fromMs });
  return events;
}

/** The video's sound effects, in time order. */
export function soundEvents(scenes: readonly SceneSounds[], transitions: readonly Transition[], on: boolean): SoundEvent[] {
  if (!on) return [];
  const events = scenes.flatMap(sceneEvents);
  transitions.forEach((transition, index) => {
    const next = scenes[index + 1];
    if (transition.kind === 'slide' && transition.ms > 0 && next !== undefined && (scenes[index]?.on ?? false)) events.push({ sound: 'whoosh', atMs: next.startMs });
  });
  return events.filter((event) => event.untilMs === undefined || event.untilMs > event.atMs).sort((a, b) => a.atMs - b.atMs);
}
