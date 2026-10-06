import { z } from '@kvman/sdk';

// What `ext check` and `ext test` return (plan 09 §9.1, ADR 0009, 117, 126): TypeScript's diagnostics as findings
// with `file:line:col`, `kvman-check --json`'s findings read from the last line of its output, and test output cut to
// its last 30 KB.

export type Finding = { file?: string; message: string; hint: string };

const findingsSchema = z.array(z.strictObject({ file: z.string().optional(), message: z.string(), hint: z.string() }));

const located = /^(.+)\((\d+),(\d+)\): (?:error|warning) (TS\d+): (.*)$/;
const global = /^(?:error|warning) (TS\d+): (.*)$/;
const typeHint = 'Fix the type error at that line, then run ext check again.';

export function typeScriptFindings(output: string): Finding[] {
  const findings: Finding[] = [];
  for (const line of output.split(/\r?\n/)) {
    const at = located.exec(line);
    const anywhere = at === null ? global.exec(line) : null;
    const last = findings.at(-1);
    if (at !== null) findings.push({ file: `${(at[1] ?? '').replaceAll('\\', '/')}:${at[2] ?? ''}:${at[3] ?? ''}`, message: `${at[4] ?? ''}: ${at[5] ?? ''}`, hint: typeHint });
    else if (anywhere !== null) findings.push({ message: `${anywhere[1] ?? ''}: ${anywhere[2] ?? ''}`, hint: typeHint });
    else if (last !== undefined && /^\s+\S/.test(line)) last.message += `\n${line.trim()}`;
  }
  return findings;
}

/** The findings `kvman-check --json` printed on its last line, or `undefined` when that line isn't its array. */
export function checkFindings(stdout: string): Finding[] | undefined {
  const lastLine = stdout.trimEnd().split('\n').at(-1) ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(lastLine);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
  const findings = findingsSchema.safeParse(parsed);
  return findings.success ? findings.data.map(({ file, message, hint }) => (file === undefined ? { message, hint } : { file, message, hint })) : undefined;
}

export const outputTailLimit = 30 * 1024;

/** The last 30 KB of an output, marked when the start was cut. */
export function outputTail(output: string): string {
  const bytes = Buffer.from(output, 'utf8');
  if (bytes.length <= outputTailLimit) return output;
  return `[… the first ${String(bytes.length - outputTailLimit)} bytes were cut …]\n${bytes.subarray(bytes.length - outputTailLimit).toString('utf8')}`;
}
