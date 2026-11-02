import type { Alignment } from './alignment.ts';
import type { Spoken } from './pronunciations.ts';

// A narration's captions (plan 16 §16.6; ADR 0107, 7; ADR 0115, 17): the text in sentences, each sentence in lines of
// whole words up to 42 characters. A sentence's lines cover its own audio: by the service's character times where it
// gives them, else by each line's share of the sentence's characters. Each line ends where the next starts.

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

/** A sentence's caption lines: whole words, each line as long as it can be up to 42 characters. */
export function linesOf(sentence: string): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of sentence.split(' ')) {
    const joined = current === '' ? word : `${current} ${word}`;
    if (current !== '' && length(joined) > maximumLine) {
      lines.push(current);
      current = word;
    } else {
      current = joined;
    }
  }
  if (current !== '') lines.push(current);
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
