import { describe, it, test } from 'vitest';

describe.only('a focused suite', () => {
  it.skip('a skipped test', () => {});
  test.todo('a placeholder');
});
