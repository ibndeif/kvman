import { describe, expect, it } from 'vitest';
import { composeInputSchema } from '../../src/compose/compose-input.ts';

const scene = { clip: 'a.mp4' };
const accepts = (input: Record<string, unknown>): boolean => composeInputSchema.safeParse({ file: 'v.mp4', scenes: [scene], ...input }).success;
const withScene = (extra: Record<string, unknown>): boolean => accepts({ scenes: [{ ...scene, ...extra }] });

describe("compose's input (16 §16.7)", () => {
  it('M5.4-E2 the limits of scenes, sizes, captions, lengths, and style', () => {
    expect(accepts({ width: 1920, height: 320, captions: { font: 'Lato', size: 200, position: 'top' } })).toBe(true);
    expect(withScene({ from: 0, to: 1, durationMs: 600_000, captions: [{ text: 'x'.repeat(200), startMs: 0, endMs: 1 }] })).toBe(true);
    expect(accepts({ scenes: [] })).toBe(false);
    expect(accepts({ scenes: Array.from({ length: 101 }, () => scene) })).toBe(false);
    expect(accepts({ width: 641 })).toBe(false);
    expect(accepts({ width: 318 })).toBe(false);
    expect(accepts({ height: 1922 })).toBe(false);
    expect(withScene({ captions: Array.from({ length: 201 }, () => ({ text: 'x', startMs: 0, endMs: 1 })) })).toBe(false);
    expect(withScene({ captions: [{ text: 'x'.repeat(201), startMs: 0, endMs: 1 }] })).toBe(false);
    expect(withScene({ captions: [{ text: 'x', startMs: 5, endMs: 5 }] })).toBe(false);
    expect(withScene({ durationMs: 99 })).toBe(false);
    expect(withScene({ durationMs: 600_001 })).toBe(false);
    expect(withScene({ from: 10, to: 10 })).toBe(false);
    expect(accepts({ captions: { size: 11 } })).toBe(false);
    expect(accepts({ captions: { size: 201 } })).toBe(false);
    expect(accepts({ captions: { position: 'middle' } })).toBe(false);
    expect(accepts({ extra: 1 })).toBe(false);
    expect(withScene({ extra: 1 })).toBe(false);
  });
});
