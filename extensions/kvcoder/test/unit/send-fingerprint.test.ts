import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sentBy } from '../../src/messages/send-receipt.ts';

// A send's fingerprint (ADR 0048) adds the files named again only when there are some (ADR 0118, 6).

describe("a send's fingerprint (ADR 0118)", () => {
  it('QA77-E18 without attachments it is the fingerprint from before ADR 0118, and with them it differs', () => {
    const before = createHash('sha256').update(JSON.stringify(['hi', ['f1']])).digest('hex');
    expect(sentBy('s', 'chat', 'hi', ['f1']).messageFingerprint).toBe(before);
    expect(sentBy('s', 'chat', 'hi', ['f1'], []).messageFingerprint).toBe(before);
    expect(sentBy('s', 'chat', 'hi', ['f1'], ['attachments/a.txt']).messageFingerprint).not.toBe(before);
  });
});
