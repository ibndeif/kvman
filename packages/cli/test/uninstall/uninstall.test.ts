import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { npmCalls, useWorlds } from './support.ts';

const world = useWorlds();

describe('kvman uninstall (01 §1.2, ADR 0031)', () => {
  it('QA43-H2 yes, then no: the program goes and the data stays', async () => {
    const one = world({ answers: ['y', 'n'] });
    expect(await one.run()).toBe(0);
    expect(one.shown()).toBe(
      `This removes kvman from this computer.\nRemove kvman? [y/N] \nYour data is in ${one.home}\n(chats, provider keys, presets).\nDelete it too? [y/N] kvman was removed. Your data was kept in ${one.home}\n`,
    );
    expect(npmCalls(one)).toEqual(['root -g', 'uninstall -g kvman']);
    expect(readFileSync(path.join(one.home, 'kvman.db'), 'utf8')).toBe('data');
    expect(existsSync(path.join(one.home, 'presets', 'mine.json'))).toBe(true);
    expect(one.errors()).toBe('');
  });

  it('QA43-H3 yes, then yes: the data goes too', async () => {
    const one = world({ answers: ['y', 'Y'] });
    expect(await one.run()).toBe(0);
    expect(npmCalls(one)).toEqual(['root -g', 'uninstall -g kvman']);
    expect(existsSync(one.home)).toBe(false);
    expect(one.shown().endsWith('Delete it too? [y/N] kvman and its data were removed.\n')).toBe(true);
  });

  it('QA43-H4 npm runs before the data is deleted', async () => {
    const one = world({ answers: ['y', 'y'] });
    await one.run();
    expect(one.programs.map((call) => [call.args.join(' '), call.output, call.homeExisted])).toEqual([
      ['root -g', 'captured', true],
      ['uninstall -g kvman', 'shown', true],
    ]);
    expect(existsSync(one.home)).toBe(false);
  });

  it('QA43-E1 no to the first question removes nothing', async () => {
    for (const answers of [['n'], [''], ['yes'], 'end'] as const) {
      const one = world({ answers, running: 100 });
      expect(await one.run(), JSON.stringify(answers)).toBe(0);
      expect(one.shown()).toBe('This removes kvman from this computer.\nkvman is running and will be stopped.\nRemove kvman? [y/N] Nothing was removed.\n');
      expect(one.programs).toEqual([]);
      expect(one.signals).toEqual([]);
      expect(existsSync(path.join(one.home, 'kvman.db'))).toBe(true);
    }
  });

  it('QA43-E2 only y deletes the data', async () => {
    for (const second of [['y', 'yes'], ['y', ''], ['y']] as const) {
      const one = world({ answers: second });
      const running = one.run();
      if (second.length === 1) setImmediate(() => one.endInput());
      expect(await running, JSON.stringify(second)).toBe(0);
      expect(npmCalls(one)).toEqual(['root -g', 'uninstall -g kvman']);
      expect(existsSync(path.join(one.home, 'kvman.db'))).toBe(true);
      expect(one.shown().endsWith(`kvman was removed. Your data was kept in ${one.home}\n`)).toBe(true);
    }
  });

  it('QA43-E11 npm fails: the data is kept even when its deletion was agreed', async () => {
    const one = world({ answers: ['y', 'y'], uninstallCode: 1 });
    expect(await one.run()).toBe(1);
    expect(one.errors()).toBe('npm could not remove kvman, and your data was left alone. Run this yourself:\n  npm uninstall -g kvman\n');
    expect(existsSync(path.join(one.home, 'kvman.db'))).toBe(true);
    expect(one.shown()).not.toContain('was removed');
  });

  it("QA43-E12 a home folder that isn't there is not an error", async () => {
    const one = world({ answers: ['y', 'y'], home: 'missing' });
    expect(await one.run()).toBe(0);
    expect(one.shown().endsWith('kvman and its data were removed.\n')).toBe(true);
    expect(one.errors()).toBe('');
  });

  it('QA43-E13 only the home is deleted', async () => {
    const one = world({ answers: ['y', 'y'] });
    expect(await one.run()).toBe(0);
    expect(existsSync(one.home)).toBe(false);
    expect(readFileSync(path.join(one.outside.workspace, 'notes.txt'), 'utf8')).toBe('mine');
    expect(readFileSync(one.outside.preset, 'utf8')).toBe('{}');
  });
});
