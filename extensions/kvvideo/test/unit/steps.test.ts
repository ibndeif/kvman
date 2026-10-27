import { describe, expect, it } from 'vitest';
import { recordInputSchema } from '../../src/record/steps.ts';

const base = { url: 'http://localhost:5173/', file: 'clip.mp4' };
const accepts = (input: Record<string, unknown>): boolean => recordInputSchema.safeParse({ ...base, ...input }).success;

describe('the steps of a recording (16 §16.5)', () => {
  it('M5.2-E7 limits on steps, waits, scrolls, text, targets, and sizes', () => {
    expect(accepts({ steps: [{ do: 'wait', ms: 60_000 }, { do: 'scroll', pixels: -20_000 }, { do: 'type', target: '#name', text: 'x'.repeat(2000) }], width: 1920, height: 320 })).toBe(true);
    expect(accepts({ steps: Array.from({ length: 201 }, () => ({ do: 'wait', ms: 0 })) })).toBe(false);
    expect(accepts({ steps: [{ do: 'wait', ms: 60_001 }] })).toBe(false);
    expect(accepts({ steps: [{ do: 'scroll', pixels: 20_001 }] })).toBe(false);
    expect(accepts({ steps: [{ do: 'type', target: '#name', text: 'x'.repeat(2001) }] })).toBe(false);
    expect(accepts({ steps: [{ do: 'click', target: '' }] })).toBe(false);
    expect(accepts({ steps: [{ do: 'drag', target: '#a' }] })).toBe(false);
    expect(accepts({ steps: [{ do: 'click', target: '#a', force: true }] })).toBe(false);
    expect(accepts({ width: 318 })).toBe(false);
    expect(accepts({ height: 1922 })).toBe(false);
    expect(accepts({ width: 641 })).toBe(false);
    expect(accepts({ extra: true })).toBe(false);
  });
});
