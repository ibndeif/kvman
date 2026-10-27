import { describe, expect, it } from 'vitest';
import { copied } from '../../src/compose/player-copies.ts';

describe("the player's copy (16 §16.7, ADR 0107, 13)", () => {
  it('M5.4-E8 a video of at most 512 MiB is copied, a larger one is not', () => {
    expect(copied(512 * 1024 * 1024)).toBe(true);
    expect(copied(512 * 1024 * 1024 + 1)).toBe(false);
  });
});
