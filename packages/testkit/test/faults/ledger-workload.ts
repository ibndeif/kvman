import { commandAcceptedResponseSchema, commandReplyResponseSchema, problemSchema, type JsonObject } from '@kvman/protocol';
import { send, type HttpAnswer } from '../adapters/http-client.ts';
import { fixtureWorkspace } from '../child-kernel/workspace.ts';

// The ledger workload of M1.9 (see milestones/M1.9-TEST-CASES.md): phases in order, each waiting for its replies,
// with fixed idempotency keys, so a client that lost its kernel can send it all again after the restart.

export const accounts = ['a', 'b', 'c'] as const;
export const postsPerAccount = 4;

export type Submitted = { key: string; type: string; id: string; answer: HttpAnswer };

export class KernelGone extends Error {
  constructor(cause: unknown) {
    super('the kernel closed the connection', { cause });
    this.name = 'KernelGone';
  }
}

export class LedgerClient {
  readonly port: number;
  readonly submitted = new Map<string, Submitted>();

  constructor(port: number) {
    this.port = port;
  }

  async submit(key: string, type: string, payload: JsonObject, wait = 5000): Promise<Submitted> {
    const body = { payload, idempotencyKey: key, workspaceId: fixtureWorkspace, wait };
    const answer = await send(this.port, 'POST', `/api/v1/commands/${type}`, { body }).catch((error: unknown) => {
      throw new KernelGone(error);
    });
    const submitted = { key, type, id: messageIdOf(answer), answer };
    this.submitted.set(key, submitted);
    return submitted;
  }
}

// A failed reply is a Problem naming its message (ADR 0094).
function messageIdOf(answer: HttpAnswer): string {
  if (answer.status === 200) return commandReplyResponseSchema.parse(answer.json).id;
  if (answer.status === 202) return commandAcceptedResponseSchema.parse(answer.json).id;
  const { messageId, code } = problemSchema.parse(answer.json);
  if (messageId === undefined) throw new Error(`a command was refused with ${code}`);
  return messageId;
}

async function postAccount(client: LedgerClient, account: string): Promise<void> {
  for (let n = 1; n <= postsPerAccount; n += 1) await client.submit(`post-${account}-${n}`, 'ledger.post', { account, n });
}

// Every phase in order; a lost kernel ends the run with KernelGone.
export async function runLedgerWorkload(client: LedgerClient): Promise<void> {
  await Promise.all(accounts.map((account) => postAccount(client, account)));
  await client.submit('transfer', 'ledger.transfer', { id: 'x' });
  await client.submit('charge', 'ledger.charge', { id: 'c' });
  await client.submit('refund', 'ledger.refund', { id: 'r' });
  const hold = await client.submit('hold', 'ledger.hold', { id: 'h' });
  await client.submit('release', 'ledger.release', { holdId: hold.id });
  await client.submit('stream', 'ledger.stream', { id: 's' });
}

// Account a's four posts queued at once, without waiting, before the usual phases: the lane holds later posts
// behind the first when the kernel dies (M1.9-E7).
export async function runQueuedLaneWorkload(client: LedgerClient): Promise<void> {
  for (let n = 1; n <= postsPerAccount; n += 1) await client.submit(`post-a-${n}`, 'ledger.post', { account: 'a', n }, 0);
  await runLedgerWorkload(client);
}
