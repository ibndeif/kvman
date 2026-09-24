import { jsonByteLength, type Message, type OnReply, type OutboundPublish, type OutboundSend, type Problem, type ReplyPayload } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { Admission, CommitResult, CommitUnit, OriginalMessage, SendAdmission, SendRequest, Sender, StoredMessage } from './commit-unit.ts';
import { causeOf, correlationOf, senderOf } from './commit-unit.ts';
import { StorageFailure, type Connection } from './driver.ts';
import { insertEvent, insertMessage, markInvocation, markRetry } from './message-rows.ts';
import { applyStoreWrite, InvalidWrite, VersionConflict, WorkspaceRequired } from './store-writes.ts';

export const unitLimits = { messages: 1000, writeBytes: 8 * 1024 * 1024 } as const;

class UnitRejected extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.title);
    this.name = 'UnitRejected';
    this.problem = problem;
  }
}

function writeBytes(unit: CommitUnit): number {
  return unit.writes.reduce((total, write) => total + jsonByteLength(write), 0);
}

function limitProblem(unit: CommitUnit): Problem | undefined {
  const correlationId = correlationOf(unit.origin);
  if (unit.sends.length + unit.publishes.length > unitLimits.messages) {
    return kernelProblem('PAYLOAD_TOO_LARGE', { correlationId, params: { limit: 'messages', max: unitLimits.messages }, hint: 'split the work into several units' });
  }
  if (writeBytes(unit) > unitLimits.writeBytes) {
    return kernelProblem('PAYLOAD_TOO_LARGE', { correlationId, params: { limit: 'writes', max: unitLimits.writeBytes }, hint: 'split the work into several units' });
  }
  return undefined;
}

function continuationOf(failedId: string, onReply: OnReply, reply: ReplyPayload): OutboundSend {
  const payload = onReply.context === undefined ? { reply } : { reply, context: onReply.context };
  return { type: onReply.type, payload, idempotencyKey: `${failedId}:reply` };
}

const kernelSender: Sender = { address: 'kernel' };

type UnitScope = {
  connection: Connection;
  admission: Admission;
  now: number;
  sender: Sender;
  cause: Message | undefined;
  workspaceId: string | undefined;
  applied: AppliedMessages;
};

type AppliedMessages = { inserted: StoredMessage[]; duplicates: OriginalMessage[]; announced: Message[] };

function record(scope: UnitScope, result: SendAdmission): void {
  if (result.outcome === 'admitted') scope.applied.inserted.push(insertMessage(scope.connection, result.admitted, 'pending', undefined, scope.now));
  else if (result.outcome === 'duplicate') scope.applied.duplicates.push(result.original);
  else throw new UnitRejected(result.problem);
}

// A send WITH onReply that fails admission is stored as a failed command, and its continuation carries the failure
// to the sender (04 §4.2); a send without onReply, or one whose failure leaves no row to store, rejects the unit.
function admitSend(scope: UnitScope, send: OutboundSend, index: number, id: string | undefined): void {
  const request: SendRequest = { send, sender: scope.sender, cause: scope.cause, workspaceId: scope.workspaceId, index, ...(id === undefined ? {} : { id }) };
  const result = scope.admission.admitSend(scope.connection, request);
  if (result.outcome !== 'refused' || result.failed === undefined || send.onReply === undefined) {
    record(scope, result);
    return;
  }
  const reply: ReplyPayload = { ok: false, problem: result.problem };
  const failed = insertMessage(scope.connection, result.failed, 'failed', reply, scope.now);
  scope.applied.inserted.push(failed);
  const continuation = continuationOf(failed.message.id, send.onReply, reply);
  record(scope, scope.admission.admitSend(scope.connection, { send: continuation, sender: kernelSender, cause: failed.message, workspaceId: scope.workspaceId, index: 0 }));
}

function admitPublish(scope: UnitScope, publish: OutboundPublish): void {
  const result = scope.admission.admitPublish(scope.connection, { publish, sender: scope.sender, cause: scope.cause, workspaceId: scope.workspaceId });
  if (result.outcome === 'refused') throw new UnitRejected(result.problem);
  if (result.event.delivery !== 'durable') {
    scope.applied.announced.push(result.event);
    return;
  }
  insertEvent(scope.connection, result.event, scope.now);
  for (const delivery of result.deliveries) {
    const reply: ReplyPayload | undefined = delivery.problem === undefined ? undefined : { ok: false, problem: delivery.problem };
    scope.applied.inserted.push(insertMessage(scope.connection, delivery.admitted, reply === undefined ? 'pending' : 'failed', reply, scope.now));
  }
}

function applyContents(connection: Connection, unit: CommitUnit, admission: Admission, now: number): AppliedMessages {
  const { origin } = unit;
  const owner = origin.kind === 'invocation'
    ? { owner: origin.invocation.extension, workspaceId: origin.invocation.message.workspaceId }
    : undefined;
  for (const write of unit.writes) {
    if (owner === undefined) throw new InvalidWrite('a unit without an invocation cannot write storage');
    applyStoreWrite(connection, owner, write, now);
  }
  const cause = causeOf(origin);
  const scope: UnitScope = {
    connection, admission, now, sender: senderOf(origin), cause,
    workspaceId: origin.kind === 'adapter' ? origin.workspaceId : cause?.workspaceId,
    applied: { inserted: [], duplicates: [], announced: [] },
  };
  unit.sends.forEach((send, index) => admitSend(scope, send, index, origin.kind === 'adapter' && index === 0 ? origin.messageId : undefined));
  for (const publish of unit.publishes) admitPublish(scope, publish);
  if (origin.kind === 'invocation') markInvocation(connection, origin.invocation.message.id, origin.invocation.outcome, now);
  if (origin.kind === 'retry') markRetry(connection, origin.message.id, origin.attempts, origin.outcome, now);
  return scope.applied;
}

export function storageProblem(failure: StorageFailure, correlationId: string): Problem {
  return kernelProblem(failure.kind === 'full' ? 'STORAGE_FULL' : 'STORAGE_UNAVAILABLE', { correlationId });
}

function problemOf(error: unknown, unit: CommitUnit): Problem {
  const correlationId = correlationOf(unit.origin);
  if (error instanceof VersionConflict) return kernelProblem('STORAGE_CONFLICT', { correlationId });
  if (error instanceof UnitRejected) return error.problem;
  if (error instanceof InvalidWrite) return kernelProblem('VALIDATION_FAILED', { correlationId, detail: error.message });
  if (error instanceof WorkspaceRequired) return kernelProblem('WORKSPACE_INVALID', { correlationId, detail: error.message, hint: 'use ctx.store.global' });
  if (error instanceof StorageFailure) return storageProblem(error, correlationId);
  throw error;
}

export function applyUnit(connection: Connection, unit: CommitUnit, admission: Admission, now: number): CommitResult {
  const overLimit = limitProblem(unit);
  if (overLimit !== undefined) return { committed: false, problem: overLimit };
  connection.exec('SAVEPOINT unit');
  try {
    const applied = applyContents(connection, unit, admission, now);
    connection.exec('RELEASE unit');
    return { committed: true, ...applied };
  } catch (error) {
    connection.exec('ROLLBACK TO unit');
    connection.exec('RELEASE unit');
    return { committed: false, problem: problemOf(error, unit) };
  }
}
