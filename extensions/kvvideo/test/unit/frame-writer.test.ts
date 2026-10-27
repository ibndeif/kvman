import { describe, expect, it } from 'vitest';
import { frameWriter } from '../../src/record/frame-writer.ts';

describe('a steady frame rate (16 §16.5, ADR 0107, 25)', () => {
  it('M5.2-H6 each frame fills the slots until the next, and the last until the end', async () => {
    const written: string[] = [];
    const writer = frameWriter(async (frame) => void written.push(frame.toString()), 10_000);
    await writer.frame(Buffer.from('a'), 10_000);
    await writer.frame(Buffer.from('b'), 10_100);
    await writer.frame(Buffer.from('c'), 10_450);
    expect(await writer.finish(11_000)).toBe(30);
    expect(written.join('')).toBe(`${'a'.repeat(3)}${'b'.repeat(11)}${'c'.repeat(16)}`);
  });

  it('M5.2-H6 a recording with one frame writes it at least once', async () => {
    const written: string[] = [];
    const writer = frameWriter(async (frame) => void written.push(frame.toString()), 0);
    await writer.frame(Buffer.from('a'), 0);
    expect(await writer.finish(0)).toBe(1);
    expect(written).toEqual(['a']);
  });
});
