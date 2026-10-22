import { describe, expect, it } from 'vitest';
import { isNewEnough, minimumKvmanVersion, requiredVersion, versionIn } from '../src/version.ts';

describe("kvman's version (15 §15.3, ADR 0099, 17)", () => {
  it('M4.2-H6 a kvman older than the minimum is too old', () => {
    expect(minimumKvmanVersion).toBe('0.4.7');
    expect(isNewEnough('0.3.9', '0.4.7')).toBe(false);
    expect(isNewEnough('0.4.7', '0.4.7')).toBe(true);
    expect(isNewEnough('0.10.0', '0.5.0')).toBe(true);
    expect(isNewEnough('1.0.0', '0.4.8')).toBe(true);
  });

  it('M4.2-E2 a kvman as new as the extension passes, below the minimum too; a text without a version has none', () => {
    expect(requiredVersion('0.4.6')).toBe('0.4.6');
    expect(isNewEnough('0.4.6', '0.4.6')).toBe(true);
    expect(isNewEnough('0.4.6', '0.4.7')).toBe(false);
    expect(requiredVersion('0.9.0')).toBe('0.4.7');
    expect(versionIn('0.4.6\n')).toBe('0.4.6');
    expect(versionIn('kvman 1.2.3')).toBe('1.2.3');
    expect(versionIn('hello')).toBeUndefined();
  });
});
