import { mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { TestKernel } from '../../src/index.ts';
import { processOwner, reloadWait, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const printLines = (prefix: string, count: number) => `for (let line = 1; line <= ${count}; line += 1) console.log('${prefix} ' + line);`;

async function runToEnd(kernel: TestKernel, name: string, args: string[], extra: Record<string, unknown> = {}): Promise<void> {
  await kernel.exec('p.start', { name, args, ...extra });
  await vi.waitFor(async () => expect(await kernel.exec('p.list', {})).toEqual([]), reloadWait);
}

const numbered = (prefix: string, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => `${prefix} ${from + index}`).join('\n');

describe('process output (02 §2.16, ADR 0009, 27)', () => {
  it('M1.6-E32 log gives the last 100 lines or its tail, each start truncates it, and a name that never ran is NOT_FOUND', async () => {
    const kernel = await harness.start([processOwner]);
    await runToEnd(kernel, 'printer', ['-e', printLines('line', 150)]);
    expect(await kernel.exec('p.log', { name: 'printer' })).toBe(numbered('line', 51, 150));
    expect(await kernel.exec('p.log', { name: 'printer', tail: 5 })).toBe(numbered('line', 146, 150));
    await runToEnd(kernel, 'printer', ['-e', printLines('second', 3)]);
    expect(await kernel.exec('p.log', { name: 'printer' })).toBe(numbered('second', 1, 3));
    await expect(kernel.exec('p.log', { name: 'never' })).rejects.toMatchObject({ problem: { code: 'NOT_FOUND' } });
  });

  it('M1.6-E33 a process runs in the workspace folder, or under it, with its env over kvman\'s', async () => {
    const kernel = await harness.start([processOwner]);
    const report = "console.log(process.cwd()); console.log(process.env.KVMAN_TEST_VALUE ?? 'unset'); console.log(process.env.PATH ? 'has-path' : 'no-path');";
    mkdirSync(path.join(kernel.homeFolder, 'sub'));
    const home = realpathSync(kernel.homeFolder);
    await runToEnd(kernel, 'here', ['-e', report]);
    expect(await kernel.exec('p.log', { name: 'here' })).toBe([home, 'unset', 'has-path'].join('\n'));
    await runToEnd(kernel, 'under', ['-e', report], { cwd: 'sub', env: { KVMAN_TEST_VALUE: 'given' } });
    expect(await kernel.exec('p.log', { name: 'under' })).toBe([path.join(home, 'sub'), 'given', 'has-path'].join('\n'));
  });
});
