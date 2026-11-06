// What a recording question shows and sends (plan 08 §8.7; ADR 0115, 25 and 49; ADR 0120, 25): a line's words with
// each run to stress marked and a pause mark after each run's last word, a length as `m:ss`, and a take's file type and
// name.

export type LinePart = { text: string; stress: boolean; pause: boolean };

const wordPattern = /[\p{L}\p{N}_'’-]+|[^\p{L}\p{N}_'’-]+/gu;
const isWord = (text: string): boolean => /^[\p{L}\p{N}_'’-]+$/u.test(text);
const isSpace = (text: string): boolean => /^\s+$/u.test(text);

// The parts' indexes of each place the run of words is found, each word after the last with only space between.
function runsOf(parts: readonly string[], run: string): number[][] {
  const words = run.toLowerCase().trim().split(/\s+/u);
  const found: number[][] = [];
  parts.forEach((_, start) => {
    const indexes: number[] = [];
    let at = start;
    for (const [index, word] of words.entries()) {
      if (index > 0 && !isSpace(parts[at] ?? '')) return;
      if (index > 0) at += 1;
      if (parts[at]?.toLowerCase() !== word) return;
      indexes.push(at);
      at += 1;
    }
    found.push(indexes);
  });
  return found;
}

/** The line in runs of words and the text between them; a word is stressed or paused after when its run says so. */
export function lineParts(text: string, stress: readonly string[], pauses: readonly string[]): LinePart[] {
  const parts = text.match(wordPattern) ?? [];
  const stressed = new Set(stress.flatMap((run) => runsOf(parts, run).flat()));
  const paused = new Set(pauses.flatMap((run) => runsOf(parts, run).map((indexes) => indexes.at(-1) ?? -1)));
  return parts.map((part, index) => ({ text: part, stress: isWord(part) && stressed.has(index), pause: isWord(part) && paused.has(index) }));
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
