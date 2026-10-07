import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { npmCalls, useWorlds } from './support.ts';

const world = useWorlds();

describe("kvman uninstall checks that this kvman is npm's global one (ADR 0031, 6)", () => {
  it("QA43-E6 a kvman that npm didn't install globally isn't removed", async () => {
    const one = world({ answers: ['y', 'y'], npm: 'elsewhere', running: 100 });
    expect(await one.run()).toBe(1);
    expect(one.shown()).toContain('Delete it too? [y/N] ');
    expect(one.errors()).toBe("This kvman wasn't installed with `npm i -g kvman`, so npm can't remove it. Remove it the way it was installed.\nNothing was removed.\n");
    expect(npmCalls(one)).toEqual(['root -g']);
    expect(one.signals).toEqual([]);
    expect(existsSync(path.join(one.home, 'kvman.db'))).toBe(true);
  });

  it('QA43-E7 a symlinked global folder still matches', async () => {
    const one = world({ answers: ['y', 'n'], npm: 'linked' });
    expect(await one.run()).toBe(0);
    expect(npmCalls(one)).toEqual(['root -g', 'uninstall -g kvman']);
  });

  it('QA43-E8 with no npm on the PATH nothing is removed', async () => {
    const one = world({ answers: ['y', 'y'], npm: 'missing', running: 100 });
    expect(await one.run()).toBe(1);
    expect(one.errors()).toBe("npm wasn't found, so kvman can't remove itself.\nNothing was removed.\n");
    expect(npmCalls(one)).toEqual(['root -g']);
    expect(one.signals).toEqual([]);
    expect(existsSync(path.join(one.home, 'kvman.db'))).toBe(true);
  });
});
