import { describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { isOwnAddress, recordableAddress } from '../../src/record/address.ts';

const failure = (address: string, ownPort: number | null = null): unknown => {
  try {
    recordableAddress(address, ownPort);
    return undefined;
  } catch (error) {
    return error instanceof ProblemError ? error.problem.code : error;
  }
};

describe('the addresses a recording may open (16 §16.5, ADR 0115, 56)', () => {
  it('M5.5-H1 any http or https address passes, on any host', () => {
    for (const address of ['https://example.com/', 'http://192.168.1.5:3000/a', 'http://localhost:5173', 'https://[::1]/']) {
      expect(failure(address)).toBeUndefined();
      expect(failure(address, 3737)).toBeUndefined();
    }
  });

  it('M5.5-E1 credentials, another scheme, or no address fail', () => {
    for (const address of ['http://user:pass@example.com/', 'ftp://example.com/', 'file:///etc/hosts', 'not an address']) expect(failure(address)).toBe('VALIDATION_FAILED');
  });

  it("M5.5-E2 kvman's own port on a local host is refused, another port passes", () => {
    expect(failure('http://127.0.0.1:3737/', 3737)).toBe('VALIDATION_FAILED');
    expect(failure('http://localhost:3737/x', 3737)).toBe('VALIDATION_FAILED');
    expect(failure('http://localhost:3738/', 3737)).toBeUndefined();
    expect(failure('http://localhost/', 80)).toBe('VALIDATION_FAILED');
  });

  it("M5.2-E3 a request to kvman's port is kvman's own on any name of this computer, and none is without a port", () => {
    expect(isOwnAddress(new URL('http://localhost:3737/api'), null)).toBe(false);
    for (const alias of ['http://0.0.0.0:3737/', 'http://127.0.0.2:3737/', 'http://[::ffff:127.0.0.1]:3737/', 'http://LOCALHOST.:3737/', 'http://app.localhost:3737/']) expect(isOwnAddress(new URL(alias), 3737)).toBe(true);
    expect(isOwnAddress(new URL('http://127.0.0.1:3738/'), 3737)).toBe(false);
  });
});
