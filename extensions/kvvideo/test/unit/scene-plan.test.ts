import { describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { checkScene, planScene } from '../../src/compose/scene-plan.ts';

const video = { clip: '/w/a.mp4', narration: '/w/a.mp3' };
const image = { clip: '/w/a.png', narration: '/w/a.mp3' };
const lengths = (scene: Parameters<typeof planScene>[1], files: { clip: string; narration: string | undefined }, clipMs: number | undefined, narrationMs: number | undefined) =>
  planScene(1, scene, files, { clipMs, narrationMs });

describe("a scene's length (16 §16.7)", () => {
  it('M5.4-H1 durationMs, else the narration, else the video part', () => {
    expect(lengths({ clip: 'a.mp4', narration: 'a.mp3' }, video, 4000, 6000)).toMatchObject({ kind: 'video', startMs: 0, partMs: 4000, lengthMs: 6000 });
    expect(lengths({ clip: 'a.mp4', narration: 'a.mp3' }, video, 9000, 3000)).toMatchObject({ partMs: 9000, lengthMs: 3000 });
    expect(lengths({ clip: 'a.png', narration: 'a.mp3' }, image, undefined, 2500)).toMatchObject({ kind: 'image', partMs: 0, lengthMs: 2500 });
    expect(lengths({ clip: 'a.png', durationMs: 1500 }, { clip: '/w/a.png', narration: undefined }, undefined, undefined)).toMatchObject({ kind: 'image', lengthMs: 1500 });
    expect(lengths({ clip: 'a.mp4', narration: 'a.mp3', durationMs: 2000 }, video, 4000, 6000)).toMatchObject({ lengthMs: 2000 });
    expect(lengths({ clip: 'a.mp4', from: 1000, to: 3500 }, { clip: '/w/a.mp4', narration: undefined }, 9000, undefined)).toMatchObject({ startMs: 1000, partMs: 2500, lengthMs: 2500 });
    expect(lengths({ clip: 'a.mp4', from: 1000, to: 99_000 }, { clip: '/w/a.mp4', narration: undefined }, 9000, undefined)).toMatchObject({ partMs: 8000, lengthMs: 8000 });
  });

  it('M5.4-E1 an image without a length, an image with a part, and a start past the clip fail VALIDATION_FAILED', () => {
    const codeOf = (run: () => unknown): string | undefined => {
      try {
        run();
        return undefined;
      } catch (error) {
        return error instanceof ProblemError ? error.problem.code : String(error);
      }
    };
    expect(codeOf(() => checkScene(2, { clip: 'a.png' }))).toBe('VALIDATION_FAILED');
    expect(codeOf(() => checkScene(2, { clip: 'a.PNG', durationMs: 1000, from: 0 }))).toBe('VALIDATION_FAILED');
    expect(codeOf(() => checkScene(2, { clip: 'a.jpg', narration: 'a.mp3' }))).toBeUndefined();
    expect(codeOf(() => lengths({ clip: 'a.mp4', from: 9000 }, { clip: '/w/a.mp4', narration: undefined }, 9000, undefined))).toBe('VALIDATION_FAILED');
  });
});
