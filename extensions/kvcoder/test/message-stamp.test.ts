import { describe, expect, it } from 'vitest';
import { messageStamp } from '../src/turns/message-stamp.ts';

describe("the date line of a person's message (08 §8.2, ADR 0032, 5)", () => {
  it('QA44-E3 the stamp has the weekday, the date and time at the offset, and the offset', () => {
    const sent = '2026-10-07T01:55:53.848Z';
    expect(messageStamp(sent, 180)).toBe('[Wednesday 2026-10-07 04:55 +03:00]');
    expect(messageStamp(sent, 0)).toBe('[Wednesday 2026-10-07 01:55 +00:00]');
    expect(messageStamp(sent, -420)).toBe('[Tuesday 2026-10-06 18:55 -07:00]');
    expect(messageStamp(sent, 330)).toBe('[Wednesday 2026-10-07 07:25 +05:30]');
    expect(messageStamp('2026-12-31T23:30:00.000Z', 60)).toBe('[Friday 2027-01-01 00:30 +01:00]');
  });
});
