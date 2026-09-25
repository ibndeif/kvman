import type { Connection } from '@kvman/kernel';
import { messageStatusSchema, type MessageStatus } from '@kvman/protocol';
import { expect, vi } from 'vitest';
import { send } from '../adapters/http-client.ts';
import { launchKernel, temporaryHome } from '../child-kernel/launch.ts';
import { checkInvariants } from './invariants.ts';
import { inspect } from './ledger-database.ts';
import { KernelGone, LedgerClient, runLedgerWorkload } from './ledger-workload.ts';

// 14 §14.2: a kernel process runs the ledger workload until it dies at its fault point (ADR 0100); it restarts on
// the same home without faults, the client sends everything again with its keys, and once all has settled and the
// kernel stopped, the invariants are checked in the database file.

export const faultTests = { timeout: 90_000 } as const;

export type CrashRun<Crashed> = {
  home: string;
  crashed: Crashed;
  client: LedgerClient;
  statuses: ReadonlyMap<string, MessageStatus>;
  read<Result>(read: (connection: Connection) => Result): Result;
};

export type CrashOptions<Crashed> = {
  // What the database file holds between the crash and the restart.
  atCrash: (connection: Connection) => Crashed;
  beforeWorkload?: (port: number) => Promise<void>;
  afterRestart?: (port: number) => Promise<void>;
  workload?: (client: LedgerClient) => Promise<void>;
};

const finalStates = new Set(['done', 'failed', 'dead', 'cancelled']);

async function runUntilKilled<Crashed>(home: string, faults: string, options: CrashOptions<Crashed>): Promise<void> {
  const kernel = await launchKernel({ home, fixture: 'ledger', faults });
  await options.beforeWorkload?.(kernel.port);
  const outcome = await (options.workload ?? runLedgerWorkload)(new LedgerClient(kernel.port)).then(
    () => 'finished',
    (error: unknown) => {
      if (error instanceof KernelGone) return 'kernel gone';
      throw error;
    },
  );
  expect(outcome, `the kernel never reached ${faults}`).toBe('kernel gone');
  expect(await kernel.exited).toEqual({ code: null, signal: 'SIGKILL' });
}

async function settledStatus(port: number, id: string): Promise<MessageStatus> {
  return vi.waitFor(async () => {
    const status = messageStatusSchema.parse((await send(port, 'GET', `/api/v1/messages/${id}`)).json);
    expect(finalStates.has(status.state), `${status.type} ${id} is ${status.state}`).toBe(true);
    return status;
  }, { timeout: 20_000, interval: 20 });
}

export async function crashAndRecover<Crashed>(faults: string, options: CrashOptions<Crashed>): Promise<CrashRun<Crashed>> {
  const home = temporaryHome();
  await runUntilKilled(home, faults, options);
  const crashed = inspect(home, options.atCrash);
  const kernel = await launchKernel({ home, fixture: 'ledger' });
  await options.afterRestart?.(kernel.port);
  const client = new LedgerClient(kernel.port);
  await (options.workload ?? runLedgerWorkload)(client);
  const statuses = new Map<string, MessageStatus>();
  for (const { key, id } of client.submitted.values()) statuses.set(key, await settledStatus(kernel.port, id));
  expect(await kernel.stop()).toEqual({ code: 0, signal: null });
  inspect(home, (connection) => checkInvariants(connection, client, statuses));
  return { home, crashed, client, statuses, read: (read) => inspect(home, read) };
}
