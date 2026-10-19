import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { ProblemError } from '@kvman/sdk';
import type { RunCall } from '../calls/run-tool.ts';
import { binaryExec } from '../connectors/binary.ts';
import { builtinCommands } from '../connectors/builtin-connectors.ts';
import { resolveInWorkspace } from '../files/workspace-path.ts';
import type { ApprovalRule } from '../schemas/approval-rule.ts';

// The person's approval rules (plan 08 §8.3, ADR 0091, 1 and 2): a line whose every part starts with an allowed
// prefix, or a file change, runs without asking. A part is covered only when it holds plain words, so no shell's
// syntax can run another command inside it; a file that runs code or holds secrets is never covered.

const separators = /&&|\|\||[;|&\r\n]/;
// Letters, digits, spaces, and the punctuation of plain arguments: no `$`, backtick, bracket, brace, `<`, `>`, or `\`.
const plainPart = /^[\p{L}\p{N} \t_.,/:=+@%~*'"-]*$/u;
const words = (text: string): string => text.trim().replace(/\s+/g, ' ');

/** The commands of a line, or `undefined` when one of them holds more than plain words. */
export function lineParts(line: string): string[] | undefined {
  const parts = line.split(separators).map(words).filter((part) => part !== '');
  return parts.every((part) => plainPart.test(part)) ? parts : undefined;
}

const startsWith = (part: string, prefix: string): boolean => part === prefix || part.startsWith(`${prefix} `);

/** Whether every command of the line starts with one of the prefixes, at a word's end. */
export function lineCovered(line: string, prefixes: readonly string[]): boolean {
  const parts = lineParts(line);
  const allowed = prefixes.map(words);
  return parts !== undefined && parts.length > 0 && parts.every((part) => allowed.some((prefix) => startsWith(part, prefix)));
}

const shellRun = builtinCommands.shell.exec.registration;
const fileChanges: ReadonlySet<string> = new Set([builtinCommands.fs.write, builtinCommands.fs.edit, builtinCommands.fs.undo, builtinCommands.fs.assemble].map((command) => command.registration));
const projectRules = new Set(['agents.md', 'claude.md']);

/** Whether a file, by its path from the workspace folder, runs code or holds secrets: Git's own folder, `.env` files, and the project's rules. */
export function guardedFile(relative: string): boolean {
  const segments = relative.split(/[\\/]/).filter((segment) => segment !== '' && segment !== '.');
  const name = (segments.at(-1) ?? '').toLowerCase();
  return segments.some((segment) => segment.toLowerCase() === '.git') || name === '.env' || name.startsWith('.env.') || (segments.length === 1 && projectRules.has(name));
}

/** The line a call runs in the real shell: `shell exec`'s, or a binary's `<name> <args>`. */
export function callLine(call: RunCall, registration: string): string | undefined {
  if (registration === shellRun) return typeof call.payload['line'] === 'string' ? call.payload['line'] : undefined;
  if (registration !== binaryExec.registration) return undefined;
  const args = call.payload['args'];
  return typeof args === 'string' && args.trim() !== '' ? `${call.connector} ${args}` : call.connector;
}

// A file change a files rule covers: its real path is inside the workspace folder and isn't a guarded file.
async function fileCovered(workspace: string, requested: unknown): Promise<boolean> {
  if (typeof requested !== 'string' || requested === '') return false;
  try {
    return !guardedFile(path.relative(await realpath(workspace), await resolveInWorkspace(workspace, requested)));
  } catch (error) {
    // A path outside the folder is the call's own failure to report; it is just not covered.
    if (error instanceof ProblemError) return false;
    throw error;
  }
}

/** Whether one of the rules covers the call, which would otherwise ask (ADR 0091, 2). */
export async function ruleCovers(rules: readonly ApprovalRule[], call: RunCall, registration: string, workspace: string): Promise<boolean> {
  if (fileChanges.has(registration)) return rules.some((rule) => rule.kind === 'files') && fileCovered(workspace, call.payload['path']);
  const line = callLine(call, registration);
  return line !== undefined && lineCovered(line, rules.flatMap((rule) => (rule.kind === 'line' ? [rule.prefix] : [])));
}
