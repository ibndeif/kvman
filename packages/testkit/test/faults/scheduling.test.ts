import { describe, expect, it } from 'vitest';
import { bootUntilExit, launchKernel, temporaryHome } from '../child-kernel/launch.ts';
import { crashAndRecover, faultTests } from './crash-harness.ts';
import { committedWhole } from './invariants.ts';
import { countOf, inspect, messageOf, messagesOf, postings, runningLedgerMessages } from './ledger-database.ts';
import { KernelGone, LedgerClient } from './ledger-workload.ts';

function crashedRunning(connection: Parameters<typeof committedWhole>[0]): ReturnType<typeof runningLedgerMessages> {
  committedWhole(connection);
  const running = runningLedgerMessages(connection);
  const posted = postings(connection).map((entry) => entry.messageId);
  for (const message of running) expect(posted).not.toContain(message.id);
  return running;
}

describe('crashes around claims and invokes (plan 14 §14.3, ADRs 0091, 0100)', faultTests, () => {
  it('M1.9-H3 claim.after: a claimed message is recovered and runs once', async () => {
    const run = await crashAndRecover('claim.after@3', { atCrash: crashedRunning });
    expect(run.crashed.length).toBeGreaterThan(0);
    for (const message of run.crashed) expect(run.read((connection) => messageOf(connection, message.id))).toMatchObject({ state: 'done', attempts: 1 });
  });

  it('M1.9-H4 invoke.before: a message that never reached its host is recovered and runs once', async () => {
    const run = await crashAndRecover('invoke.before@5', { atCrash: crashedRunning });
    expect(run.crashed.length).toBeGreaterThan(0);
    for (const message of run.crashed) expect(run.read((connection) => messageOf(connection, message.id))).toMatchObject({ state: 'done', attempts: 1 });
  });

  it('M1.9-E6 a message that kills the kernel on every attempt ends dead after maxAttempts crashes', async () => {
    const home = temporaryHome();
    const first = await launchKernel({ home, fixture: 'ledger', faults: 'invoke.before' });
    await expect(new LedgerClient(first.port).submit('fragile', 'ledger.fragile', { id: 'f' })).rejects.toBeInstanceOf(KernelGone);
    expect(await first.exited).toEqual({ code: null, signal: 'SIGKILL' });
    expect(inspect(home, (connection) => messagesOf(connection, 'ledger.fragile'))).toMatchObject([{ state: 'running', attempts: 0 }]);
    expect(await bootUntilExit({ home, fixture: 'ledger', faults: 'invoke.before' })).toEqual({ code: null, signal: 'SIGKILL' });
    expect(inspect(home, (connection) => messagesOf(connection, 'ledger.fragile'))).toMatchObject([{ state: 'running', attempts: 1 }]);
    const last = await launchKernel({ home, fixture: 'ledger' });
    expect(await last.stop()).toEqual({ code: 0, signal: null });
    const [fragile] = inspect(home, (connection) => messagesOf(connection, 'ledger.fragile'));
    expect(fragile).toMatchObject({ state: 'dead', attempts: 2, result: { ok: false, problem: { code: 'MESSAGE_DEAD' } } });
    const dead = inspect(home, (connection) => countOf(connection, "SELECT count(*) AS count FROM events WHERE type = 'kernel.message.dead-lettered' AND payload LIKE ?", `%${fragile?.id ?? ''}%`));
    expect(dead).toBe(1);
  });
});
