import type { RunCall } from '../calls/run-tool.ts';
import { binaryExec } from '../connectors/binary.ts';
import { builtinCommands } from '../connectors/builtin-connectors.ts';
import type { ApprovalRule } from '../schemas/approval-rule.ts';

// The person's approval rules (plan 08 §8.3, ADR 0091, 1 and 2): a line whose every part starts with an allowed
// prefix, or the chat's file changes, runs without asking. Shell syntax that could hide a command is never covered.

const hidingSyntax = /\$\(|`|<\(|>\(|[<>]/;
const separators = /&&|\|\||[;|&\r\n]/;
const words = (text: string): string => text.trim().replace(/\s+/g, ' ');

/** The commands of a line, or `undefined` when it holds syntax that could hide one. */
export function lineParts(line: string): string[] | undefined {
  if (hidingSyntax.test(line)) return undefined;
  return line.split(separators).map(words).filter((part) => part !== '');
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

/** The line a call runs in the real shell: `shell exec`'s, or a binary's `<name> <args>`. */
export function callLine(call: RunCall, registration: string): string | undefined {
  if (registration === shellRun) return typeof call.payload['line'] === 'string' ? call.payload['line'] : undefined;
  if (registration !== binaryExec.registration) return undefined;
  const args = call.payload['args'];
  return typeof args === 'string' && args.trim() !== '' ? `${call.connector} ${args}` : call.connector;
}

/** Whether one of the rules covers the call, which would otherwise ask (ADR 0091, 2). */
export function ruleCovers(rules: readonly ApprovalRule[], call: RunCall, registration: string): boolean {
  if (fileChanges.has(registration)) return rules.some((rule) => rule.kind === 'files');
  const line = callLine(call, registration);
  return line !== undefined && lineCovered(line, rules.flatMap((rule) => (rule.kind === 'line' ? [rule.prefix] : [])));
}
