import { describe, expect, it } from 'vitest';
import { crashAndRecover, faultTests } from './crash-harness.ts';
import { accountOf, messageOf, messagesOf } from './ledger-database.ts';

describe('crashes in request/reply (plan 02 §2.8, 14 §14.3, ADR 0100)', faultTests, () => {
  it('M1.9-H7 command.after-send: a redelivered caller re-awaits its stored command', async () => {
    const run = await crashAndRecover('command.after-send', {
      atCrash: (connection) => {
        const [transfer] = messagesOf(connection, 'ledger.transfer');
        return { transfer, called: messagesOf(connection, 'ledger.post').filter((post) => post.idempotencyKey === `${transfer?.id ?? ''}:command:1`) };
      },
    });
    expect(run.crashed.transfer).toMatchObject({ state: 'running' });
    expect(run.crashed.called).toHaveLength(1);
    const called = run.read((connection) => messageOf(connection, run.crashed.called[0]?.id ?? ''));
    const transfer = run.read((connection) => messageOf(connection, run.crashed.transfer?.id ?? ''));
    expect(called.result).toEqual({ ok: true, value: { balance: 1 } });
    expect(transfer).toMatchObject({ state: 'done', attempts: 1, result: { ok: true, value: { posted: { balance: 1 } } } });
    expect(run.read((connection) => messagesOf(connection, 'ledger.post').filter((post) => accountOf(post) === 't'))).toHaveLength(1);
  });

  it('M1.9-H10 defer.before-reply: a deferred command is answered exactly once after the crash', async () => {
    const run = await crashAndRecover('defer.before-reply', {
      atCrash: (connection) => ({ holds: messagesOf(connection, 'ledger.hold'), releases: messagesOf(connection, 'ledger.release') }),
    });
    expect(run.crashed.holds).toMatchObject([{ state: 'awaiting' }]);
    expect(run.crashed.releases).toMatchObject([{ state: 'running' }]);
    expect(run.read((connection) => messagesOf(connection, 'ledger.hold'))).toMatchObject([{ state: 'done', result: { ok: true, value: { released: true } } }]);
    expect(run.read((connection) => messagesOf(connection, 'ledger.release'))).toMatchObject([{ state: 'done', attempts: 1 }]);
  });
});
