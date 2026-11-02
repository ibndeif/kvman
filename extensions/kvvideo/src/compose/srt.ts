import type { Caption } from '../narration/captions.ts';

// The `.srt` beside a video (plan 16 §16.8; ADR 0115, 18): its captions on the video's time line, numbered from 1, for
// players and sites that show their own captions.

function srtTime(ms: number): string {
  const pad = (value: number, size = 2): string => String(value).padStart(size, '0');
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

export function srtFile(captions: readonly Caption[]): string {
  return captions.map((caption, index) => `${String(index + 1)}\n${srtTime(caption.startMs)} --> ${srtTime(caption.endMs)}\n${caption.text.replace(/\s+/g, ' ').trim()}\n`).join('\n');
}
