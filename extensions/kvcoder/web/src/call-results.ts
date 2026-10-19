import { fields, type Translate } from './kvman.ts';

// What kvcoder's own `fs` commands and `background output` return (plan 08 §8.5), read from a result's parsed output. A result that isn't the
// shape its command returns gives nothing, and the card then shows it as any other output (ADR 0036, 9).

export type EditResult = { replacements: number; firstChangedLine: number };
export type ReadResult = { fromLine: number; content: string };
export type Entry = { name: string; kind: 'file' | 'folder'; bytes: number };
export type RunResult = { call: string; status: string; answer: boolean; ranMs?: number; exitCode?: number; output?: unknown; problem?: unknown };
export type FileMatches = { path: string; matches: { line: number; text: string }[] };

export function editResult(result: unknown): EditResult | undefined {
  const { replacements, firstChangedLine } = fields(result);
  return typeof replacements === 'number' && typeof firstChangedLine === 'number' ? { replacements, firstChangedLine } : undefined;
}

export function readResult(result: unknown): ReadResult | undefined {
  const { fromLine, content } = fields(result);
  return typeof fromLine === 'number' && typeof content === 'string' ? { fromLine, content } : undefined;
}

function entryOf(value: unknown): Entry[] {
  const { name, kind, bytes } = fields(value);
  return typeof name === 'string' && (kind === 'file' || kind === 'folder') && typeof bytes === 'number' ? [{ name, kind, bytes }] : [];
}

export function listResult(result: unknown): Entry[] | undefined {
  const entries: unknown = fields(result)['entries'];
  return Array.isArray(entries) ? entries.flatMap(entryOf) : undefined;
}

/** The paths `fs find` returned (ADR 0090, 2). */
export function pathsResult(result: unknown): string[] | undefined {
  const paths: unknown = fields(result)['paths'];
  return Array.isArray(paths) ? paths.filter((entry): entry is string => typeof entry === 'string') : undefined;
}

function matchesOf(value: unknown): FileMatches[] {
  const { path, matches } = fields(value);
  if (typeof path !== 'string' || !Array.isArray(matches)) return [];
  const found = matches.flatMap((match: unknown) => {
    const { line, text } = fields(match);
    return typeof line === 'number' && typeof text === 'string' ? [{ line, text }] : [];
  });
  return [{ path, matches: found }];
}

const runStatuses = ['running', 'succeeded', 'failed', 'cancelled', 'interrupted'] as const;

/** A run's status in the words of the Running list; a status this page doesn't know stays as it is. */
export function runStatusText(t: Translate, status: string): string {
  return runStatuses.some((known) => known === status) ? t(`kvcoder.ui.jobs.status.${status}`) : status;
}

/** What `background output` returned (ADR 0062, 2); `undefined` for a result that isn't a run's row. */
export function runResult(result: unknown): RunResult | undefined {
  const { kind, call, status, startedAt, endedAt, exitCode, output, problem } = fields(result);
  if (typeof call !== 'string' || typeof status !== 'string') return undefined;
  const ranMs = typeof startedAt === 'string' && typeof endedAt === 'string' ? Date.parse(endedAt) - Date.parse(startedAt) : Number.NaN;
  return {
    call,
    status,
    answer: kind === 'subagent',
    ...(Number.isFinite(ranMs) && ranMs >= 0 ? { ranMs } : {}),
    ...(typeof exitCode === 'number' && exitCode !== 0 ? { exitCode } : {}),
    ...(output === undefined ? {} : { output }),
    ...(problem === undefined ? {} : { problem }),
  };
}

export function searchResult(result: unknown): FileMatches[] | undefined {
  const files: unknown = fields(result)['files'];
  return Array.isArray(files) ? files.flatMap(matchesOf) : undefined;
}
