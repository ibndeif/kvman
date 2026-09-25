import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { prepareHomeFolder, ProblemError } from '../../src/index.ts';
import { bootEmptyKernel, ids, temporaryFolder } from './boot.ts';

function refusal(home: string): string {
  try {
    prepareHomeFolder(home, ids.next());
  } catch (error) {
    if (error instanceof ProblemError) return error.problem.code;
    throw error;
  }
  return 'accepted';
}

function mode(path: string): number {
  return statSync(path).mode & 0o777;
}

describe('the home folder (plan 03 §3.9 step 0, R-Q4, ADR 0089)', () => {
  it('M1.8-E1 a missing home folder is created with mode 0700', async () => {
    const home = join(temporaryFolder(), 'new', 'home');
    const kernel = await bootEmptyKernel(home);
    expect(mode(home)).toBe(0o700);
    expect(readdirSync(home).sort()).toEqual(expect.arrayContaining(['daemon.lock', 'kvman.db', 'logs']));
    expect(mode(join(home, 'daemon.lock'))).toBe(0o600);
    await kernel.shutdown();
  });

  it('M1.8-E2 an empty home folder is initialized', () => {
    const home = temporaryFolder();
    mkdirSync(join(home, 'empty'), { mode: 0o755 });
    expect(refusal(join(home, 'empty'))).toBe('accepted');
    expect(mode(join(home, 'empty'))).toBe(0o700);
  });

  it('M1.8-E3 a folder with only daemon.lock and logs/ is accepted', () => {
    const home = temporaryFolder();
    writeFileSync(join(home, 'daemon.lock'), '{}');
    mkdirSync(join(home, 'logs'));
    expect(refusal(home)).toBe('accepted');
    const other = temporaryFolder();
    writeFileSync(join(other, 'logs'), 'a file');
    expect(refusal(other)).toBe('HOME_INVALID');
  });

  it('M1.8-E4 a folder with kvman.db may hold anything else', () => {
    const home = temporaryFolder();
    writeFileSync(join(home, 'kvman.db'), '');
    writeFileSync(join(home, 'notes.txt'), 'mine');
    expect(refusal(home)).toBe('accepted');
    expect(readdirSync(home).sort()).toEqual(['kvman.db', 'notes.txt']);
  });

  it('M1.8-E5 a home path that is a file is refused HOME_INVALID', () => {
    const file = join(temporaryFolder(), 'home');
    writeFileSync(file, 'not a folder');
    expect(refusal(file)).toBe('HOME_INVALID');
    expect(statSync(file).isFile()).toBe(true);
  });
});
