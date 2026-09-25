import { describe, expect, it } from 'vitest';
import { faultPointNames, faultSettingOf, faultSettingSchema } from '../src/index.ts';

describe('fault settings (plan 14 §14.3, ADR 0100)', () => {
  it('M1.9-E1 every point of 14 §14.3 is a valid setting, with or without a hit', () => {
    expect(faultPointNames).toHaveLength(24);
    for (const point of faultPointNames) expect(faultSettingOf(point)).toEqual({ point, hit: 1 });
    expect(faultSettingOf('uow.before-commit@3')).toEqual({ point: 'uow.before-commit', hit: 3 });
  });

  it('M1.9-E2 malformed settings are refused', () => {
    for (const setting of ['uow.before-commits', 'claim.after@0', 'claim.after@x', 'claim.after@', 'claim.after,invoke.before', '@2', 'claim-after']) {
      expect(faultSettingSchema.safeParse(setting).success, setting).toBe(false);
    }
  });
});
