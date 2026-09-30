import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ProblemError, z } from '@kvman/sdk';
import type { LogLevel } from '@kvman/kernel';

// kvman's flags (plan 01 §1.2). `--mode` and `--preset` stay undefined when not given, since a hand-over compares only
// the flags given (ADR 0009, 44); `--port 0` asks the OS for a free port (ADR 0009, 46).

export type RunArguments = {
  kind: 'run';
  mode: 'web' | undefined;
  preset: string | undefined;
  home: string | undefined;
  port: number | undefined;
  yes: boolean;
  open: boolean;
  logLevel: LogLevel;
};

export type CliArguments = { kind: 'help' } | { kind: 'version' } | RunArguments;

export const usage = `Usage:
  kvman [--mode web] [--preset coder] [--home <dir>] [--port <n>] [--yes] [--no-open] [--log-level <level>]
  kvman --help | --version

Options:
  --mode <mode>         How kvman runs: web (the default).
  --preset <preset>     A bundled preset, <home>/presets/<name>.json, or a preset file such as ./app.json. Default: coder.
  --home <dir>          kvman's home folder. Default: KVMAN_HOME, else ~/.kvman.
  --port <n>            The port to listen on (0 picks a free one). Default: the kernel.port setting (3737).
  --yes                 Accept new extension versions without asking.
  --no-open             Don't open the browser.
  --log-level <level>   debug, info (the default), warn, or error.
  --help                Show this help.
  --version             Show kvman's version.
`;

const flags = {
  mode: { type: 'string' },
  preset: { type: 'string' },
  home: { type: 'string' },
  port: { type: 'string' },
  yes: { type: 'boolean' },
  'no-open': { type: 'boolean' },
  'log-level': { type: 'string' },
  help: { type: 'boolean' },
  version: { type: 'boolean' },
} as const;

const modeSchema = z.literal('web', { error: 'The mode must be web.' }).optional();
const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error'], { error: 'The log level must be debug, info, warn, or error.' }).default('info');
const portSchema = z
  .string()
  .regex(/^\d+$/, { error: 'The port must be a whole number from 0 to 65535.' })
  .transform(Number)
  .pipe(z.number().max(65_535, { error: 'The port must be a whole number from 0 to 65535.' }))
  .optional();

function invalid(message: string): ProblemError {
  return new ProblemError({ code: 'VALIDATION_FAILED', message });
}

function parsed<Output>(schema: z.ZodType<Output>, value: unknown): Output {
  const result = schema.safeParse(value);
  if (!result.success) throw invalid(result.error.issues.map((issue) => issue.message).join(' '));
  return result.data;
}

function readFlags(argv: readonly string[]) {
  try {
    return parseArgs({ args: [...argv], options: flags, strict: true, allowPositionals: false });
  } catch (error) {
    if (error instanceof TypeError) throw invalid(error.message);
    throw error;
  }
}

export function parseArguments(argv: readonly string[]): CliArguments {
  const { values } = readFlags(argv);
  if (values.help === true) return { kind: 'help' };
  if (values.version === true) return { kind: 'version' };
  return {
    kind: 'run',
    mode: parsed(modeSchema, values.mode),
    preset: values.preset,
    home: values.home,
    port: parsed(portSchema, values.port),
    yes: values.yes === true,
    open: values['no-open'] !== true,
    logLevel: parsed(logLevelSchema, values['log-level']),
  };
}

// `--home`, else `KVMAN_HOME`, else `~/.kvman` (plan 01 §1.3).
export function kvmanHome(flag: string | undefined, environment: NodeJS.ProcessEnv, userFolder: string = os.homedir()): string {
  const chosen = flag ?? environment['KVMAN_HOME'];
  return chosen === undefined || chosen === '' ? path.join(userFolder, '.kvman') : path.resolve(chosen);
}
