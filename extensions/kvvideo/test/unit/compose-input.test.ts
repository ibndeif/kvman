import { describe, expect, it } from 'vitest';
import { composeInputSchema } from '../../src/compose/compose-input.ts';

const scene = { clip: 'a.mp4' };
const accepts = (input: Record<string, unknown>): boolean => composeInputSchema.safeParse({ file: 'v.mp4', scenes: [scene], ...input }).success;
const withScene = (extra: Record<string, unknown>): boolean => accepts({ scenes: [{ ...scene, ...extra }] });

describe("compose's input (16 §16.8)", () => {
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

  it('M5.7-E1 overlays are placed by exactly one of step and box, a callout has text, and each ends after it starts', () => {
    const overlay = (fields: Record<string, unknown>) => withScene({ overlays: [{ kind: 'blur', fromMs: 0, toMs: 100, ...fields }] });
    expect(overlay({ step: 1 })).toBe(true);
    expect(overlay({ box: { x: 0, y: 0, width: 10, height: 10 } })).toBe(true);
    expect(overlay({ step: 1, box: { x: 0, y: 0, width: 10, height: 10 } })).toBe(false);
    expect(overlay({})).toBe(false);
    expect(overlay({ kind: 'callout', step: 1 })).toBe(false);
    expect(overlay({ kind: 'callout', step: 1, text: 'Save' })).toBe(true);
    expect(overlay({ step: 1, toMs: 0 })).toBe(false);
    expect(overlay({ step: 0 })).toBe(false);
    expect(withScene({ overlays: Array.from({ length: 21 }, () => ({ kind: 'blur', step: 1, fromMs: 0, toMs: 1 })) })).toBe(false);
  });

  it('M5.7-H9 caption styles, timed words, frames, cameras, and backgrounds', () => {
    for (const style of ['boxed', 'outline', 'highlight', 'off']) expect(accepts({ captions: { style } })).toBe(true);
    expect(accepts({ captions: { style: 'shadow' } })).toBe(false);
    expect(withScene({ captions: [{ text: 'Hi there', startMs: 0, endMs: 900, words: [{ text: 'Hi', startMs: 0, endMs: 300 }] }] })).toBe(true);
    expect(withScene({ captions: [{ text: 'x', startMs: 0, endMs: 900, words: Array.from({ length: 41 }, () => ({ text: 'x', startMs: 0, endMs: 1 })) }] })).toBe(false);
    expect(withScene({ frame: 'window', camera: 'auto', background: '#112233' })).toBe(true);
    expect(withScene({ frame: 'tablet' })).toBe(false);
    expect(withScene({ camera: 'pan' })).toBe(false);
  });
});
