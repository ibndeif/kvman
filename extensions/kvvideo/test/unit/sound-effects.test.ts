import { describe, expect, it } from 'vitest';
import { soundEvents, type SceneSounds } from '../../src/compose/sound-effects.ts';

const recorded: SceneSounds = {
  startMs: 2500,
  lengthMs: 5000,
  fromMs: 1000,
  partMs: 5000,
  actions: [
    { do: 'click', atMs: 1200, actMs: 1800, endMs: 1850 },
    { do: 'type', atMs: 1900, actMs: 2200, endMs: 3200 },
    { do: 'click', atMs: 100, actMs: 500, endMs: 550 },
    { do: 'hover', atMs: 3300, actMs: 3600, endMs: 3600 },
  ],
  calloutsFromMs: [500],
  on: true,
};
const next: SceneSounds = { startMs: 7100, lengthMs: 2000, fromMs: 0, partMs: 2000, actions: [], calloutsFromMs: [], on: true };
const slide = [{ kind: 'slide' as const, toward: 'start' as const, ms: 400 }];

describe('sound effects (16 §16.8, ADR 0115, 14)', () => {
  it('M5.8-H5 a click, key taps, a pop, and a whoosh at their times on the video', () => {
    expect(soundEvents([recorded, next], slide, true)).toEqual([
      { sound: 'pop', atMs: 3000 },
      { sound: 'click', atMs: 3300 },
      { sound: 'keys', atMs: 3820, untilMs: 4700 },
      { sound: 'whoosh', atMs: 7100 },
    ]);
  });

  it('M5.8-H5 a scene or the video with sounds off has none', () => {
    expect(soundEvents([{ ...recorded, on: false }, next], slide, true)).toEqual([]);
    expect(soundEvents([recorded, next], slide, false)).toEqual([]);
    expect(soundEvents([recorded, next], [{ kind: 'crossfade', toward: 'start', ms: 400 }], true).some((event) => event.sound === 'whoosh')).toBe(false);
  });
});
