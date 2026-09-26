import { describe, expect, it } from 'vitest';
import { kernelReadRoots, sandboxArguments, sandboxEnvironment, sandboxStdio } from '../../src/index.ts';

describe('the sandboxed host start (plan 03 §3.5, ADRs 0002, 0129)', () => {
  it('M2.4-E6 a sandboxed host starts with exactly the flags of ADR 0129', () => {
    const roots = kernelReadRoots();
    const args = sandboxArguments('/home/kvman/extensions/snapshots/abc', roots);
    const entry = args.at(-1);
    expect(entry).toMatch(/sandbox-host\.(ts|js)$/);
    const flags = args.filter((argument) => argument.startsWith('--') && !argument.startsWith('--conditions='));
    expect(flags).toEqual([
      '--permission', '--allow-fs-read=/home/kvman/extensions/snapshots/abc', ...roots.map((root) => `--allow-fs-read=${root}`), '--no-experimental-sqlite',
    ]);
    expect(sandboxEnvironment).toEqual({});
    expect(sandboxStdio).toEqual(['ignore', 'ignore', 'ignore', 'pipe']);
  });
});
