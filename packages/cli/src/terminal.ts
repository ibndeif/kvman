import type { Problem } from '@kvman/sdk';

// A failed start on the terminal (plan 02 §2.14, ADR 0009, 49): the Problem as `CODE: message`, then a hint for its
// code, in English.

const hints: ReadonlyMap<string, string> = new Map([
  ['KVMAN_RUNNING', 'Use the kvman already running on this home, stop it, or start with --home <dir>. If it is still starting, try again once it has started.'],
  ['PORT_IN_USE', 'Stop what uses the port, or start with --port <n> (0 picks a free one).'],
  ['EXTENSION_INVALID', 'Fix the extension or remove it from the preset. New extension versions need a y at the prompt, or --yes.'],
  ['VALIDATION_FAILED', 'Check the flags (kvman --help), the preset, and its settings.'],
]);

const fallbackHint = 'See logs/kvman.log in the kvman home for details.';

export function failureLines(problem: Problem): string {
  return `${problem.code}: ${problem.message}\n${hints.get(problem.code) ?? fallbackHint}\n`;
}
