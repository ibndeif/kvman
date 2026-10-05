// Messages long enough to pass a summary's minimum (ADR 0019, 7): the fake models' window is 128 000 tokens, so the
// messages older than the last 10 must hold 51 200 characters. `padded` adds filler after a text; `unpadded` removes it.

/** Two of these pass the minimum; fourteen stay under the default `kvcoder.compactAt`. */
export const longEnough = 27_000;

/** One of these passes the minimum. */
export const longAlone = 52_000;

export const padded = (text: string, size: number = longEnough): string => `${text} ${'x'.repeat(size)}`;

export const unpadded = (text: string): string => text.replace(/ x+$/, '');
