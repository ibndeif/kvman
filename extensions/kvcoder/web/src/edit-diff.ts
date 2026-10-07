// An edit's diff (ADR 0036, 4): the lines its two texts share at the start and at the end are context, and what is
// left shows as removed lines, then added ones. An edit is small, so nothing finer is computed.

export type DiffLine = { kind: 'context' | 'removed' | 'added'; text: string };

const contextShown = 3;

/** A text's lines: a last line break ends the last line and adds no empty one. */
export function textLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  return text.endsWith('\n') ? lines.slice(0, -1) : lines;
}

function sharedStart(first: readonly string[], second: readonly string[]): number {
  let count = 0;
  while (count < first.length && count < second.length && first[count] === second[count]) count += 1;
  return count;
}

/** The lines of an edit: at most 3 shared lines, the removed lines, the added lines, at most 3 shared lines. */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const before = textLines(oldText);
  const after = textLines(newText);
  const start = sharedStart(before, after);
  const end = sharedStart(before.slice(start).reverse(), after.slice(start).reverse());
  const lines = (kind: DiffLine['kind'], texts: readonly string[]): DiffLine[] => texts.map((text) => ({ kind, text }));
  return [
    ...lines('context', before.slice(Math.max(start - contextShown, 0), start)),
    ...lines('removed', before.slice(start, before.length - end)),
    ...lines('added', after.slice(start, after.length - end)),
    ...lines('context', before.slice(before.length - end, before.length - end + contextShown)),
  ];
}

export function diffCounts(lines: readonly DiffLine[]): { added: number; removed: number } {
  return { added: lines.filter((line) => line.kind === 'added').length, removed: lines.filter((line) => line.kind === 'removed').length };
}
