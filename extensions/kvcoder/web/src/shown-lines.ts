import { textLines, type DiffLine } from './edit-diff.ts';

// The lines a card's block shows (ADR 0036, 7): a file's lines with their numbers, a diff's with their kind, or plain
// text. A block of more than 12 shows 12 until the person asks for all.

export type ShownLine = { text: string; number?: number; kind?: DiffLine['kind'] };

export const foldAt = 12;

/** The items a block shows: all of them when open or few, the first 12 otherwise. */
export function folded<Item>(items: readonly Item[], open: boolean): readonly Item[] {
  return open || items.length <= foldAt ? items : items.slice(0, foldAt);
}

export const plainLines = (text: string): ShownLine[] => textLines(text).map((line) => ({ text: line }));

export const numberedLines = (text: string, from: number): ShownLine[] => textLines(text).map((line, index) => ({ text: line, number: from + index }));
