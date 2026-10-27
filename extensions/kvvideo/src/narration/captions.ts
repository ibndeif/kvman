// A narration's captions (plan 16 §16.6, ADR 0107, 7): lines of whole words, each shown for the share of the
// narration's length that its characters have, one after another from 0 with no gap.

export type Caption = { text: string; startMs: number; endMs: number };

const maximumLine = 42;

const length = (text: string): number => [...text].length;

function sentencesOf(line: string): string[] {
  return line.split(/(?<=[.!?؟…])\s+/u).filter((sentence) => sentence !== '');
}

function linesOf(sentence: string): string[] {
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

/** The caption lines of a text, in order. */
export function captionLines(text: string): string[] {
  const textLines = text.split(/\r?\n/u).map((line) => line.replace(/\s+/gu, ' ').trim());
  return textLines.flatMap(sentencesOf).flatMap(linesOf);
}

/** The text's captions over a narration of `durationMs`. */
export function timedCaptions(text: string, durationMs: number): Caption[] {
  const lines = captionLines(text);
  const total = lines.reduce((sum, line) => sum + length(line), 0);
  let before = 0;
  return lines.map((line, index) => {
    const startMs = Math.floor((durationMs * before) / total);
    before += length(line);
    const endMs = index === lines.length - 1 ? durationMs : Math.floor((durationMs * before) / total);
    return { text: line, startMs, endMs };
  });
}
