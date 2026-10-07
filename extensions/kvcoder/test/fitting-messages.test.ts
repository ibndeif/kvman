import { describe, expect, it } from 'vitest';
import { jsonBytes, newestThatFit } from '../src/messages/fitting-messages.ts';

const message = (seq: number) => ({ seq, text: 'x'.repeat(400 - jsonBytes({ seq, text: '' })) });

describe('the messages that fit in a list (08 §8.1, ADR 0033, 3)', () => {
  it('QA45-E1 the newest that fit are kept, queued messages take from the room, and the newest one always stays', () => {
    const messages = [1, 2, 3, 4, 5].map(message);
    expect(messages.map(jsonBytes)).toEqual([400, 400, 400, 400, 400]);
    const each = 401;
    expect(newestThatFit(messages, 3 * each).map((kept) => kept.seq)).toEqual([3, 4, 5]);
    expect(newestThatFit(messages, 3 * each - 1).map((kept) => kept.seq)).toEqual([4, 5]);
    expect(newestThatFit(messages, 3 * each - jsonBytes(message(9))).map((kept) => kept.seq)).toEqual([4, 5]);
    expect(newestThatFit(messages, 100 * each).map((kept) => kept.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(newestThatFit(messages, 0).map((kept) => kept.seq)).toEqual([5]);
    expect(newestThatFit([], 1000)).toEqual([]);
  });
});
