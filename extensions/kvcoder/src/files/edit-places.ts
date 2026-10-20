import { linesOf, numberedLine } from './read-text.ts';

// Where a failed edit could have meant (plan 08 §8.5, ADR 0097, 3): the lines of an `oldText` found several times, or
// for one not found, where it matches when whitespace is ignored, else where its first line appears. Shown lines are
// numbered as a read numbers them. Nothing is ever applied from here.

const listedLimit = 20;
const shownMatches = 5;
const placesShown = 3;
const placeLines = 20;
const lineCharacters = 200;

/** The line number of each character offset, counting from 1. */
function lineFinder(content: string): (offset: number) => number {
  const starts = [0];
  for (let index = content.indexOf('\n'); index >= 0; index = content.indexOf('\n', index + 1)) starts.push(index + 1);
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((starts[middle] ?? 0) <= offset) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
}

const cutLine = (line: string): string => (line.length > lineCharacters ? `${line.slice(0, lineCharacters)}…` : line);

// The file's lines `from` to `to`, numbered, at most 20 of them.
function shownLines(lines: readonly string[], from: number, to: number): string {
  const first = Math.max(from, 1);
  const last = Math.min(to, lines.length, first + placeLines - 1);
  const shown: string[] = [];
  for (let number = first; number <= last; number += 1) shown.push(numberedLine(number, cutLine((lines[number - 1] ?? '').replace(/\r?\n$/, ''))));
  return shown.join('\n');
}

// The places' lines, numbered, places whose lines overlap shown once together.
function shownPlaces(lines: readonly string[], ranges: readonly { from: number; to: number }[]): string {
  const merged: { from: number; to: number }[] = [];
  for (const range of [...ranges].sort((first, second) => first.from - second.from)) {
    const last = merged.at(-1);
    if (last !== undefined && range.from <= last.to) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  return merged.map((range) => shownLines(lines, range.from, range.to)).join('\n\n');
}

const listed = (places: readonly (number | string)[], limit: number): string => {
  const more = places.length > limit ? ` and ${String(places.length - limit)} more` : '';
  return `${places.slice(0, limit).join(', ')}${more}`;
};

const lineWord = (places: readonly unknown[]): string => (places.length === 1 ? 'line' : 'lines');

const distinct = (numbers: readonly number[]): number[] => [...new Set(numbers)];

/** The lines an `oldText` found at these offsets starts on, and the first few shown with a line around each. */
export function manyPlaces(content: string, offsets: readonly number[]): { lines: string; shown: string } {
  const lineOf = lineFinder(content);
  const numbers = distinct(offsets.map(lineOf));
  const lines = linesOf(content);
  return { lines: `${lineWord(numbers)} ${listed(numbers, listedLimit)}`, shown: shownPlaces(lines, numbers.slice(0, shownMatches).map((line) => ({ from: line - 1, to: line + 1 }))) };
}

// The content with each run of whitespace as one space, and where each of its characters came from.
function loosened(content: string): { text: string; origins: number[] } {
  let text = '';
  const origins: number[] = [];
  for (const match of content.matchAll(/\s+|\S+/g)) {
    const isSpace = /^\s/.test(match[0]);
    text += isSpace ? ' ' : match[0];
    for (let index = 0; index < (isSpace ? 1 : match[0].length); index += 1) origins.push(match.index + index);
  }
  return { text, origins };
}

// The places, as first and last line, where the text matches with each run of whitespace taken as one space.
function looseMatches(content: string, oldText: string): { first: number; last: number }[] {
  const needle = oldText.trim().replace(/\s+/g, ' ');
  if (needle === '') return [];
  const loose = loosened(content);
  const lineOf = lineFinder(content);
  const found: { first: number; last: number }[] = [];
  for (let index = loose.text.indexOf(needle); index >= 0; index = loose.text.indexOf(needle, index + needle.length)) {
    found.push({ first: lineOf(loose.origins[index] ?? 0), last: lineOf(loose.origins[index + needle.length - 1] ?? 0) });
  }
  return found;
}

/** What an error for an `oldText` that isn't found adds: where it may have meant, or nothing. */
export function nearPlaces(content: string, oldText: string): { sentence: string; shown: string } | undefined {
  const lines = linesOf(content);
  const loose = looseMatches(content, oldText);
  if (loose.length > 0) {
    const places = loose.map((place) => (place.first === place.last ? String(place.first) : `${String(place.first)}–${String(place.last)}`));
    return { sentence: `It matches when whitespace is ignored at ${loose.length === 1 && loose[0]?.first === loose[0]?.last ? 'line' : 'lines'} ${listed(places, placesShown)}; the file's lines there are below.`, shown: shownPlaces(lines, loose.slice(0, placesShown).map((place) => ({ from: place.first, to: place.last }))) };
  }
  const firstLine = oldText.split('\n').find((line) => line.trim() !== '')?.trim();
  if (firstLine === undefined) return undefined;
  const found = lines.flatMap((line, index) => (line.includes(firstLine) ? [index + 1] : []));
  if (found.length === 0) return undefined;
  const length = linesOf(oldText.trim()).length;
  return { sentence: `Its first line appears at ${lineWord(found)} ${listed(found, placesShown)}; the file's lines there are below.`, shown: shownPlaces(lines, found.slice(0, placesShown).map((line) => ({ from: line - 1, to: line + length - 1 }))) };
}
