import { randomUUID } from 'node:crypto';
import type { KernelRuntime, Sender } from '@kvman/kernel';
import type { Json } from '@kvman/protocol';
import { driverName } from './driver-extension.ts';
import { TestkitProblem } from './testkit-errors.ts';

export const person: Sender = { address: 'user:local' };

export const driver: Sender = { address: `ext:${driverName}`, extension: driverName };

// A command as its sender sends it in the test workspace; the id of the admitted message.
export async function submit(runtime: KernelRuntime, sender: Sender, type: string, payload: Json, workspaceId: string | undefined, idempotencyKey: string = randomUUID()): Promise<string> {
  const submission = await runtime.submitCommand({ sender, idempotencyKey, type, payload, ...(workspaceId === undefined ? {} : { workspaceId }) });
  if (!submission.ok) throw new TestkitProblem(submission.problem);
  return submission.id;
}

export async function replyValue(runtime: KernelRuntime, messageId: string): Promise<Json> {
  const reply = await runtime.awaitReply(messageId);
  if (!reply.ok) throw new TestkitProblem(reply.problem);
  return reply.value;
}

export async function command(runtime: KernelRuntime, sender: Sender, type: string, payload: Json, workspaceId: string | undefined): Promise<Json> {
  return replyValue(runtime, await submit(runtime, sender, type, payload, workspaceId));
}

export async function query(runtime: KernelRuntime, sender: Sender, type: string, payload: Json, workspaceId: string): Promise<Json> {
  const answer = await runtime.query({ sender, type, payload, cause: undefined, workspaceId });
  if (!answer.ok) throw new TestkitProblem(answer.problem);
  return answer.value;
}
