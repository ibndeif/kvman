// OpenUI Lang skips an optional argument with `null` (`Image("alt", null)`), and the parser keeps that `null` in the
// props (plan 06 §6.1, ADR 0124, 4). Each renderer reads a skipped prop as left out, so the props reach it with every
// `null`-valued key removed, through child elements, arrays, and objects; an array keeps its `null` items, as a table
// column's data keeps its empty cells.

/** `value` with every `null`-valued object key removed, at every depth. */
export function withoutSkipped(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSkipped);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]: [string, unknown]) => (entry === null ? [] : [[key, withoutSkipped(entry)]])));
}
