// Explicit local candidate gates (KVC34, ADR 0047): the repository-wide checks that no
// longer run inside Vitest. Order and criteria match the original gates test and the
// documented pipeline; the runner beside this plan executes them once, serially.

/** Repository scripts the candidate runs with `pnpm run`, each exactly once. */
export type CandidateScript = 'typecheck' | 'lint' | 'test' | 'build' | 'bench:check';

/** Candidate gate order: scripts, then emission verification, then the bench gate. */
export type CandidateGate = CandidateScript | 'emissions';

export const candidateGateOrder: readonly CandidateGate[] = [
  'typecheck',
  'lint',
  'test',
  'build',
  'emissions',
  'bench:check',
];

/** One of the four original packages and the entry its build must emit. */
export type PackageEmission = {
  readonly folder: string;
  readonly name: string;
  readonly entry: string;
};

/** The original four packages: the libraries emit `index`, the CLI bin emits `main`. */
export const packageEmissions: readonly PackageEmission[] = [
  { folder: 'sdk', name: '@kvman/sdk', entry: 'index' },
  { folder: 'kernel', name: '@kvman/kernel', entry: 'index' },
  { folder: 'cli', name: 'kvman', entry: 'main' },
  { folder: 'testkit', name: '@kvman/testkit', entry: 'index' },
];
