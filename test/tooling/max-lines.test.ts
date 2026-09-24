import { describe, expect, it } from 'vitest';
import { lintFixture, messagesOf } from './repository.ts';

describe('file size cap (plan 14 §14.1)', () => {
  it('M0.1-H3 a 301-line fixture fails lint', async () => {
    const errors = messagesOf(await lintFixture('lines-301.ts', 'packages/kernel/src/fixture.ts'), 'max-lines');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/301/);
  });

  it('M0.1-E15 a 300-line source file passes', async () => {
    expect(await lintFixture('lines-300.ts', 'packages/kernel/src/fixture.ts')).toEqual([]);
  });

  it('M0.1-E16 test files are excluded from the cap', async () => {
    expect(await lintFixture('lines-301.ts', 'packages/kernel/test/fixture.test.ts')).toEqual([]);
  });
});
