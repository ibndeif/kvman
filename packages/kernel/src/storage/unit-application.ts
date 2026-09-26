import { jsonByteLength, type Message, type Problem } from '@kvman/protocol';
import { applyBlobRefChanges } from '../blobs/blob-ref-changes.ts';
import { settlePendingRefs } from '../blobs/blob-rows.ts';
import { kernelProblem } from '../problems.ts';
import type { Admission, AppliedMessages, CommitInvocation, CommitResult, CommitUnit } from './commit-unit.ts';
import { causeOf, correlationOf, senderOf } from './commit-unit.ts';
import { StorageFailure, type Connection } from './driver.ts';
import { writeConfig } from './config-rows.ts';
import { applyKernelChange, type KernelChange } from './kernel-changes.ts';
import { cancelMessages, expireMessages } from './message-ending.ts';
import { markInvocation, markRetry, replyOf } from './message-rows.ts';
import type { SpillFiles } from './spill.ts';
import { readMessageState } from './stored-message.ts';
import { applyStoreWrite, InvalidWrite, VersionConflict, WorkspaceRequired } from './store-writes.ts';
import { admitPublish, admitSend, applyDeferredReply, finalReply, UnitRejected, type UnitScope } from './unit-contents.ts';

export const unitLimits = { messages: 1000, writeBytes: 8 * 1024 * 1024 } as const;

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

// Only an invocation writes storage and replies to deferred commands; the owner and workspace come from it.
function invokingExtension(unit: CommitUnit): string | undefined {
  const { origin } = unit;
  if (origin.kind === 'invocation') return origin.invocation.extension;
  if (unit.writes.length > 0) throw new InvalidWrite('a unit without an invocation cannot write storage');
  if (unit.replies.length > 0) throw new InvalidWrite('a unit without an invocation cannot reply');
  if ((unit.config?.length ?? 0) > 0 || (unit.secrets?.length ?? 0) > 0) throw new InvalidWrite('a unit without an invocation cannot set config or secrets');
  if ((unit.blobRefs?.length ?? 0) > 0) throw new InvalidWrite('a unit without an invocation cannot keep or release blobs');
  return undefined;
}

class StaleInvocation extends Error {
  constructor(messageId: string) {
    super(`the invocation of ${messageId} already ended`);
    this.name = 'StaleInvocation';
  }
}

// 04 §4.2: a unit commits only while its invocation is live: its message still running, its invocation deadline not
// passed (ADR 0084). A message already ended by cancel or deadline makes the unit stale.
function checkLive(connection: Connection, invocation: Pick<CommitInvocation, 'message' | 'stored' | 'deadlineAt'>, now: number): void {
  if (!invocation.stored) return;
  const { message } = invocation;
  if (readMessageState(connection, message.id) !== 'running') throw new StaleInvocation(message.id);
  if (invocation.deadlineAt === undefined || now < invocation.deadlineAt) return;
  const reached = message.deadlineAt !== undefined && now >= message.deadlineAt;
  throw new UnitRejected(kernelProblem(reached ? 'DEADLINE_EXCEEDED' : 'HANDLER_TIMEOUT', { correlationId: message.correlationId, messageId: message.id }));
}

function upsertQuarantine(connection: Connection, extension: string, reason: string): void {
  connection
    .prepare(`INSERT INTO extensions (name, status, quarantine_reason) VALUES (?, 'quarantined', ?)
      ON CONFLICT(name) DO UPDATE SET status = excluded.status, quarantine_reason = excluded.quarantine_reason`)
    .run(extension, reason);
}

// ADR 0134: a handler's result may name only blobs the handler may read.
function checkResult(scope: UnitScope, invocation: CommitInvocation): void {
  const { outcome, message, extension } = invocation;
  if (!('ok' in outcome) || !outcome.ok || message.kind !== 'command') return;
  const problem = scope.admission.checkResult({ message, value: outcome.value, extension, received: scope.received });
  if (problem !== undefined) throw new UnitRejected(problem);
}

