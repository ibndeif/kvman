import { describe, expect, it } from 'vitest';
import { installArguments } from '../src/install-task.ts';

describe('installing kvman (15 §15.3, ADR 0099, 19)', () => {
  it("M4.2-H4 the install is npm's global install of kvman", () => {
    expect(installArguments(false)).toEqual(['i', '-g', 'kvman', '--no-fund', '--loglevel=error']);
  });

  it('M4.2-H6 the update installs kvman@latest', () => {
    expect(installArguments(true)).toEqual(['i', '-g', 'kvman@latest', '--no-fund', '--loglevel=error']);
  });
});
