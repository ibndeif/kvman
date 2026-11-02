// The pronunciation list (plan 16 §16.2; ADR 0115, 15): each word is replaced by what the voice should say, as a whole
// word, ignoring case. The captions keep the text as written, so each character of the sentence keeps where it is in
// what is spoken: a replaced word's characters span the whole replacement.

export type Pronunciation = { word: string; say: string };

/** A sentence as spoken, and where each of its characters (by code point) is in it. */
export type Spoken = { text: string; spokenIndex(index: number, edge: 'first' | 'last'): number };

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function matcher(pronunciations: readonly Pronunciation[]): RegExp | undefined {
  if (pronunciations.length === 0) return undefined;
  const words = [...pronunciations].map((entry) => entry.word).sort((a, b) => b.length - a.length);
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${words.map(escaped).join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
}

export function spokenOf(sentence: string, pronunciations: readonly Pronunciation[]): Spoken {
  const says = new Map(pronunciations.map((entry) => [entry.word.toLowerCase(), entry.say]));
  const spans: [number, number][] = [];
  let spoken = '';
  let spokenLength = 0;
  let from = 0;
  const keep = (text: string): void => {
    for (const character of text) {
      spans.push([spokenLength, spokenLength]);
      spoken += character;
      spokenLength += 1;
    }
  };
  const pattern = matcher(pronunciations);
  const matches = pattern === undefined ? [] : [...sentence.matchAll(pattern)];
  for (const match of matches) {
    keep(sentence.slice(from, match.index));
    const say = says.get(match[0].toLowerCase()) ?? match[0];
    const sayLength = [...say].length;
    const replaced = [...match[0]].length;
    for (let index = 0; index < replaced; index += 1) spans.push([spokenLength, spokenLength + sayLength - 1]);
    spoken += say;
    spokenLength += sayLength;
    from = match.index + match[0].length;
  }
  keep(sentence.slice(from));
  return { text: spoken, spokenIndex: (index, edge) => spans[index]?.[edge === 'first' ? 0 : 1] ?? 0 };
}
