import { describe, expect, it } from 'vitest';
import { activeFaults, inertFaults } from '../../src/index.ts';

describe('fault points (plan 14 §14.3, ADR 0100)', () => {
  it('M1.9-E4 only the named point\'s n-th hit kills, and it kills once', () => {
    const kills: string[] = [];
    const faults = activeFaults({ point: 'uow.before-commit', hit: 3 }, () => kills.push('kill'));
    for (let round = 0; round < 3; round += 1) faults.reach('admit.before-commit');
    faults.reach('uow.before-commit');
    faults.reach('uow.before-commit');
    expect(kills).toEqual([]);
    faults.reach('uow.before-commit');
    expect(kills).toEqual(['kill']);
    faults.reach('uow.before-commit');
    expect(kills).toEqual(['kill']);
    expect(() => inertFaults.reach('uow.before-commit')).not.toThrow();
  });
});
