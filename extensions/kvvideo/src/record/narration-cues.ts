// When a recording's steps start, from its narration (plan 16 §16.5; ADR 0115, 16 and 41): the narration starts
// 300 ms into the scene, so line `n` is heard at 300 ms plus its start, and the recording lasts at least the
// narration with 300 ms before and after it.

export const narrationLeadMs = 300;

export type Cues = { lineStartsMs: number[]; leastLengthMs: number };

export function cuesOf(narration: { durationMs: number; captions: readonly { startMs: number }[] }): Cues {
  return { lineStartsMs: narration.captions.map((caption) => narrationLeadMs + caption.startMs), leastLengthMs: narrationLeadMs + narration.durationMs + narrationLeadMs };
}

/** How long to wait, `nowMs` into the recording, until `atMs`; nothing once it has passed. */
export function waitUntilMs(atMs: number, nowMs: number): number {
  return Math.max(0, Math.round(atMs - nowMs));
}
