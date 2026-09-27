import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { spawnGated } from '../../src/index.ts';
import { temporaryFolder } from './harness.ts';

function groupOf(pid: number): number {
  return Number(execFileSync('ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8' }).trim());
}

describe('the gated start (plan 03 §3.7, ADR 0139)', () => {
  it('M2.6-E38 the command waits for its release in its own group, and never runs when the release pipe closes', async () => {
    const folder = temporaryFolder('gate');
    const released = join(folder, 'released');
    const abandoned = join(folder, 'abandoned');
    const first = await spawnGated({ command: 'sh', args: ['-c', `touch ${released}`], cwd: folder, env: process.env });
    first.output.resume();
    expect(existsSync(released)).toBe(false);
    expect(groupOf(first.pid)).toBe(first.pid);
    first.release();
    first.stdin.end();
    expect(await first.exited).toEqual({ exitCode: 0, signal: null });
    expect(existsSync(released)).toBe(true);

    const second = await spawnGated({ command: 'sh', args: ['-c', `touch ${abandoned}`], cwd: folder, env: process.env });
    second.output.resume();
    second.abandon();
    second.stdin.end();
    expect(await second.exited).toEqual({ exitCode: 125, signal: null });
    expect(existsSync(abandoned)).toBe(false);
  });
});
