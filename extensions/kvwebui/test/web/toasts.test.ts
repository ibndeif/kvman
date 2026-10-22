import { describe, expect, it } from 'vitest';
import { createToasts } from '../../web/src/state/toasts.ts';

// Toasts (06 §6.5, ADR 0009, 75; ADR 0101, 14).
describe('toasts (ADR 0101, 14)', () => {
  it('M4.7-H12 a toast like one that is open is not added again', () => {
    const toasts = createToasts();
    toasts.show({ text: 'notes.errors.NOPE', params: {}, level: 'error' });
    toasts.show({ text: 'notes.errors.NOPE', params: {}, level: 'error' });
    toasts.show({ text: 'notes.errors.LOCKED', params: { name: 'a' }, level: 'error' });
    toasts.show({ text: 'notes.errors.LOCKED', params: { name: 'b' }, level: 'error' });
    expect(toasts.list.map((toast) => [toast.text, toast.params])).toEqual([
      ['notes.errors.NOPE', {}],
      ['notes.errors.LOCKED', { name: 'a' }],
      ['notes.errors.LOCKED', { name: 'b' }],
    ]);
    const first = toasts.list[0];
    if (first !== undefined) toasts.close(first.id);
    toasts.show({ text: 'notes.errors.NOPE', params: {}, level: 'error' });
    expect(toasts.list).toHaveLength(3);
  });
});
