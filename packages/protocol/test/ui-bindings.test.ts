import { describe, expect, it } from 'vitest';
import { bindingProblems, isBindingText, parseBindingPath } from '../src/index.ts';

describe('binding paths (plan 08 §8.7, ADR 0026)', () => {
  it('M0.4-E1 valid paths parse into root and segments', () => {
    expect(parseBindingPath('$item')).toEqual({ ok: true, path: { root: 'item', segments: [] } });
    expect(parseBindingPath('$value')).toEqual({ ok: true, path: { root: 'value', segments: [] } });
    expect(parseBindingPath('$query.files.items.0.name')).toEqual({ ok: true, path: { root: 'query', segments: ['files', 'items', '0', 'name'] } });
    expect(parseBindingPath('$query.files.items.length')).toMatchObject({ ok: true, path: { segments: ['files', 'items', 'length'] } });
    expect(parseBindingPath('$t.files.title')).toEqual({ ok: true, path: { root: 't', segments: ['files', 'title'] } });
    expect(parseBindingPath('$locale.dir')).toMatchObject({ ok: true });
    expect(parseBindingPath('$slot.sessionId')).toMatchObject({ ok: true });
  });

  it('M0.4-E2 malformed paths are rejected', () => {
    for (const path of ['$', '$unknown.x', '$query', '$t', '$item..name', '$item.name()', '$item.items.01', '$item.na me']) {
      expect(parseBindingPath(path).ok, path).toBe(false);
    }
  });

  it('M0.4-E3 $$ escapes a literal dollar', () => {
    expect(isBindingText('$$5')).toBe(false);
    expect(bindingProblems('$$5')).toEqual([]);
    expect(isBindingText('$item.price')).toBe(true);
  });

  it('M0.4-E4 interpolated paths are checked', () => {
    expect(bindingProblems('{{ $query.files.total }} files')).toEqual([]);
    expect(bindingProblems('{{ $query..total }} files')).toHaveLength(1);
    expect(bindingProblems('pdf.progress.updated:{{ $item.id }}')).toEqual([]);
  });
});
