// The width of the panel beside the conversation, as the person drags it (plan 08 §8.7, ADR 0071, 4): kept in the
// browser as a whole number of pixels, and held between 20 rem and 70% of the chat area.

/** Where the browser keeps the panel's width. */
export const panelWidthKey = 'kvcoder.panelWidth';
/** The least the panel is wide, in rem. */
export const narrowestRem = 20;
/** The most of the chat area the panel takes. */
export const widestShare = 0.7;
/** How far an arrow key moves the panel's edge, in pixels. */
export const keyStepPx = 16;

export type WidthLimits = { least: number; most: number };
export type Direction = 'ltr' | 'rtl';

/** The kept width, when what the browser holds is a whole number. */
export function storedWidth(text: string | null): number | undefined {
  return text !== null && /^\d+$/.test(text) ? Number(text) : undefined;
}

/** The least and most the panel is wide in a chat area of `stagePx`. */
export function widthLimits(stagePx: number, remPx: number): WidthLimits {
  const least = narrowestRem * remPx;
  return { least, most: Math.max(least, Math.round(stagePx * widestShare)) };
}

/** `px` as a whole number within the limits. */
export function limitedWidth(px: number, limits: WidthLimits): number {
  return Math.min(Math.max(Math.round(px), limits.least), limits.most);
}

/** The panel's width with its edge under the pointer: the panel is at the inline end, and its handle is its inline start. */
export function draggedWidth(pointerX: number, panel: { left: number; right: number }, direction: Direction): number {
  return direction === 'rtl' ? pointerX - panel.left : panel.right - pointerX;
}

/** The panel's width after an arrow key moved its edge toward the side the key points to; no width for another key. */
export function keyWidth(current: number, key: string, direction: Direction): number | undefined {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return undefined;
  const widens = (key === 'ArrowLeft') === (direction === 'ltr');
  return current + (widens ? keyStepPx : -keyStepPx);
}
