import { describe, expect, it } from 'vitest';
import { filesDigest, TrustTokens } from '../../src/index.ts';

const workspaceId = 'a'.repeat(64);
const files = [{ path: '.kvman/rules/a.md', sha256: 'b'.repeat(64) }];

describe('trust tokens (plan 03 §3.8, ADR 0137)', () => {
  it('M2.5-E33 only an unexpired, unchanged token of this key verifies, for its own workspace and files', () => {
    const clock = { now: 1_000 };
    const tokens = new TrustTokens(() => clock.now);
    const token = tokens.issue(workspaceId, files);
    const claims = tokens.verify(token);
    expect(claims).toEqual({ workspaceId, digest: filesDigest(files), expiresAt: 1_000 + 10 * 60_000 });
    expect(claims?.digest).not.toBe(filesDigest([{ path: '.kvman/rules/a.md', sha256: 'c'.repeat(64) }]));
    expect(claims?.workspaceId).not.toBe('d'.repeat(64));
    expect(new TrustTokens(() => clock.now, Buffer.alloc(32, 1)).verify(token)).toBeUndefined();
    const flipped = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
    expect(tokens.verify(flipped)).toBeUndefined();
    const [body = ''] = token.split('.');
    expect([tokens.verify(`${body}.`), tokens.verify('not-a-token'), tokens.verify(`${token}.x`)]).toEqual([undefined, undefined, undefined]);
    clock.now += 10 * 60_000;
    expect(tokens.verify(token)).toEqual(claims);
    clock.now += 1;
    expect(tokens.verify(token)).toBeUndefined();
  });
});
