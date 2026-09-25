import type { Problem } from '@kvman/protocol';

// ADR 0096: human lines on stdout; a problem on stderr as `CODE: title`, then its hint.
export function printLine(text: string): void {
  process.stdout.write(`${text}\n`);
}

export function printProblem(problem: Pick<Problem, 'code' | 'title' | 'hint'>): void {
  process.stderr.write(`${problem.code}: ${problem.title}\n${problem.hint === undefined ? '' : `${problem.hint}\n`}`);
}
