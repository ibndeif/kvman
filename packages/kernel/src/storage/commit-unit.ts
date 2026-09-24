import type { Address, Json, Message, OutboundSend, Problem, StoreWrite } from '@kvman/protocol';

export type MessageState = 'pending' | 'running' | 'awaiting' | 'done' | 'failed' | 'dead' | 'cancelled';

export type InvocationOutcome = { ok: true; value: Json } | { ok: false; problem: Problem } | { deferred: true };

export type CommitInvocation = { message: Message; extension: string; outcome: InvocationOutcome };

export type UnitOrigin =
  | { kind: 'invocation'; invocation: CommitInvocation }
  | { kind: 'adapter'; sender: Address; correlationId: string };

export type CommitUnit = { origin: UnitOrigin; writes: StoreWrite[]; sends: OutboundSend[] };

export type AdmittedMessage = { message: Message; handler: string; digest?: string };

export type AdmissionRequest = { send: OutboundSend; sender: Address; cause: Message | undefined; correlationId: string };

export type AdmissionResult = { ok: true; admitted: AdmittedMessage } | { ok: false; problem: Problem; admitted: AdmittedMessage };

export interface Admission {
  admit(request: AdmissionRequest): AdmissionResult;
}

export type StoredMessage = AdmittedMessage & { seq: number; state: MessageState };

export type CommitResult = { committed: true; inserted: StoredMessage[] } | { committed: false; problem: Problem };

export function correlationOf(origin: UnitOrigin): string {
  return origin.kind === 'invocation' ? origin.invocation.message.correlationId : origin.correlationId;
}
