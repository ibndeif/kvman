// Where a short list opens (ADR 0101, 15): toward the inline end of its button, unless it would then pass the end of the
// area that holds it; then toward the inline start.

export type Edges = { left: number; right: number };

/** Whether a list opened toward the inline end passes that end of its area. */
export function passesEnd(list: Edges, area: Edges, rightToLeft: boolean): boolean {
  return rightToLeft ? list.left < area.left : list.right > area.right;
}
