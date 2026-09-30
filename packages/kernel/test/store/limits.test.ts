import { describe, expect, it } from 'vitest';
import { documentLimitBytes } from '../../src/limits.ts';
import { useTemporaryHomes } from '../temporary-home.ts';
import { note, storeOf } from './store-under-test.ts';

const newHome = useTemporaryHomes();

// JSON adds the quotes and the field name around the text, so this text alone keeps the document over the limit.
const overLimitText = 'x'.repeat(documentLimitBytes);

describe('store limits (02 §2.13)', () => {
  it('M1.3-H4 a document over 16 MiB fails TOO_LARGE, and nothing is stored', async () => {
    const notes = storeOf(newHome()).collection('notes', note);
    await expect(notes.insert({ text: overLimitText })).rejects.toMatchObject({ problem: { code: 'TOO_LARGE', params: { limit: documentLimitBytes } } });
    expect(await notes.count({})).toBe(0);
    const stored = await notes.insert({ text: 'small' });
    await expect(notes.update(stored.id, { text: overLimitText })).rejects.toMatchObject({ problem: { code: 'TOO_LARGE' } });
    expect((await notes.get(stored.id))?.text).toBe('small');
  });

  it('M1.3-E2 kv round-trips JSON, a missing key is undefined, and a value over 16 MiB fails', async () => {
    const kv = storeOf(newHome()).kv;
    expect(await kv.get('missing')).toBeUndefined();
    await kv.set('draft', { lines: ['a', 'b'], count: 2, open: true, parent: null });
    expect(await kv.get('draft')).toEqual({ lines: ['a', 'b'], count: 2, open: true, parent: null });
    await kv.set('draft', 'replaced');
    expect(await kv.get('draft')).toBe('replaced');
    await kv.delete('draft');
    expect(await kv.get('draft')).toBeUndefined();
    await expect(kv.set('big', overLimitText)).rejects.toMatchObject({ problem: { code: 'TOO_LARGE', params: { limit: documentLimitBytes } } });
  });
});
