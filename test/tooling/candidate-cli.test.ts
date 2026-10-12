import { spawnSync } from 'node:child_process';
import { closeSync, copyFileSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packageEmissions } from '../../release/candidate/candidate-plan.ts';
import { repositoryRoot } from './repository.ts';

function fixture(mode: 'noisy' | 'failure' | 'signal') {
  const root = mkdtempSync(path.join(tmpdir(), 'kvman-candidate-cli-'));
  const entry = path.join(root, 'release', 'candidate');
  const bin = path.join(root, 'bin');
  mkdirSync(entry, { recursive: true });
  mkdirSync(bin);
  writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  for (const name of ['local-candidate-main.ts', 'run-candidate.ts', 'candidate-plan.ts']) {
    copyFileSync(path.join(repositoryRoot, 'release', 'candidate', name), path.join(entry, name));
  }
  for (const pkg of packageEmissions) {
    const folder = path.join(root, 'packages', pkg.folder);
    mkdirSync(path.join(folder, 'dist'), { recursive: true });
    writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name: pkg.name }, null, 2));
    for (const kind of ['js', 'd.ts']) writeFileSync(path.join(folder, 'dist', `${pkg.entry}.${kind}`), '');
  }
  const trace = path.join(root, 'trace');
  writeFileSync(trace, '');
  const program = path.join(bin, 'pnpm-fixture.cjs');
  writeFileSync(program, `const fs = require('node:fs');
const script = process.argv[3];
fs.appendFileSync(process.env.CANDIDATE_TRACE, script + '\\n');
if (script === 'lint' && process.env.CANDIDATE_MODE === 'failure') process.exit(3);
if (script === 'lint' && process.env.CANDIDATE_MODE === 'signal') process.kill(process.pid, 'SIGTERM');
if (script === 'typecheck' && process.env.CANDIDATE_MODE === 'noisy') fs.writeSync(1, 'x'.repeat(1200000));
`);
  if (process.platform === 'win32') {
    writeFileSync(path.join(bin, 'pnpm.cmd'), `@echo off\r\n"${process.execPath}" "%~dp0pnpm-fixture.cjs" %*\r\n`);
  } else {
    writeFileSync(path.join(bin, 'pnpm'), `#!${process.execPath}\nimport './pnpm-fixture.cjs';\n`, { mode: 0o755 });
  }
  const output = path.join(root, 'output');
  const descriptor = openSync(output, 'w');
  try {
    const result = spawnSync(process.execPath, [path.join(entry, 'local-candidate-main.ts')], {
      cwd: root,
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env['PATH'] ?? ''}`, CANDIDATE_MODE: mode, CANDIDATE_TRACE: trace },
      stdio: ['ignore', descriptor, descriptor],
    });
    return { result, trace: readFileSync(trace, 'utf8').trim().split('\n'), output: readFileSync(output, 'utf8') };
  } finally {
    closeSync(descriptor);
    rmSync(root, { recursive: true, force: true });
  }
}

describe('local candidate real entry in an isolated fixture', () => {
  it('streams noisy output without turning a passing gate into a buffer failure', () => {
    const found = fixture('noisy');
    expect(found.result.error).toBeUndefined();
    expect(found.result.status).toBe(0);
    expect(found.trace).toEqual(['typecheck', 'lint', 'test', 'build', 'bench:check']);
    expect(found.output).toContain(`${process.platform} ${process.arch} emissions passed`);
    expect(found.output).toContain('candidate passed');
    expect(found.output.length).toBeGreaterThan(1200000);
  });

  for (const mode of ['failure', 'signal'] as const) {
    it(`returns nonzero and stops later gates after a script ${mode}`, () => {
      const found = fixture(mode);
      expect(found.result.error).toBeUndefined();
      expect(found.result.status).toBe(1);
      expect(found.trace).toEqual(['typecheck', 'lint']);
      expect(found.output).toContain('lint failed');
      // cmd.exe reports an exit code for its terminated Node child, not POSIX signal metadata.
      if (mode === 'signal' && process.platform === 'win32') expect(found.output).toMatch(/lint exited [1-9][0-9]*/u);
      else expect(found.output).toContain(mode === 'signal' ? 'SIGTERM' : 'exited 3');
      expect(found.output).not.toContain('candidate passed');
    });
  }
});
