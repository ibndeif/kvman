// One byte range of a download (plan 04 §4.1, ADR 0107, 13), so a video can seek: `bytes=<first>-<last>`,
// `bytes=<first>-`, or `bytes=-<suffix length>`. Anything else is the whole file.

/** What a download answers for its `Range` header. */
export type RangeAnswer = { kind: 'whole' } | { kind: 'part'; first: number; last: number } | { kind: 'unsatisfiable' };

const single = /^bytes=(\d*)-(\d*)$/;

export function rangeOf(header: string | undefined, size: number): RangeAnswer {
  const match = header === undefined ? null : single.exec(header.trim());
  if (match === null) return { kind: 'whole' };
  const [, from = '', to = ''] = match;
  if (from === '' && to === '') return { kind: 'whole' };
  if (from === '') {
    const suffix = Number(to);
    return suffix === 0 || size === 0 ? { kind: 'unsatisfiable' } : { kind: 'part', first: Math.max(0, size - suffix), last: size - 1 };
  }
  const first = Number(from);
  if (to !== '' && Number(to) < first) return { kind: 'whole' };
  if (first >= size) return { kind: 'unsatisfiable' };
  return { kind: 'part', first, last: to === '' ? size - 1 : Math.min(Number(to), size - 1) };
}
