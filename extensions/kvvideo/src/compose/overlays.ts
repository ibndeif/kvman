import type { Rect, Size } from './frame-layout.ts';

// The overlays on a recorded page (plan 16 §16.8; ADR 0115, 11), applied to the page before the camera and the frame,
// in the recording's own pixels: a callout's image fades in and out over 200 ms, a highlight's image is shown, and a
// blur blurs its box with a strength of 20 px, each between its `fromMs` and `toMs` from the scene's start.

export type PlacedOverlay = { kind: 'callout' | 'highlight'; fromMs: number; toMs: number; input: number } | { kind: 'blur'; fromMs: number; toMs: number; box: Rect };

const seconds = (ms: number): string => (ms / 1000).toFixed(3);

const shown = (overlay: PlacedOverlay): string => `enable='between(t,${seconds(overlay.fromMs)},${seconds(overlay.toMs)})'`;

/** A box kept inside the page, at least 2 × 2 pixels. */
export function insidePage(box: Rect, page: Size): Rect {
  const x = Math.min(Math.max(0, Math.round(box.x)), page.width - 2);
  const y = Math.min(Math.max(0, Math.round(box.y)), page.height - 2);
  return { x, y, width: Math.max(2, Math.min(Math.round(box.width), page.width - x)), height: Math.max(2, Math.min(Math.round(box.height), page.height - y)) };
}

function overlayFilter(overlay: PlacedOverlay, from: string, to: string, index: number): string[] {
  if (overlay.kind === 'blur') {
    const { x, y, width, height } = overlay.box;
    const [whole, part, blurred] = [`ow${String(index)}`, `op${String(index)}`, `ob${String(index)}`];
    return [`[${from}]split[${whole}][${part}]`, `[${part}]crop=${String(width)}:${String(height)}:${String(x)}:${String(y)},gblur=sigma=20[${blurred}]`, `[${whole}][${blurred}]overlay=${String(x)}:${String(y)}:${shown(overlay)}[${to}]`];
  }
  const image = `oi${String(index)}`;
  const fades = overlay.kind === 'callout' ? `,fade=t=in:st=${seconds(overlay.fromMs)}:d=0.2:alpha=1,fade=t=out:st=${seconds(Math.max(overlay.fromMs, overlay.toMs - 200))}:d=0.2:alpha=1` : '';
  return [`[${String(overlay.input)}:v]format=rgba${fades}[${image}]`, `[${from}][${image}]overlay=0:0:${shown(overlay)}[${to}]`];
}

/** The filters that lay the overlays on the stream `input`, in order, and the stream they end in. */
export function overlayFilters(input: string, overlays: readonly PlacedOverlay[]): { filters: string[]; output: string } {
  let current = input;
  const filters: string[] = [];
  for (const [index, overlay] of overlays.entries()) {
    const next = `oo${String(index)}`;
    filters.push(...overlayFilter(overlay, current, next, index));
    current = next;
  }
  return { filters, output: current };
}
