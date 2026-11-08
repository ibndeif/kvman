import type { Brand } from '../brand/brand.ts';
import type { Size } from './frame-layout.ts';
import { videoFramesPerSecond } from './video-rate.ts';

// What is behind a scene's clip (plan 16 §16.8; ADR 0115, 10 and 60), drawn by ffmpeg: an image covering the picture,
// or a still diagonal gradient from a colour (the scene's, else the brand's background) to that colour mixed with 18%
// of the brand's primary; with no colour and no brand, from #0F172A to #1E293B.

export type Background = { kind: 'image'; file: string } | { kind: 'gradient'; from: string; to: string };

const channels = (colour: string): number[] => [1, 3, 5].map((at) => Number.parseInt(colour.slice(at, at + 2), 16));

/** `colour` mixed with `share` of `other`, as #rrggbb. */
export function mixed(colour: string, other: string, share: number): string {
  const [base, added] = [channels(colour), channels(other)];
  return `#${base.map((value, index) => Math.round(value * (1 - share) + (added[index] ?? 0) * share).toString(16).padStart(2, '0')).join('')}`;
}

/** The scene's background, from its `background` (a colour or an image file already checked) and the brand. */
export function backgroundOf(background: { colour: string } | { file: string } | undefined, brand: Brand | null): Background {
  if (background !== undefined && 'file' in background) return { kind: 'image', file: background.file };
  const colour = background?.colour ?? brand?.colors.background;
  if (colour === undefined) return { kind: 'gradient', from: '#0F172A', to: '#1E293B' };
  return { kind: 'gradient', from: colour, to: brand === null ? colour : mixed(colour, brand.colors.primary, 0.18) };
}

const seconds = (ms: number): string => (ms / 1000).toFixed(3);

/** ffmpeg's input for the background, `lengthMs` long at the video's 60 frames a second. */
export function backgroundInput(background: Background, size: Size, lengthMs: number): string[] {
  const { width, height } = size;
  if (background.kind === 'image') return ['-loop', '1', '-framerate', String(videoFramesPerSecond), '-t', seconds(lengthMs), '-i', background.file];
  const hex = (colour: string): string => `0x${colour.slice(1)}`;
  // The gradient's first frame, repeated, so it never moves: ffmpeg before 7 refuses `speed=0`.
  const gradient = `gradients=s=${String(width)}x${String(height)}:r=${String(videoFramesPerSecond)}:c0=${hex(background.from)}:c1=${hex(background.to)}:x0=0:y0=0:x1=${String(width)}:y1=${String(height)}:n=2`;
  return ['-f', 'lavfi', '-t', seconds(lengthMs), '-i', `${gradient},trim=end_frame=1,loop=loop=-1:size=1`];
}

/** The filter that makes the background input the picture's size. */
export function backgroundFit(background: Background, size: Size): string {
  const { width, height } = size;
  const fit = background.kind === 'image' ? `scale=${String(width)}:${String(height)}:force_original_aspect_ratio=increase,crop=${String(width)}:${String(height)},` : '';
  return `${fit}fps=${String(videoFramesPerSecond)},format=yuv420p`;
}
