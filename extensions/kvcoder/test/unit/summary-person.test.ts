import { describe, expect, it } from 'vitest';
import { messageLimit, personLimit, personMessages, storedPerson } from '../../src/turns/summary-facts.ts';

const said = (text: string, minute: number, source: { kind: 'user' } | { kind: 'job'; jobId: string } = { kind: 'user' }) => ({ kind: 'user' as const, source, content: { role: 'user', content: text }, createdAt: `2026-10-11T05:${String(minute).padStart(2, '0')}:00.000Z` });

describe("the person's messages a summary keeps (ADR 0066, 2 and 4)", () => {
  it('M2.4-E236 a second summary carries the first one on, a long message is cut, and the oldest leave past the limit', () => {
    const first = personMessages([], [said('Build the app.', 1), said('The background call finished', 2, { kind: 'job', jobId: 'j1' }), { ...said('an answer', 3), kind: 'assistant' as const }, said('Everything must be right to left.', 4)]);
    expect(first).toEqual({ kept: [{ at: '2026-10-11T05:01:00.000Z', text: 'Build the app.' }, { at: '2026-10-11T05:04:00.000Z', text: 'Everything must be right to left.' }], left: 0 });
    expect(storedPerson({ content: { text: 'S', person: first.kept } })).toEqual(first.kept);
    expect(storedPerson({ content: { text: 'S' } })).toEqual([]);
    expect(storedPerson(undefined)).toEqual([]);

    const second = personMessages(first.kept, [said('x'.repeat(messageLimit + 50), 9)]);
    expect(second.kept.map((message) => message.text.length)).toEqual([14, 33, messageLimit + 1]);
    expect(second.kept.at(-1)?.text.endsWith('…')).toBe(true);

    const many = Array.from({ length: 8 }, (_message, index) => said(String(index).repeat(messageLimit), 10 + index));
    const long = personMessages(first.kept, many);
    expect(long.left).toBe(4);
    expect(long.kept.map((message) => message.text[0])).toEqual(['2', '3', '4', '5', '6', '7']);
    expect(long.kept.reduce((sum, message) => sum + message.text.length, 0)).toBeLessThanOrEqual(personLimit);
  });
});
