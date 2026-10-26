import { describe, expect, it } from 'vitest';
import { isNewEnough, versionIn } from '../src/version.ts';

describe("kvman's version (15 §15.3, ADR 0106, 4)", () => {
  it('M4.2-H6 M4.8-H1 a kvman older than the extension is too old, and one as new or newer is new enough', () => {
    expect(isNewEnough('0.3.9', '0.4.7')).toBe(false);
    expect(isNewEnough('0.4.7', '0.4.8')).toBe(false);
    expect(isNewEnough('0.4.8', '0.4.8')).toBe(true);
    expect(isNewEnough('0.10.0', '0.5.0')).toBe(true);
    expect(isNewEnough('1.0.0', '0.4.8')).toBe(true);
  });

  it('M4.2-E2 M4.8-E4 versions compare by number, and a text without a version has none', () => {
    expect(isNewEnough('0.4.10', '0.4.9')).toBe(true);
    expect(isNewEnough('0.4.9', '0.4.10')).toBe(false);
    expect(isNewEnough('0.4.9', '0.5.0')).toBe(false);
    expect(isNewEnough('0.9.9', '1.0.0')).toBe(false);
    expect(versionIn('0.4.6\n')).toBe('0.4.6');
    expect(versionIn('kvman 1.2.3')).toBe('1.2.3');
    expect(versionIn('hello')).toBeUndefined();
  });
});
