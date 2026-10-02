import { invalid } from '../problems.ts';

// The text side of `fs edit` (plan 08 §8.5, ADR 0009, 159): every edit is matched exactly, once, against the file as
// it was, the edits are applied together, and the file's BOM and first line ending are kept.

export type TextEdit = { oldText: string; newText: string };

/** The edited file's text, how many replacements were made, and the line of the first one. */
export type EditedText = { text: string; replacements: number; firstChangedLine: number };

type Match = { index: number; length: number; edit: number; newText: string };

const byteOrderMark = '﻿';

const withLineFeeds = (text: string): string => text.replaceAll('\r\n', '\n');

// Counts every place `needle` occurs, overlapping ones included, so text that could match two ways is refused.
function occurrences(content: string, needle: string): number[] {
  const found: number[] = [];
  for (let index = content.indexOf(needle); index >= 0; index = content.indexOf(needle, index + 1)) found.push(index);
  return found;
}

function locate(content: string, edit: TextEdit, editIndex: number): Match {
  const oldText = withLineFeeds(edit.oldText);
  if (oldText === '') throw invalid(`edits[${editIndex}].oldText is empty.`);
  const found = occurrences(content, oldText);
  const [index] = found;
  if (index === undefined) throw invalid(`edits[${editIndex}] was not found; oldText must match the file exactly, including whitespace and line breaks.`);
  if (found.length > 1) throw invalid(`edits[${editIndex}] was found ${found.length} times; add more surrounding text so it matches once.`);
  return { index, length: oldText.length, edit: editIndex, newText: withLineFeeds(edit.newText) };
}

function checkDisjoint(matches: readonly Match[]): void {
  for (let position = 1; position < matches.length; position += 1) {
    const before = matches[position - 1];
    const after = matches[position];
    if (before !== undefined && after !== undefined && before.index + before.length > after.index) throw invalid(`edits[${before.edit}] and edits[${after.edit}] overlap; merge them into one edit.`);
  }
}

/** Applies the edits to a file's text, or throws a `VALIDATION_FAILED` Problem that names the edit and why. */
export function applyEdits(original: string, edits: readonly TextEdit[]): EditedText {
  const hasMark = original.startsWith(byteOrderMark);
  const body = hasMark ? original.slice(1) : original;
  const crlf = body.indexOf('\r\n') >= 0 && body.indexOf('\r\n') === body.indexOf('\n') - 1;
  const content = withLineFeeds(body);
  const matches = edits.map((edit, editIndex) => locate(content, edit, editIndex)).sort((first, second) => first.index - second.index);
  checkDisjoint(matches);
  const edited = matches.reduceRight((text, match) => text.slice(0, match.index) + match.newText + text.slice(match.index + match.length), content);
  if (edited === content) throw invalid('The edits change nothing in the file.');
  const first = matches[0]?.index ?? 0;
  const lines = content.slice(0, first).split('\n').length;
  return { text: (hasMark ? byteOrderMark : '') + (crlf ? edited.replaceAll('\n', '\r\n') : edited), replacements: matches.length, firstChangedLine: lines };
}
