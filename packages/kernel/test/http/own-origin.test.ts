import { describe, expect, it } from 'vitest';
import { isOwnOrigin } from '../../src/http/own-origin.ts';

describe('the Host and Origin check (04 §4.2)', () => {
  it('M1.7-E6 only 127.0.0.1 and localhost on kvman\'s port pass', () => {
    expect(isOwnOrigin('127.0.0.1:3737', undefined, 3737)).toBe(true);
    expect(isOwnOrigin('localhost:3737', undefined, 3737)).toBe(true);
    expect(isOwnOrigin('127.0.0.1:3738', undefined, 3737)).toBe(false);
    expect(isOwnOrigin('evil.com:3737', undefined, 3737)).toBe(false);
    expect(isOwnOrigin(undefined, undefined, 3737)).toBe(false);
  });

  it('M1.7-E7 an Origin must be http:// plus the same Host', () => {
    expect(isOwnOrigin('localhost:3737', 'http://localhost:3737', 3737)).toBe(true);
    expect(isOwnOrigin('localhost:3737', 'http://127.0.0.1:3737', 3737)).toBe(false);
    expect(isOwnOrigin('localhost:3737', 'https://localhost:3737', 3737)).toBe(false);
    expect(isOwnOrigin('localhost:3737', 'null', 3737)).toBe(false);
    expect(isOwnOrigin('localhost:3737', 'http://evil.com', 3737)).toBe(false);
  });
});
