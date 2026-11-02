// How things move in a recording (plan 16 §16.5; ADR 0115, 9): the pointer's eased, gently curved path, a typing
// pace that varies but is the same for the same text, and an eased scroll. Each is planned in frames of `frameMs`.

export const frameMs = 16;

export type Point = { x: number; y: number };

/** Cubic easing in and out, from 0 to 1. */
export function easeInOut(share: number): number {
  return share < 0.5 ? 4 * share ** 3 : 1 - (-2 * share + 2) ** 3 / 2;
}

const frameCount = (durationMs: number): number => Math.max(1, Math.round(durationMs / frameMs));

/** How long the pointer takes to travel `distance` pixels. */
export function glideMs(distance: number): number {
  return Math.min(900, Math.max(400, Math.round(300 + 0.6 * distance)));
}

/** The pointer's positions, one a frame, from `from` (left out) to `to`, along a gentle curve. */
export function glidePath(from: Point, to: Point): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const bend = 0.08;
  const control = { x: (from.x + to.x) / 2 - dy * bend, y: (from.y + to.y) / 2 + dx * bend };
  const frames = frameCount(glideMs(Math.hypot(dx, dy)));
  return Array.from({ length: frames }, (_, index) => {
    const share = easeInOut((index + 1) / frames);
    const toControl = 2 * (1 - share) * share;
    const toEnd = share * share;
    return { x: from.x + toControl * (control.x - from.x) + toEnd * dx, y: from.y + toControl * (control.y - from.y) + toEnd * dy };
  });
}

// A small seeded generator (mulberry32 over an FNV-1a hash of the text), so the same text types the same way.
function seededRandom(text: string): () => number {
  let seed = 0x811c9dc5;
  for (const unit of text) seed = Math.imul(seed ^ (unit.codePointAt(0) ?? 0), 0x01000193);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let mixed = Math.imul(seed ^ (seed >>> 15), seed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const pausesAfter = (character: string): boolean => /[\s\p{P}]/u.test(character);

/** The wait before each character of `text`: 35 to 110 ms, and 150 ms more after a space or a punctuation mark. */
export function typingDelays(text: string): number[] {
  const random = seededRandom(text);
  const characters = [...text];
  return characters.map((_, index) => 35 + Math.floor(random() * 76) + (index > 0 && pausesAfter(characters[index - 1] ?? '') ? 150 : 0));
}

/** An eased scroll of `pixels`: its length and its move in each frame, which add up to `pixels`. */
export function scrollPlan(pixels: number): { durationMs: number; moves: number[] } {
  const durationMs = Math.min(3000, Math.round(400 + 0.5 * Math.abs(pixels)));
  const frames = frameCount(durationMs);
  let before = 0;
  const moves = Array.from({ length: frames }, (_, index) => {
    const at = Math.round(pixels * easeInOut((index + 1) / frames));
    const move = at - before;
    before = at;
    return move;
  });
  return { durationMs, moves };
}
