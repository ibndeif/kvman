import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { jsonSchema, ProblemError, z, type Ctx, type Json } from '@kvman/sdk';
import { invalid, kvcustomizerProblem, type KvcustomizerCode } from './problems.ts';
import { killTree } from './run-program.ts';

// Finding and running the `@kvman/testkit` bins (ADR 0010, 3): the extension never imports the testkit, it only
// resolves the bins' files from its own node_modules and runs them as child processes with the running Node.

export type BinRun = { exitCode: number; stdout: string; stderr: string };

const packageJsonSchema = z.object({ bin: z.record(z.string(), z.string()) });

/** A bin's `{ code, message, params? }` failure line, for validating a process log line. */
export const binFailureSchema = z.object({ code: z.string(), message: z.string(), params: z.record(z.string(), jsonSchema).optional() });

/** A bin's structured failure: `{ code, message, params? }`. */
export type BinFailure = z.output<typeof binFailureSchema>;

function testkitPackageFile(): string {
  return createRequire(import.meta.url).resolve('@kvman/testkit/package.json');
}

/** The testkit's `docs/` folder, which holds the built-in guides. */
export function testkitDocsFolder(): string {
  return path.join(path.dirname(testkitPackageFile()), 'docs');
}

/** The file of a `@kvman/testkit` bin; a missing entry or file is an installation problem, not a Problem. */
export function binFile(name: string): string {
  const packageFile = testkitPackageFile();
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(packageFile, 'utf8'));
  } catch {
    throw new Error(`The ${name} bin can't be found; reinstall @kvman/testkit.`);
  }
  const parsed = packageJsonSchema.safeParse(raw);
  const entry = parsed.success ? parsed.data.bin[name] : undefined;
  if (entry === undefined) throw new Error(`The ${name} bin is missing from @kvman/testkit; reinstall it.`);
  const file = path.join(path.dirname(packageFile), entry);
  if (!existsSync(file)) throw new Error(`The ${name} bin is missing at ${file}; reinstall @kvman/testkit.`);
  return file;
}

/** Runs a bin with the running Node in `cwd`, `--json` always on; stdout and stderr stay apart for the caller. */
export function runBin(name: string, args: readonly string[], cwd: string, signal: AbortSignal): Promise<BinRun> {
  const file = binFile(name);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...process.execArgv, file, ...args, '--json'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (text: string) => {
      stdout += text;
    });
    child.stderr.setEncoding('utf8').on('data', (text: string) => {
      stderr += text;
    });
    const abort = (): void => killTree(child.pid);
    signal.addEventListener('abort', abort, { once: true });
    child.once('error', (error) => {
      signal.removeEventListener('abort', abort);
      reject(error);
    });
    child.once('close', (code) => {
      signal.removeEventListener('abort', abort);
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

/** The last non-empty line of an output, or `undefined` when there is none. */
export function lastOutputLine(output: string): string | undefined {
  const lines = output.split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line !== undefined && line.trim() !== '') return line;
  }
  return undefined;
}

const kvcustomizerBinCodes: readonly KvcustomizerCode[] = ['FOLDER_NOT_EMPTY', 'FILE_EXISTS', 'NPM_FAILED', 'NO_FREE_PORT', 'PREVIEW_FAILED'];

/** The Problem for a bin's structured failure, or `undefined` when its code has no mapping here. */
export function binFailureProblem(failure: BinFailure): ProblemError | undefined {
  const params: Record<string, Json> = failure.params ?? {};
  if (failure.code === 'VALIDATION_FAILED') return invalid(failure.message, params);
  if (failure.code === 'NOT_FOUND') return new ProblemError({ code: 'NOT_FOUND', message: failure.message, params });
  if (kvcustomizerBinCodes.includes(failure.code as KvcustomizerCode)) return kvcustomizerProblem(failure.code as KvcustomizerCode, failure.message, params);
  return undefined;
}

/**
 * The bin's output: exit 0 gives the last non-empty stdout line against `outputSchema`; exit 1 with the bin's
 * `{ code, message, params? }` on stderr gives its Problem. Anything else fails `HANDLER_FAILED` in the kernel,
 * after logging the bin and the exit code, never the output or the arguments.
 */
export function binResult<Output>(log: Ctx['log'], bin: string, run: BinRun, outputSchema: z.ZodType<Output>): Output {
  if (run.exitCode === 0) {
    const line = lastOutputLine(run.stdout);
    if (line !== undefined) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        parsed = undefined;
      }
      if (parsed !== undefined) {
        const checked = outputSchema.safeParse(parsed);
        if (checked.success) return checked.data;
      }
    }
    log.error(`${bin} printed an unexpected output.`, { bin, exitCode: run.exitCode });
    throw new Error(`${bin} failed.`);
  }
  if (run.exitCode === 1) {
    const line = lastOutputLine(run.stderr);
    if (line !== undefined) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        parsed = undefined;
      }
      if (parsed !== undefined) {
        const failure = binFailureSchema.safeParse(parsed);
        if (failure.success) {
          const problem = binFailureProblem(failure.data);
          if (problem !== undefined) throw problem;
        }
      }
    }
  }
  log.error(`${bin} failed.`, { bin, exitCode: run.exitCode });
  throw new Error(`${bin} failed.`);
}
