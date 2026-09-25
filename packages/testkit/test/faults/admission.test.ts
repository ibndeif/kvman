import { describe, expect, it } from 'vitest';
import { faultTests, crashAndRecover } from './crash-harness.ts';
import { messagesOf } from './ledger-database.ts';

describe('crashes around admission (plan 14 §14.3, ADR 0100)', faultTests, () => {
  it('M1.9-H1 admit.before-commit: the admitted command is lost with the crash and stored once by the client\'s retry', async () => {
    const run = await crashAndRecover('admit.before-commit', { atCrash: (connection) => messagesOf(connection, 'ledger.post') });
    expect(run.crashed).toEqual([]);
    expect(run.read((connection) => messagesOf(connection, 'ledger.post').filter((post) => post.state === 'done'))).toHaveLength(13);
  });

  it('M1.9-H2 admit.after-commit: the stored command is not stored twice when its client retries', async () => {
    const run = await crashAndRecover('admit.after-commit', { atCrash: (connection) => messagesOf(connection, 'ledger.post') });
    expect(run.crashed.length).toBeGreaterThan(0);
    expect(new Set(run.crashed.map((post) => post.state))).toEqual(new Set(['running']));
    const answered = new Map([...run.client.submitted.values()].map((submitted) => [submitted.id, submitted.answer.status]));
    const after = run.read((connection) => messagesOf(connection, 'ledger.post'));
    for (const stored of run.crashed) {
      expect(answered.get(stored.id), `the retry of ${stored.id}`).toBe(200);
      expect(after.filter((post) => post.id === stored.id)).toMatchObject([{ state: 'done', attempts: 1 }]);
    }
    expect(after).toHaveLength(13);
  });
});
