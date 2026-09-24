import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { exitCodeFor, runPermissionProbe, type ProbeReport } from '../scripts/permission-probe.ts';

const sandboxed = runPermissionProbe({ sandboxed: true });

function outcomeOf(report: ProbeReport, check: string): { outcome: string; code?: string } {
  const found = report.outcomes.find((outcome) => outcome.check === check);
  if (found === undefined) throw new Error(`the probe has no ${check} check`);
  return found;
}

describe('permission probe (plan 03 §3.5, 00 R-Q2)', () => {
  it('M0.5-H2 the probe script runs clean', () => {
    const script = fileURLToPath(new URL('../scripts/permission-probe.ts', import.meta.url));
    const run = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    expect((JSON.parse(run.stdout) as ProbeReport).bypasses).toEqual([]);
  });

  it('M0.5-E1 reading outside the granted paths is denied', () => {
    expect(outcomeOf(sandboxed, 'fs.read')).toEqual({ check: 'fs.read', outcome: 'denied', code: 'ERR_ACCESS_DENIED' });
  });

  it('M0.5-E2 writing a file is denied', () => {
    expect(outcomeOf(sandboxed, 'fs.write')).toMatchObject({ outcome: 'denied', code: 'ERR_ACCESS_DENIED' });
  });

  it('M0.5-E3 starting a child process is denied', () => {
    expect(outcomeOf(sandboxed, 'child-process')).toMatchObject({ outcome: 'denied', code: 'ERR_ACCESS_DENIED' });
  });

  it('M0.5-E4 starting a worker is denied', () => {
    expect(outcomeOf(sandboxed, 'worker')).toMatchObject({ outcome: 'denied', code: 'ERR_ACCESS_DENIED' });
  });

  it('M0.5-E5 loading a native addon is denied', () => {
    expect(outcomeOf(sandboxed, 'addon')).toMatchObject({ outcome: 'denied', code: 'ERR_DLOPEN_DISABLED' });
  });

  it('M0.5-E6 node:sqlite is unavailable through import, require, and getBuiltinModule', () => {
    for (const check of ['sqlite.import', 'sqlite.require', 'sqlite.getBuiltinModule']) {
      expect(outcomeOf(sandboxed, check).outcome, check).toBe('denied');
    }
  });

  it('M0.5-E7 without the sandbox every operation succeeds', () => {
    const control = runPermissionProbe({ sandboxed: false });
    expect(control.outcomes.map((outcome) => outcome.outcome)).toEqual(Array(8).fill('allowed'));
    expect(outcomeOf(control, 'addon').code).toBe('ERR_DLOPEN_FAILED');
  });

  it('M0.5-E8 the report says network permission is not enforceable on Node 24', () => {
    expect(process.versions.node.split('.')[0]).toBe('24');
    expect(sandboxed.networkEnforceable).toBe(false);
  });

  it('M0.5-E9 a weakened sandbox is reported as a bypass', () => {
    const weakened = runPermissionProbe({ sandboxed: true, extraFlags: ['--allow-child-process'] });
    expect(weakened.bypasses).toEqual(['child-process']);
    expect(exitCodeFor(weakened)).toBe(1);
    expect(exitCodeFor(sandboxed)).toBe(0);
  });
});
