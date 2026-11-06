import type { Alignment } from './alignment.ts';
import type { Spoken } from './pronunciations.ts';

// A narration's captions (plan 16 §16.6; ADR 0107, 7; ADR 0115, 17; ADR 0120, 24): the text in sentences, each
// sentence in the fewest lines of whole words up to 42 characters, breaking after punctuation where it keeps that many
// lines, and else as even as the words allow. A sentence's lines cover its own audio: by the service's character times
// where it gives them, else by each line's share of the sentence's characters. Each line ends where the next starts.

export type Word = { text: string; startMs: number; endMs: number };

export type Caption = { text: string; startMs: number; endMs: number; words?: Word[] };

const maximumLine = 42;

const length = (text: string): number => [...text].length;

/** The text's sentences, in order: cut at line breaks and after `.`, `!`, `?`, `؟`, and `…` followed by a space. */
export function sentencesOf(text: string): string[] {
  return text
    .split(/\r?\n/u)
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .flatMap((line) => line.split(/(?<=[.!?؟…])\s+/u))
    .filter((sentence) => sentence !== '');
}

// The fewest lines a run of words needs: as many as filling each line as far as it goes makes.
function fewestLines(words: readonly string[]): number {
  let lines = 0;
  let current = -1;
  for (const word of words) {
    const joined = current < 0 ? length(word) : current + 1 + length(word);
    if (current >= 0 && joined <= maximumLine) current = joined;
    else {
      lines += 1;
      current = length(word);
    }
  }
  return lines;
}

const endsAPhrase = (word: string): boolean => /[,،;؛:]$/u.test(word);

type Best = { breaks: number; longest: number; from: number };

const better = (first: Best, second: Best | undefined): boolean => second === undefined || first.breaks > second.breaks || (first.breaks === second.breaks && first.longest < second.longest);

// A run of words, none over 42 characters, in its fewest lines: the most breaks after punctuation, then the shortest
// longest line. Each state is the best way to put the first `end` words in `count` lines; more breaks always stay
// ahead, and a shorter longest line never loses to a longer one, so each state's best is enough.
function evenLines(words: readonly string[]): string[] {
  const lines = fewestLines(words);
  const best: (Best | undefined)[][] = Array.from({ length: lines + 1 }, () => Array<Best | undefined>(words.length + 1).fill(undefined));
  const first = best[0];
  if (first !== undefined) first[0] = { breaks: 0, longest: 0, from: 0 };
  for (let count = 1; count <= lines; count += 1) {
    for (let end = 1; end <= words.length; end += 1) {
      let width = -1;
      for (let start = end - 1; start >= 0; start -= 1) {
        width += length(words[start] ?? '') + 1;
        if (width > maximumLine) break;
        const before = best[count - 1]?.[start];
        if (before === undefined) continue;
        const punctuated = count < lines && endsAPhrase(words[end - 1] ?? '') ? 1 : 0;
        const candidate = { breaks: before.breaks + punctuated, longest: Math.max(before.longest, width), from: start };
        const row = best[count];
        if (row !== undefined && better(candidate, row[end])) row[end] = candidate;
      }
    }
  }
  const made: string[] = [];
  let end = words.length;
  for (let count = lines; count > 0; count -= 1) {
    const from = best[count]?.[end]?.from ?? 0;
    made.unshift(words.slice(from, end).join(' '));
    end = from;
  }
  return made;
}

/** A sentence's caption lines: the whole sentence when it fits 42 characters, else even lines, a longer word alone. */
export function linesOf(sentence: string): string[] {
  if (length(sentence) <= maximumLine) return [sentence];
  const lines: string[] = [];
  let run: string[] = [];
  for (const word of sentence.split(' ')) {
    if (length(word) <= maximumLine) {
      run.push(word);
      continue;
    }
    if (run.length > 0) lines.push(...evenLines(run));
    lines.push(word);
    run = [];
  }
  if (run.length > 0) lines.push(...evenLines(run));
  return lines;
}

/** One sentence's place in the narration: its audio from `startMs` for `durationMs`, and its character times. */
export type PlacedSentence = { text: string; spoken: Spoken; startMs: number; durationMs: number; alignment: Alignment | null };

// Each line's start, in characters of the sentence, and its words with their starts and ends.
function lineSpans(sentence: string): { text: string; from: number; words: { text: string; from: number; to: number }[] }[] {
  const characters = [...sentence];
  let at = 0;
  return linesOf(sentence).map((line) => {
    while (characters[at] === ' ') at += 1;
    const from = at;
    const words: { text: string; from: number; to: number }[] = [];
    for (const word of line.split(' ')) {
      words.push({ text: word, from: at, to: at + length(word) - 1 });
      at += length(word) + 1;
    }
    at -= 1;
    return { text: line, from, words };
  });
}

function proportional(sentence: PlacedSentence): Caption[] {
  const lines = linesOf(sentence.text);
  const total = lines.reduce((sum, line) => sum + length(line), 0);
  let before = 0;
  return lines.map((line) => {
    const startMs = sentence.startMs + Math.floor((sentence.durationMs * before) / total);
    before += length(line);
    return { text: line, startMs, endMs: 0 };
  });
}

function aligned(sentence: PlacedSentence, alignment: Alignment): Caption[] {
  const at = (index: number, edge: 'startsMs' | 'endsMs'): number => sentence.startMs + Math.floor(alignment[edge][sentence.spoken.spokenIndex(index, edge === 'startsMs' ? 'first' : 'last')] ?? 0);
  return lineSpans(sentence.text).map((line) => ({
    text: line.text,
    startMs: at(line.from, 'startsMs'),
    endMs: 0,
    words: line.words.map((word) => ({ text: word.text, startMs: at(word.from, 'startsMs'), endMs: at(word.to, 'endsMs') })),
  }));
}

/** The captions of placed sentences over a narration of `durationMs`: each line ends where the next starts. */
export function captionsOf(sentences: readonly PlacedSentence[], durationMs: number): Caption[] {
  const lines = sentences.flatMap((sentence) => (sentence.alignment === null ? proportional(sentence) : aligned(sentence, sentence.alignment)));
  return lines.map((line, index) => ({ ...line, endMs: index === lines.length - 1 ? durationMs : (lines[index + 1]?.startMs ?? durationMs) }));
}
