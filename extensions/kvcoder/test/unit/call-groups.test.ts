import { describe, expect, it } from 'vitest';
import { olderCount, withCallingReply } from '../../src/turns/call-groups.ts';

const message = (seq: number, kind: string) => ({ seq, kind });
const seqs = (messages: readonly { seq: number }[]): number[] => messages.map((found) => found.seq);

describe("a reply's calls and their results stay together (08 §8.1, ADR 0036, 16 and 17)", () => {
  it('QA48-E19 the kept messages never start at a tool result', () => {
    const messages = [message(0, 'user'), message(1, 'assistant'), message(2, 'toolResult'), message(3, 'toolResult'), message(4, 'toolResult'), message(5, 'assistant')];
    expect([1, 2, 3, 4, 5, 6, 9].map((keep) => olderCount(messages, keep))).toEqual([5, 1, 1, 1, 1, 0, 0]);
    expect(olderCount([message(0, 'toolResult'), message(1, 'toolResult')], 1)).toBe(0);
  });

  it('QA48-E20 a history that starts at a tool result starts at the reply that made its call, with the results before it', () => {
    const before = [message(384, 'user'), message(385, 'toolResult'), message(386, 'assistant'), message(387, 'toolResult')];
    const after = [message(388, 'toolResult'), message(389, 'toolResult'), message(391, 'assistant')];
    expect(seqs(withCallingReply(before, after))).toEqual([386, 387, 388, 389, 391]);
    expect(seqs(withCallingReply([message(386, 'assistant')], after))).toEqual([386, 388, 389, 391]);
    expect(seqs(withCallingReply(before, [message(388, 'user'), message(389, 'assistant')]))).toEqual([388, 389]);
    expect(seqs(withCallingReply([message(387, 'user')], after))).toEqual([388, 389, 391]);
    expect(seqs(withCallingReply([], after))).toEqual([388, 389, 391]);
  });
});
