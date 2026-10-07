import { vi } from 'vitest';
import { z } from '@kvman/sdk';
import { childWait } from '../support/api.ts';
import { spawnKvman, type ChildOptions, type KvmanChild } from '../support/kvman-child.ts';
import type { Sandbox } from '../support/sandbox.ts';

// Helpers for the piped runs (plan 14 §14.2): kvman's stdout read as JSON lines, and its stdin written or closed.
// Parsing every line is what shows that stdout holds nothing but lines.

const lineSchema = z.looseObject({ kind: z.string() });
const runningSchema = z.object({ kind: z.enum(['running', 'joined']), url: z.string(), port: z.number() });

export type Line = z.infer<typeof lineSchema>;

/** Every whole line of a stdout text, parsed. */
export function linesOfText(text: string): Line[] {
  return text
    .split('\n')
    .slice(0, -1)
    .map((line) => lineSchema.parse(JSON.parse(line)));
}

export function linesOf(child: KvmanChild): Line[] {
  return linesOfText(child.output());
}

/** Waits for the `count`th line. */
export function nthLine(child: KvmanChild, count: number): Promise<Line> {
  return vi.waitFor(() => {
    const line = linesOf(child)[count - 1];
    if (line === undefined) throw new Error(`kvman has written ${String(linesOf(child).length)} lines, not ${String(count)}.\nstderr:\n${child.errors()}`);
    return line;
  }, childWait);
}

/** The port of a `running` or `joined` line. */
export function portOf(line: Line): number {
  return runningSchema.parse(line).port;
}

/** `--home`, `--port 0`, `--no-open`, and `--pipe`, with no `--yes`. */
export function pipedArguments(sandbox: Sandbox): string[] {
  return ['--home', sandbox.home, '--port', '0', '--no-open', '--pipe'];
}

/** kvman with `--pipe` and the usual defaults (`--yes` among them). */
export function spawnPiped(sandbox: Sandbox, args: readonly string[], options: ChildOptions = {}): KvmanChild {
  return spawnKvman(sandbox, ['--pipe', ...args], options);
}

export function send(child: KvmanChild, text: string): void {
  child.process.stdin?.write(`${text}\n`);
}

export function closeInput(child: KvmanChild): void {
  child.process.stdin?.end();
}
