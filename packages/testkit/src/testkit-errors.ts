import type { Problem } from '@kvman/protocol';

/** A problem reply, thrown by the test kernel's calls; `problem` is what the kernel answered. */
export class TestkitProblem extends Error {
  /** The problem the command or query answered. */
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(`${problem.code}: ${problem.title}${problem.detail === undefined ? '' : ` (${problem.detail})`}`);
    this.name = 'TestkitProblem';
    this.problem = problem;
  }
}

/** A mistake the testkit found in the test or the extension: an unregistered code, a catalog gap, a bad option. */
export class TestkitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TestkitError';
  }
}
