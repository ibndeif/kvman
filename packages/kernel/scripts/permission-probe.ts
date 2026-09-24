import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type ProbeOutcome = { check: string; outcome: 'denied' | 'allowed'; code?: string };

export type ProbeReport = { sandboxed: boolean; outcomes: ProbeOutcome[]; bypasses: string[]; networkEnforceable: boolean };

const targetFile = fileURLToPath(new URL('./permission-probe-target.mts', import.meta.url));

export function sandboxFlags(readablePaths: string[]): string[] {
  return ['--permission', ...readablePaths.map((readable) => `--allow-fs-read=${readable}`), '--no-experimental-sqlite'];
}

export function networkPermissionAvailable(): boolean {
  return process.allowedNodeEnvironmentFlags.has('--allow-net');
}

export function runPermissionProbe(options: { sandboxed: boolean; extraFlags?: string[] }): ProbeReport {
  const outsideFolder = mkdtempSync(path.join(tmpdir(), 'kvman-probe-outside-'));
  const writableFolder = mkdtempSync(path.join(tmpdir(), 'kvman-probe-writable-'));
  try {
    const outsideFile = path.join(outsideFolder, 'kvman.db');
    writeFileSync(outsideFile, 'not readable from the sandbox');
    const flags = options.sandboxed ? sandboxFlags([targetFile, writableFolder]) : [];
    const child = spawnSync(process.execPath, [...flags, ...(options.extraFlags ?? []), targetFile, outsideFile, path.join(writableFolder, 'written.txt')], { encoding: 'utf8' });
    if (child.status !== 0) throw new Error(`the probe target failed: ${child.stderr}`);
    const outcomes = JSON.parse(child.stdout) as ProbeOutcome[];
    const bypasses = options.sandboxed ? outcomes.filter((outcome) => outcome.outcome === 'allowed').map((outcome) => outcome.check) : [];
    return { sandboxed: options.sandboxed, outcomes, bypasses, networkEnforceable: networkPermissionAvailable() };
  } finally {
    rmSync(outsideFolder, { recursive: true, force: true });
    rmSync(writableFolder, { recursive: true, force: true });
  }
}

export function exitCodeFor(report: ProbeReport): number {
  return report.bypasses.length === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = runPermissionProbe({ sandboxed: true });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = exitCodeFor(report);
}
