// What a recording question shows and sends (plan 08 §8.7; ADR 0115, 25 and 49): a line's words with the stressed ones
// marked and a pause mark after each word to pause after, a length as `m:ss`, and a take's file type and name.

export type LinePart = { text: string; stress: boolean; pause: boolean };

const wordPattern = /[\p{L}\p{N}_'’-]+|[^\p{L}\p{N}_'’-]+/gu;
const isWord = (text: string): boolean => /^[\p{L}\p{N}_'’-]+$/u.test(text);

/** The line in runs of words and the text between them; a run is a word to stress or to pause after. */
export function lineParts(text: string, stress: readonly string[], pauses: readonly string[]): LinePart[] {
  const stressed = new Set(stress.map((word) => word.toLowerCase()));
  const paused = new Set(pauses.map((word) => word.toLowerCase()));
  return (text.match(wordPattern) ?? []).map((part) => {
    const word = isWord(part) ? part.toLowerCase() : undefined;
    return { text: part, stress: word !== undefined && stressed.has(word), pause: word !== undefined && paused.has(word) };
  });
}

/** A length as `m:ss`. */
export function clockOf(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;
}

const extensions: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav' };

/** A take's media type without its parameters, as kvcoder takes it, or `undefined` for one it doesn't. */
export function takeType(type: string): string | undefined {
  const base = type.split(';')[0]?.trim().toLowerCase() ?? '';
  if (extensions[base] === undefined) return undefined;
  return base === 'audio/x-wav' || base === 'audio/wave' ? 'audio/wav' : base;
}

/** The upload's name for line `number`. */
export function takeName(number: number, type: string): string {
  return `line-${String(number)}.${extensions[type] ?? 'webm'}`;
}

/** The recorder's type: WebM with Opus where the browser records it, else MP4, else the browser's own. */
export function recorderType(supports: (type: string) => boolean): string | undefined {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(supports);
}
