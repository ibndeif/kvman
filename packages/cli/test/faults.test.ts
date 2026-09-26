import { fork } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { daemonStartReportSchema, faultPointNames, type DaemonStartReport } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import { daemonTests, kvman, temporaryFolder } from './cli.ts';

// The report the daemon sends the CLI, read directly: the CLI prints only its code, title, and hint.
function startReport(home: string, faults: string): Promise<DaemonStartReport> {
  const script = fileURLToPath(import.meta.resolve('@kvman/kernel/daemon'));
  const child = fork(script, ['--home', home], { execArgv: ['--conditions=@kvman/source'], env: { ...process.env, HOME: temporaryFolder(), KVMAN_FAULTS: faults }, stdio: 'ignore' });
  return new Promise((resolve) => child.once('message', (message) => resolve(daemonStartReportSchema.parse(message))));
}

describe('fault settings at start (plan 14 §14.3, ADR 0100)', daemonTests, () => {
  it('M1.9-E3 an unknown fault point refuses the daemon\'s start with VALIDATION_FAILED', async () => {
    const home = join(temporaryFolder(), 'home');
    const run = await kvman(['start', '--home', home], { env: { KVMAN_FAULTS: 'uow.before-commits' } });
    expect(run.code).toBe(1);
    const [first, hint] = run.stderr.split('\n');
    expect(first).toBe('VALIDATION_FAILED: The request does not match its schema');
    for (const point of faultPointNames) expect(hint).toContain(point);
    expect(existsSync(home)).toBe(false);

    const folder = temporaryFolder();
    const report = await startReport(folder, 'uow.before-commits');
    expect(report).toMatchObject({ ok: false, problem: { code: 'VALIDATION_FAILED', issues: [{ path: 'KVMAN_FAULTS' }] } });
    expect(readdirSync(folder)).toEqual([]);
  });
});
