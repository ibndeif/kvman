import { describe, expect, it } from 'vitest';
import { attachment } from '../../src/http/file-routes.ts';

describe('downloads are attachments (04 §4.1, ADR 0009, 38)', () => {
  it('M1.7-E12 a name becomes an ASCII filename and the UTF-8 filename*', () => {
    expect(attachment('nöte "x".html')).toBe(`attachment; filename="n_te _x_.html"; filename*=UTF-8''n%C3%B6te%20%22x%22.html`);
    expect(attachment('plain.txt')).toBe(`attachment; filename="plain.txt"; filename*=UTF-8''plain.txt`);
  });
});
