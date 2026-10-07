#!/usr/bin/env node
import os from 'node:os';
import { kernelVersion } from '@kvman/kernel';
import { ProblemError } from '@kvman/sdk';
import { setTimeout as wait } from 'node:timers/promises';
import { parseArguments, usage } from './arguments.ts';
import { packageFolder } from './bundled.ts';
import { isAlive } from './lock-file.ts';
import { runKvman } from './run-kvman.ts';
import { failureLines } from './terminal.ts';
import { programRunner } from './uninstall/run-program.ts';
import { runUninstall } from './uninstall/run-uninstall.ts';
import { sendStopSignal } from './uninstall/stop-running.ts';

// The `kvman` bin (plan 01 §1.2): 0 after a clean stop or a hand-over, 1 after a failed start (plan 02 §2.14), and 130
// after a second Ctrl+C (ADR 0009, 50). `kvman uninstall` exits 0 when kvman was removed or the person said no, and 1
// when it couldn't go on (ADR 0031).

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
  const terminal = { input: process.stdin, output: process.stdout, isTerminal: process.stdin.isTTY === true && process.stdout.isTTY === true };
  if (args.kind === 'uninstall') {
    return runUninstall(args, {
      variables: process.env,
      userFolder: os.homedir(),
      platform: process.platform,
      terminal,
      errors: process.stderr,
      packageFolder,
      runProgram: programRunner(process.platform, process.stdout),
      isAlive,
      sendStop: sendStopSignal,
      wait: async (milliseconds) => {
        await wait(milliseconds);
      },
    });
  }
  return runKvman(args, {
    variables: process.env,
    startFolder: process.cwd(),
    userFolder: os.homedir(),
    platform: process.platform,
    terminal,
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
