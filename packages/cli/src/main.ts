#!/usr/bin/env node
import os from 'node:os';
import { kernelVersion } from '@kvman/kernel';
import { ProblemError } from '@kvman/sdk';
import { parseArguments, usage } from './arguments.ts';
import { runKvman } from './run-kvman.ts';
import { failureLines } from './terminal.ts';

// The `kvman` bin (plan 01 §1.2): 0 after a clean stop or a hand-over, 1 after a failed start (plan 02 §2.14), and 130
// after a second Ctrl+C (ADR 0009, 50).

async function main(argv: readonly string[]): Promise<number> {
  const args = parseArguments(argv);
  if (args.kind === 'help') {
    process.stdout.write(usage);
    return 0;
  }
  if (args.kind === 'version') {
    process.stdout.write(`${kernelVersion()}\n`);
    return 0;
  }
  return runKvman(args, {
    variables: process.env,
    startFolder: process.cwd(),
    userFolder: os.homedir(),
    platform: process.platform,
    terminal: { input: process.stdin, output: process.stdout, isTerminal: process.stdin.isTTY === true && process.stdout.isTTY === true },
    errors: process.stderr,
    exitAtOnce: (code) => process.exit(code),
  });
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(error instanceof ProblemError ? failureLines(error.problem) : `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exitCode = 1;
  },
);
