// `node release/candidate/local-candidate-main.ts` runs the explicit local candidate
// pipeline from the repository on Node 24 (KVC34, ADR 0047): `pnpm run typecheck`,
// `lint`, `test`, `build`, then the four original package emissions, then
// `bench:check`. Each runs once, serially; the first failure stops the candidate with a
// nonzero exit. Environment is inherited so isolated-index guards stay in effect.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCandidate, type EmissionReader, type ScriptRunner } from './run-candidate.ts';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

const runScript: ScriptRunner = (script) => {
  // Windows pnpm is a command shim; only fixed repository script names reach this shell.
  const finished = spawnSync('pnpm', ['run', script], { cwd: repositoryRoot, stdio: 'inherit', shell: process.platform === 'win32' });
  const output = '';
  if (finished.error !== undefined) {
    return { status: finished.status, signal: finished.signal, output, error: finished.error };
  }
  return { status: finished.status, signal: finished.signal, output };
};

const reader: EmissionReader = {
  readPackageJson: (folder) => readFileSync(path.join(repositoryRoot, 'packages', folder, 'package.json'), 'utf8'),
  emissionExists: (folder, entry, kind) => existsSync(path.join(repositoryRoot, 'packages', folder, `dist/${entry}.${kind}`)),
};

const host = `${process.platform} ${process.arch}`;
const report = runCandidate({ host, runScript, reader });
for (const gate of report.gates) {
  console.log(`${host} ${gate.gate} ${gate.ok ? 'passed' : 'failed'}: ${gate.detail}`);
}
if (!report.ok) {
  const failed = report.gates.at(-1)?.gate ?? 'unknown';
  console.error(`candidate failed on ${host} at ${failed}; only this local pipeline on this host is assessed.`);
  process.exitCode = 1;
} else {
  console.log(`candidate passed on ${host}: typecheck, lint, test, build, emissions, bench:check.`);
}
