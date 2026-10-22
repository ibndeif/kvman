// What "Add to kvman chat" puts in the send box (plan 15 §15.6, ADR 0100, 28): a selection's path and lines with the
// code in a fenced block, or a file's path. Lines count from 1.

export type Selected = { path: string; firstLine: number; lastLine: number; language: string; code: string };

export function selectionText(selected: Selected): string {
  const lines = selected.firstLine === selected.lastLine ? String(selected.firstLine) : `${String(selected.firstLine)}-${String(selected.lastLine)}`;
  const fence = selected.code.includes('```') ? '````' : '```';
  return `\`${selected.path}:${lines}\`\n${fence}${selected.language}\n${selected.code.replace(/\n+$/, '')}\n${fence}`;
}

export function fileText(relativePath: string): string {
  return `\`${relativePath}\``;
}

/** A selection's last line: one that ends at the start of a line ends on the line before. */
export function lastSelectedLine(start: { line: number }, end: { line: number; character: number }): number {
  return end.character === 0 && end.line > start.line ? end.line : end.line + 1;
}
