import { describe, expect, it } from 'vitest';
import { crashAndRecover, faultTests } from './crash-harness.ts';
import { committedWhole } from './invariants.ts';
import { accountOf, messageOf, messagesOf, postings, runningLedgerMessages } from './ledger-database.ts';
import { runQueuedLaneWorkload } from './ledger-workload.ts';

describe('crashes around a unit of work\'s commit (plan 04 §4.2, 14 §14.3, ADR 0100)', faultTests, () => {
  it('M1.9-H8 uow.before-commit: a unit of work that did not commit leaves no trace and commits once on redelivery', async () => {
    const run = await crashAndRecover('uow.before-commit@2', {
      atCrash: (connection) => {
        committedWhole(connection);
        return runningLedgerMessages(connection);
      },
    });
    expect(run.crashed.length).toBeGreaterThan(0);
    for (const message of run.crashed) expect(run.read((connection) => messageOf(connection, message.id))).toMatchObject({ state: 'done', attempts: 1 });
  });

  it('M1.9-H9 uow.after-commit-before-notify: a committed unit is kept and its client gets the stored reply', async () => {
    const run = await crashAndRecover('uow.after-commit-before-notify@2', {
      atCrash: (connection) => {
        committedWhole(connection);
        return messagesOf(connection, 'ledger.post').filter((post) => post.state === 'done');
      },
    });
    expect(run.crashed.length).toBeGreaterThan(0);
    for (const post of run.crashed) {
      expect(run.read((connection) => messageOf(connection, post.id))).toMatchObject({ state: 'done', attempts: 0, result: post.result });
      const answered = [...run.client.submitted.values()].find((submitted) => submitted.id === post.id);
      expect(answered?.answer.json).toEqual({ id: post.id, reply: post.result?.ok === true ? post.result.value : undefined });
    }
  });

  it('M1.9-E7 a crash mid-lane keeps the lane\'s later posts behind the recovered one', async () => {
    const run = await crashAndRecover('uow.before-commit', {
      workload: runQueuedLaneWorkload,
      atCrash: (connection) => {
        committedWhole(connection);
        return messagesOf(connection, 'ledger.post').filter((post) => accountOf(post) === 'a');
      },
    });
    expect(run.crashed.map((post) => [post.payload, post.state])).toEqual([
      [{ account: 'a', n: 1 }, 'running'], [{ account: 'a', n: 2 }, 'pending'], [{ account: 'a', n: 3 }, 'pending'], [{ account: 'a', n: 4 }, 'pending'],
    ]);
    expect(run.read((connection) => messageOf(connection, run.crashed[0]?.id ?? ''))).toMatchObject({ state: 'done', attempts: 1 });
    expect(run.read(postings).filter((entry) => entry.account === 'a').map((entry) => entry.messageId)).toEqual(run.crashed.map((post) => post.id));
  });
});
