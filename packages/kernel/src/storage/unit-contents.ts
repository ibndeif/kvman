import type { DeferredReply, Message, OnReply, OutboundPublish, OutboundSend, Problem, ReplyPayload } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import { applyUiSend } from '../notifications/ui-effects.ts';
import type { Admission, AdmittedMessage, AppliedMessages, SendAdmission, SendRequest, Sender, UiSend } from './commit-unit.ts';
import type { Connection } from './driver.ts';
import { insertEvent, insertMessage, markReplied } from './message-rows.ts';
import type { SpillFiles } from './spill.ts';
import { readMessage, type MessageRecord } from './stored-message.ts';

export class UnitRejected extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.title);
    this.name = 'UnitRejected';
    this.problem = problem;
  }
}

export type UnitScope = {
  connection: Connection;
  files: SpillFiles;
  admission: Admission;
  now: number;
  sender: Sender;
  // The blob IDs the unit's invocation received (ADR 0134), which its sends and publishes may name.
  received: ReadonlySet<string>;
  cause: Message | undefined;
  workspaceId: string | undefined;
  correlationId: string;
  applied: AppliedMessages;
};

const kernelSender: Sender = { address: 'kernel' };

function continuationOf(commandId: string, onReply: OnReply, reply: ReplyPayload): OutboundSend {
  const payload = onReply.context === undefined ? { reply } : { reply, context: onReply.context };
  return { type: onReply.type, payload, idempotencyKey: `${commandId}:reply` };
}

export function recordSend(scope: UnitScope, result: SendAdmission): void {
  if (result.outcome === 'admitted' && result.ui !== undefined) recordUiSend(scope, result.admitted, result.ui);
  else if (result.outcome === 'admitted') scope.applied.inserted.push(insertMessage(scope, result.admitted, 'pending', undefined));
  else if (result.outcome === 'duplicate') scope.applied.duplicates.push(result.original);
  else throw new UnitRejected(result.problem);
}

const uiReply: ReplyPayload = { ok: true, value: { ok: true } };

// ADR 0162: the kernel handles a ui.* send at commit. Its effect comes first (the rate count sees only earlier rows),
// then its row is stored `done` with its target and the reply `{ ok: true }`, which reaches waiters and continuations.
function recordUiSend(scope: UnitScope, admitted: AdmittedMessage, ui: UiSend): void {
  const effect = applyUiSend(scope, admitted.message, ui);
  const message = { ...admitted.message, target: effect.target };
  scope.applied.inserted.push(insertMessage(scope, { ...admitted, message }, 'done', uiReply));
  if (effect.push !== undefined) scope.applied.pushes.push(effect.push);
  for (const ws of effect.changed) publishTrayChange(scope, ws);
  finalReply(scope, message, uiReply);
}

// ADR 0163: kernel.notifications.changed is published globally, naming the tray's workspace ('' = the global entries).
export function publishTrayChange(scope: UnitScope, ws: string): void {
  publishKernelEvent(scope, undefined, { type: 'kernel.notifications.changed', payload: ws === '' ? {} : { workspaceId: ws } });
}

// A message's result is stored in this unit: its waiters learn it after commit, and a command's continuation is
// admitted in the same transaction (02 §2.3, §2.8; ADR 0062).
export function finalReply(scope: UnitScope, command: Message, reply: ReplyPayload): void {
  scope.applied.replies.push({ messageId: command.id, reply });
  if (command.onReply === undefined) return;
  const send = continuationOf(command.id, command.onReply, reply);
  recordSend(scope, scope.admission.admitSend(scope.connection, { send, sender: kernelSender, cause: command, workspaceId: command.workspaceId, index: 0, received: new Set() }));
}

// A send WITH onReply that fails admission is stored as a failed command, and its continuation carries the failure
// to the sender (04 §4.2); a send without onReply, or one whose failure leaves no row to store, rejects the unit.
export function admitSend(scope: UnitScope, send: OutboundSend, index: number, id: string | undefined): void {
  const request: SendRequest = {
    send, sender: scope.sender, cause: scope.cause, workspaceId: scope.workspaceId, index, received: scope.received, ...(id === undefined ? {} : { id }),
  };
  const result = scope.admission.admitSend(scope.connection, request);
  if (result.outcome !== 'refused' || result.failed === undefined || send.onReply === undefined) {
    recordSend(scope, result);
    return;
  }
  const reply: ReplyPayload = { ok: false, problem: result.problem };
  const failed = insertMessage(scope, result.failed, 'failed', reply);
  scope.applied.inserted.push(failed);
  finalReply(scope, failed.message, reply);
}

// Durable events get a log row and a delivery row per subscriber; a transient event's deliveries are handed to the
// scheduler after commit without rows (ADR 0069).
export function admitPublish(scope: UnitScope, publish: OutboundPublish): void {
  const result = scope.admission.admitPublish(scope.connection, { publish, sender: scope.sender, cause: scope.cause, workspaceId: scope.workspaceId, received: scope.received });
  if (result.outcome === 'refused') throw new UnitRejected(result.problem);
  if (result.event.delivery !== 'durable') {
    scope.applied.announced.push(result.event);
    for (const delivery of result.deliveries) {
      if (delivery.problem === undefined) scope.applied.unstored.push({ admitted: delivery.admitted, publisher: result.event.causationId });
    }
    return;
  }
  scope.applied.logged.push({ seq: insertEvent(scope, result.event), event: result.event });
  for (const delivery of result.deliveries) {
    const reply: ReplyPayload | undefined = delivery.problem === undefined ? undefined : { ok: false, problem: delivery.problem };
    scope.applied.inserted.push(insertMessage(scope, delivery.admitted, reply === undefined ? 'pending' : 'failed', reply));
  }
}

type ReplyTarget = { ok: true; target: MessageRecord } | { ok: false; problem: Problem };

function replyTarget(scope: UnitScope, extension: string, commandId: string): ReplyTarget {
  const refused = (code: 'REPLY_NOT_AWAITING' | 'CAPABILITY_DENIED', detail: string): ReplyTarget => ({
    ok: false, problem: kernelProblem(code, { correlationId: scope.correlationId, detail }),
  });
  const target = readMessage(scope, commandId);
  if (target === undefined || target.message.kind !== 'command') return refused('REPLY_NOT_AWAITING', `no command ${commandId} waits for a reply`);
  if (target.handler !== extension) return refused('CAPABILITY_DENIED', `${extension} may reply only to its own commands`);
  if (target.state !== 'awaiting') return refused('REPLY_NOT_AWAITING', `the command ${commandId} is ${target.state}`);
  return { ok: true, target };
}

// 02 §2.8: ctx.reply completes an awaiting command of the replying extension; anything else rolls the unit back
// (ADR 0074).
export function applyDeferredReply(scope: UnitScope, extension: string, { commandId, payload }: DeferredReply): void {
  const found = replyTarget(scope, extension, commandId);
  if (!found.ok) throw new UnitRejected(found.problem);
  const problem = scope.admission.checkReply({ command: found.target.message, payload, replier: extension, received: scope.received });
  if (problem !== undefined) throw new UnitRejected(problem);
  markReplied(scope, found.target.message, payload);
  finalReply(scope, found.target.message, payload);
}

// A kernel event a unit causes, in the given workspace or none (kernel events of 03 §3.8).
export function publishKernelEvent(scope: UnitScope, workspaceId: string | undefined, publish: OutboundPublish): void {
  admitPublish({ ...scope, sender: kernelSender, workspaceId, received: new Set() }, publish);
}