// The unit's own message moves on last: marked done, failed, awaiting, pending again, or dead, with its reply. A
// handler's pending blob references become its own when it commits a result or a deferral (04 §4.6).
function settleOrigin(scope: UnitScope, unit: CommitUnit): void {
  const { origin } = unit;
  if (origin.kind === 'invocation') {
    const { invocation } = origin;
    checkResult(scope, invocation);
    settlePendingRefs(scope.connection, invocation.message.id, !('ok' in invocation.outcome) || invocation.outcome.ok);
    if (!invocation.stored) return;
    markInvocation(scope, invocation.message, invocation.outcome);
    if (!('deferred' in invocation.outcome)) finalReply(scope, invocation.message, replyOf(invocation.outcome));
  }
  if (origin.kind === 'retry') {
    markRetry(scope, origin.message, origin.attempts, origin.outcome);
    if (origin.outcome.state === 'dead') finalReply(scope, origin.message, origin.outcome.reply);
  }
  if (origin.kind === 'cancel') {
    const cancelled = cancelMessages(scope, origin.messageIds) + origin.unstored;
    const outcome = { ok: true, value: { cancelled } } as const;
    markInvocation(scope, origin.invocation.message, outcome);
    finalReply(scope, origin.invocation.message, replyOf(outcome));
  }
  if (origin.kind === 'expire') expireMessages(scope, origin.messageIds);
  if (origin.kind === 'quarantine') upsertQuarantine(scope.connection, origin.extension, origin.reason);
  if (origin.kind === 'change') settleKernelChange(scope, origin.change, origin.command);
}

function settleKernelChange(scope: UnitScope, change: KernelChange, command: Message | undefined): void {
  const value = applyKernelChange(scope, change);
  if (command === undefined) return;
  const outcome = { ok: true, value } as const;
  markInvocation(scope, command, outcome);
  finalReply(scope, command, replyOf(outcome));
}

// 04 §4.2: an invocation's config writes are checked and stored in the commit; its secrets wait for the file; its
// keeps and releases change its blob references.
function applySettings(scope: UnitScope, unit: CommitUnit, extension: string): void {
  applyBlobRefChanges(scope, extension, unit.blobRefs ?? []);
  for (const write of unit.config ?? []) writeConfig(scope, { extension, scope: write.scope, workspaceId: scope.cause?.workspaceId, value: write.value });
  for (const write of unit.secrets ?? []) {
    scope.applied.secrets.push(write.value === null ? { kind: 'clear', extension, name: write.name } : { kind: 'set', extension, name: write.name, value: write.value });
  }
}

function firstSendId(unit: CommitUnit): string | undefined {
  const { origin } = unit;
  return origin.kind === 'adapter' || origin.kind === 'call' ? origin.messageId : undefined;
}

// The blob IDs a unit's sends and publishes may name besides the sender's own references (ADR 0134).
function receivedOf(origin: CommitUnit['origin']): ReadonlySet<string> {
  if (origin.kind === 'invocation') return origin.invocation.received ?? new Set();
  return origin.kind === 'call' ? origin.received : new Set();
}

export type UnitStorage = { connection: Connection; files: SpillFiles };

function applyContents(storage: UnitStorage, unit: CommitUnit, admission: Admission, now: number): AppliedMessages {
  const { connection } = storage;
  const { origin } = unit;
  if (origin.kind === 'invocation' || origin.kind === 'cancel') checkLive(connection, origin.invocation, now);
  if (origin.kind === 'change' && origin.command !== undefined) checkLive(connection, { message: origin.command, stored: true }, now);
  const extension = invokingExtension(unit);
  const cause = causeOf(origin);
  if (extension !== undefined) {
    for (const write of unit.writes) applyStoreWrite(connection, { owner: extension, workspaceId: cause?.workspaceId }, write, now);
  }
  const scope: UnitScope = {
    connection, files: storage.files, admission, now, sender: senderOf(origin), cause, correlationId: correlationOf(origin), received: receivedOf(origin),
    workspaceId: origin.kind === 'adapter' ? origin.workspaceId : cause?.workspaceId,
    applied: { inserted: [], duplicates: [], logged: [], announced: [], unstored: [], replies: [], ended: [], secrets: [], correlationId: correlationOf(origin) },
  };
  unit.sends.forEach((send, index) => admitSend(scope, send, index, index === 0 ? firstSendId(unit) : undefined));
  for (const publish of unit.publishes) admitPublish(scope, publish);
  if (extension !== undefined) {
    for (const reply of unit.replies) applyDeferredReply(scope, extension, reply);
    applySettings(scope, unit, extension);
  }
  settleOrigin(scope, unit);
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

export function applyUnit(storage: UnitStorage, unit: CommitUnit, admission: Admission, now: number): CommitResult {
  const overLimit = limitProblem(unit);
  if (overLimit !== undefined) return { committed: false, problem: overLimit, stale: false };
  const { connection } = storage;
  connection.exec('SAVEPOINT unit');
  try {
    const applied = applyContents(storage, unit, admission, now);
    connection.exec('RELEASE unit');
    return { committed: true, ...applied };
  } catch (error) {
    connection.exec('ROLLBACK TO unit');
    connection.exec('RELEASE unit');
    if (error instanceof StaleInvocation) {
      return { committed: false, problem: kernelProblem('CANCELLED', { correlationId: correlationOf(unit.origin), detail: error.message }), stale: true };
    }
    return { committed: false, problem: problemOf(error, unit), stale: false };
  }
}
