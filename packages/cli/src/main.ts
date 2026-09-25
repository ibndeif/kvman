#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolveHome } from './home-folder.ts';
import { printProblem } from './output.ts';
import { start } from './start.ts';
import { status, stop } from './stop-and-status.ts';

// The kvman command (12 §12.5). M1.8 builds the lifecycle commands; M2.14 adds the rest.

const usage = 'usage: kvman start [--port <n>] [--foreground] | stop | status   [--home <dir>]';

async function run(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...argv], allowPositionals: true, strict: true,
    options: { home: { type: 'string' }, port: { type: 'string' }, foreground: { type: 'boolean' } },
  });
  const home = resolveHome(values.home, process.env);
  const [command, ...rest] = positionals;
  if (rest.length > 0) return refuse(usage);
  if (command === 'start') {
    if (values.port !== undefined && !/^\d{1,5}$/.test(values.port)) return refuse('--port must be a port number');
    return start({ home, port: values.port === undefined ? undefined : Number(values.port), foreground: values.foreground === true });
  }
  if (values.port !== undefined || values.foreground !== undefined) return refuse(usage);
  if (command === 'stop') return stop(home);
  if (command === 'status') return status(home);
  return refuse(usage);
}

function refuse(detail: string): number {
  printProblem({ code: 'VALIDATION_FAILED', title: 'The request does not match its schema', hint: detail });
  return 2;
}

function usageError(error: unknown): string | undefined {
  const code = error instanceof Error && 'code' in error ? String(error.code) : '';
  return code.startsWith('ERR_PARSE_ARGS_') && error instanceof Error ? error.message : undefined;
}

async function main(argv: readonly string[]): Promise<number> {
  try {
    return await run(argv);
  } catch (error) {
    const detail = usageError(error);
    if (detail === undefined) throw error;
    return refuse(detail);
  }
}

process.exitCode = await main(process.argv.slice(2));
