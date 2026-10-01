import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { CheckedFinding } from './finding.ts';

// The timer warnings (plan 02 §2.2, ADR 0009, 116): a text scan of `src/**/*.ts` with comments skipped. Every
// `setInterval(` warns, and every `setTimeout(` whose statement doesn't start with `await`, as
// `await new Promise((resolve) => setTimeout(resolve, ms))` does. It's a scan, not a parser, so it only warns.

const hint = {
  interval: 'Repeated work goes to ctx.schedule; a handler\'s work ends when it returns.',
  timeout: 'Await the timer inside the handler, or move the delayed work to ctx.execAsync or ctx.schedule.',
};

function commentEnd(source: string, index: number): number | null {
  if (source.startsWith('//', index)) {
    const end = source.indexOf('\n', index);
    return end === -1 ? source.length : end;
  }
  if (source.startsWith('/*', index)) {
    const end = source.indexOf('*/', index + 2);
    return end === -1 ? source.length : end + 2;
  }
  return null;
}

// Comments and string contents become spaces, so positions keep their line and column and no text inside them matches.
export function blankCommentsAndStrings(source: string): string {
  let result = '';
  let index = 0;
  while (index < source.length) {
    const end = commentEnd(source, index);
    if (end !== null) {
      result += source.slice(index, end).replace(/[^\n]/g, ' ');
      index = end;
      continue;
    }
    const char = source[index] ?? '';
    if (char === '"' || char === "'" || char === '`') {
      let close = index + 1;
      while (close < source.length && source[close] !== char) close += source[close] === '\\' ? 2 : 1;
      result += char + source.slice(index + 1, close).replace(/[^\n]/g, ' ') + (close < source.length ? char : '');
      index = close + 1;
      continue;
    }
    result += char;
    index += 1;
  }
  return result;
}

function statementStart(text: string, at: number): string {
  let start = at;
  while (start > 0 && !';{}'.includes(text[start - 1] ?? '')) start -= 1;
  return text.slice(start, at).trimStart();
}

function position(text: string, at: number): string {
  const before = text.slice(0, at).split('\n');
  return `${String(before.length)}:${String((before.at(-1) ?? '').length + 1)}`;
}

export function scanTimers(file: string, source: string): CheckedFinding[] {
  const text = blankCommentsAndStrings(source);
  const findings: CheckedFinding[] = [];
  for (const match of text.matchAll(/\bset(Interval|Timeout)\s*\(/g)) {
    const interval = match[1] === 'Interval';
    if (!interval && statementStart(text, match.index).startsWith('await')) continue;
    const call = interval ? 'setInterval' : 'setTimeout';
    const message = interval ? `Warning: ${call} keeps running after the handler returns.` : `Warning: an unawaited ${call} outlives its handler.`;
    findings.push({ file: `${file}:${position(text, match.index)}`, message, hint: interval ? hint.interval : hint.timeout, warning: true });
  }
  return findings;
}

function sourceFiles(folder: string, relative: string): string[] {
  const entries = readdirSync(path.join(folder, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  return entries.flatMap((entry) => {
    const child = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(folder, child);
    return entry.name.endsWith('.ts') ? [child] : [];
  });
}

/** The timer warnings of the project's `src/**\/*.ts`; none when it has no `src`. */
export function scanProjectTimers(folder: string): CheckedFinding[] {
  if (!existsSync(path.join(folder, 'src'))) return [];
  return sourceFiles(folder, 'src').flatMap((file) => scanTimers(file, readFileSync(path.join(folder, file), 'utf8')));
}
