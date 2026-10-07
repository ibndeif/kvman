import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { npmCalls, useWorlds } from './support.ts';

const world = useWorlds();
const removed = ['root -g', 'uninstall -g kvman'];

describe("kvman uninstall's flags (01 §1.2, ADR 0031, 4)", () => {
  it('QA43-H5 the flags answer the questions', async () => {
    const both = world();
    expect(await both.run({ yes: true, data: 'delete' })).toBe(0);
    expect(both.shown()).toBe('This removes kvman from this computer.\nkvman and its data were removed.\n');
    expect(existsSync(both.home)).toBe(false);

    for (const data of ['keep', 'ask'] as const) {
      const kept = world();
      expect(await kept.run({ yes: true, data }), data).toBe(0);
      expect(kept.shown()).toBe(`This removes kvman from this computer.\nkvman was removed. Your data was kept in ${kept.home}\n`);
      expect(npmCalls(kept)).toEqual(removed);
      expect(existsSync(path.join(kept.home, 'kvman.db'))).toBe(true);
    }

    const first = world({ answers: ['y'] });
    expect(await first.run({ data: 'delete' })).toBe(0);
    expect(first.shown()).toBe('This removes kvman from this computer.\nRemove kvman? [y/N] kvman and its data were removed.\n');
    expect(existsSync(first.home)).toBe(false);
  });

  it('QA43-H8 --home names the home', async () => {
    const one = world({ answers: ['y', 'y'] });
    const other = path.join(one.root, 'other-home');
    expect(await one.run({ home: other })).toBe(0);
    expect(one.shown()).toContain(`Your data is in ${other}\n`);
    expect(existsSync(path.join(one.home, 'kvman.db'))).toBe(true);
  });

  it('QA43-E5 with no terminal, a question no flag answers stops the command', async () => {
    const asked = world({ isTerminal: false, answers: ['y', 'y'] });
    expect(await asked.run()).toBe(1);
    expect(asked.errors()).toBe('There is no terminal to ask in. Answer with --yes.\nNothing was removed.\n');
    expect(asked.programs).toEqual([]);
    expect(existsSync(path.join(asked.home, 'kvman.db'))).toBe(true);

    const yes = world({ isTerminal: false });
    expect(await yes.run({ yes: true })).toBe(0);
    expect(npmCalls(yes)).toEqual(removed);
    expect(existsSync(path.join(yes.home, 'kvman.db'))).toBe(true);
  });
});
