import type { OutboundSend, Problem, RpcCall, RpcResult } from '@kvman/protocol';
import { kernelProblem, ProblemError } from '../problems.ts';
import type { Router } from '../router/router.ts';
import type { Scheduler } from '../scheduler/scheduler.ts';
import type { CommitPipeline } from '../storage/commit-pipeline.ts';
import type { SendRequest } from '../storage/commit-unit.ts';
import type { Connection } from '../storage/driver.ts';
import { laneKeyOf } from '../storage/message-rows.ts';
import type { UlidGenerator } from '../ulid.ts';
import { extensionSender, type ActiveInvocation } from './active-invocation.ts';
import type { RecordedValueStore } from './recorded-value-store.ts';
import type { ReplyWaiters } from './reply-waiters.ts';

type CommandCall = Extract<RpcCall, { name: 'command' }>;

export type CommandCallDeps = {
  connection: Connection;
  router: Router;
  pipeline: CommitPipeline;
  scheduler: Scheduler;
  waiters: ReplyWaiters;
  values: RecordedValueStore;
  ids: UlidGenerator;
};

// 02 §2.6: the target lane is known only once admission renders it, so the send is admitted once without storing it
// to learn the lane; nothing is stored when the lane is held by the caller's chain.
function laneReentrancy(deps: CommandCallDeps, request: SendRequest & { cause: NonNullable<SendRequest['cause']> }): Problem | undefined {
  const preview = deps.router.admitSend(deps.connection, request);
  if (preview.outcome !== 'admitted' || preview.admitted.message.lane === undefined) return undefined;
  return deps.scheduler.laneReentrancy(request.cause, laneKeyOf(preview.admitted.handler, preview.admitted.message.lane));
}

// ctx.command (ADR 0072): stored at once under <invocation>:command:<ordinal>, so a redelivered handler re-awaits the
// same command, then answered with its stored reply.
export async function callCommand(deps: CommandCallDeps, invocation: ActiveInvocation, call: CommandCall): Promise<RpcResult> {
  const { message } = invocation.claim;
  if (invocation.claim.stored) deps.values.append(message.id, call.recorded);
  const sender = extensionSender(invocation);
  const send: OutboundSend = { type: call.type, payload: call.payload, ...call.options, idempotencyKey: call.options.idempotencyKey ?? `${message.id}:command:${call.ordinal}` };
  const messageId = deps.ids.next();
  const reentrant = laneReentrancy(deps, { send, sender, cause: message, workspaceId: message.workspaceId, index: 0, id: messageId });
  if (reentrant !== undefined) return { ok: false, problem: reentrant };
  const result = await deps.pipeline.enqueue({ origin: { kind: 'call', sender, cause: message, messageId }, writes: [], sends: [send], publishes: [], replies: [] });
  if (!result.committed) return { ok: false, problem: result.problem };
  const target = result.inserted[0]?.message.id ?? result.duplicates[0]?.id;
  if (target === undefined) {
    throw new ProblemError(kernelProblem('INTERNAL', { correlationId: message.correlationId, detail: 'a committed command call stored no message' }));
  }
  const reply = await deps.waiters.wait(target);
  return reply.ok ? { ok: true, value: reply.value } : { ok: false, problem: reply.problem };
}
