import { jsonByteLength, type OutboundSend, type Problem, type ReplyPayload } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { AdmissionRequest, Admission, CommitResult, CommitUnit, StoredMessage } from './commit-unit.ts';
import { correlationOf } from './commit-unit.ts';
import { StorageFailure, type Connection } from './driver.ts';
import { insertMessage, markInvocation } from './message-rows.ts';
import { applyStoreWrite, InvalidWrite, VersionConflict } from './store-writes.ts';

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
  if (unit.sends.length > unitLimits.messages) {
    return kernelProblem('PAYLOAD_TOO_LARGE', { correlationId, params: { limit: 'messages', max: unitLimits.messages }, hint: 'split the work into several units' });
  }
  if (writeBytes(unit) > unitLimits.writeBytes) {
    return kernelProblem('PAYLOAD_TOO_LARGE', { correlationId, params: { limit: 'writes', max: unitLimits.writeBytes }, hint: 'split the work into several units' });
  }
  return undefined;
}

function continuationOf(failedId: string, send: OutboundSend, reply: ReplyPayload): OutboundSend | undefined {
  if (send.onReply === undefined) return undefined;
  const payload = send.onReply.context === undefined ? { reply } : { reply, context: send.onReply.context };
  return { type: send.onReply.type, payload, idempotencyKey: `${failedId}:reply` };
}

function admitSend(connection: Connection, admission: Admission, request: AdmissionRequest, now: number): StoredMessage[] {
  const result = admission.admit(request);
  if (result.ok) return [insertMessage(connection, result.admitted, 'pending', undefined, now)];
  const reply: ReplyPayload = { ok: false, problem: result.problem };
  const continuation = continuationOf(result.admitted.message.id, request.send, reply);
  if (continuation === undefined) throw new UnitRejected(result.problem);
  const failed = insertMessage(connection, result.admitted, 'failed', reply, now);
  const delivered = admission.admit({ send: continuation, sender: 'kernel', cause: failed.message, correlationId: request.correlationId });
  if (!delivered.ok) throw new UnitRejected(delivered.problem);
  return [failed, insertMessage(connection, delivered.admitted, 'pending', undefined, now)];
}

function applyContents(connection: Connection, unit: CommitUnit, admission: Admission, now: number): StoredMessage[] {
  const { origin } = unit;
  const owner = origin.kind === 'invocation'
    ? { owner: origin.invocation.extension, workspaceId: origin.invocation.message.workspaceId }
    : undefined;
  for (const write of unit.writes) {
    if (owner === undefined) throw new InvalidWrite('a unit without an invocation cannot write storage');
    applyStoreWrite(connection, owner, write, now);
  }
  const sender = origin.kind === 'invocation' ? (`ext:${origin.invocation.extension}` as const) : origin.sender;
  const cause = origin.kind === 'invocation' ? origin.invocation.message : undefined;
  const correlationId = correlationOf(origin);
  const inserted = unit.sends.flatMap((send) => admitSend(connection, admission, { send, sender, cause, correlationId }, now));
  if (origin.kind === 'invocation') markInvocation(connection, origin.invocation.message.id, origin.invocation.outcome, now);
  return inserted;
}

export function storageProblem(failure: StorageFailure, correlationId: string): Problem {
  return kernelProblem(failure.kind === 'full' ? 'STORAGE_FULL' : 'STORAGE_UNAVAILABLE', { correlationId });
}

function problemOf(error: unknown, unit: CommitUnit): Problem {
  const correlationId = correlationOf(unit.origin);
  if (error instanceof VersionConflict) return kernelProblem('STORAGE_CONFLICT', { correlationId });
  if (error instanceof UnitRejected) return error.problem;
  if (error instanceof InvalidWrite) return kernelProblem('VALIDATION_FAILED', { correlationId, detail: error.message });
  if (error instanceof StorageFailure) return storageProblem(error, correlationId);
  throw error;
}

export function applyUnit(connection: Connection, unit: CommitUnit, admission: Admission, now: number): CommitResult {
  const overLimit = limitProblem(unit);
  if (overLimit !== undefined) return { committed: false, problem: overLimit };
  connection.exec('SAVEPOINT unit');
  try {
    const inserted = applyContents(connection, unit, admission, now);
    connection.exec('RELEASE unit');
    return { committed: true, inserted };
  } catch (error) {
    connection.exec('ROLLBACK TO unit');
    connection.exec('RELEASE unit');
    return { committed: false, problem: problemOf(error, unit) };
  }
}
