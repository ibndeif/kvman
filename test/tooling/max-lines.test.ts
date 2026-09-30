import { describe, expect, it } from 'vitest';
import { lintFixture, messagesOf } from './repository.ts';

describe('the 300-line limit (CLAUDE.md §5, ADR 0009)', () => {
  it('M1.1-H3 a 301-line file fails lint', async () => {
    const errors = messagesOf(await lintFixture('lines-301.ts', 'packages/kernel/src/fixture.ts'), 'max-lines');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/301/);
  });

  it('M1.1-E23 a 300-line file passes', async () => {
    expect(await lintFixture('lines-300.ts', 'packages/kernel/src/fixture.ts')).toEqual([]);
  });

  it('M1.1-E24 test files are capped too', async () => {
    expect(messagesOf(await lintFixture('lines-301.ts', 'packages/kernel/test/fixture.test.ts'), 'max-lines')).toHaveLength(1);
  });
});
