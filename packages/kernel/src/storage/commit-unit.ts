import type { Address, DeferredReply, Json, Message, OutboundPublish, OutboundSend, Problem, ReplyPayload, StoreWrite } from '@kvman/protocol';
import type { Connection } from './driver.ts';

export type MessageState = 'pending' | 'running' | 'awaiting' | 'done' | 'failed' | 'dead' | 'cancelled';

export type InvocationOutcome = { ok: true; value: Json } | { ok: false; problem: Problem } | { deferred: true; onAbort?: string };

// An unstored invocation is a transient event's delivery (ADR 0069): it has no row to mark.
export type CommitInvocation = { message: Message; extension: string; outcome: InvocationOutcome; stored: boolean };

// Who sends: the kernel-assigned address, and for ext:* and proc:* sources the extension whose grants apply.
export type Sender = { address: Address; extension?: string };

// A failed attempt as the scheduler settles it (03 §3.4): back to pending after its backoff, or dead with its reply.
export type RetryOutcome = { state: 'pending'; notBefore: number } | { state: 'dead'; reply: ReplyPayload };

// An adapter-originated unit carries one root message whose id the router chose, which is also its correlation id.
// A retry unit is the kernel's: it moves the message on and may publish kernel events caused by it. A call unit is
// a running handler's ctx.command, stored at once with the id the kernel chose for it (ADR 0072).
export type UnitOrigin =
  | { kind: 'invocation'; invocation: CommitInvocation }
  | { kind: 'adapter'; sender: Sender; workspaceId?: string; messageId: string }
  | { kind: 'retry'; message: Message; attempts: number; outcome: RetryOutcome }
  | { kind: 'call'; sender: Sender; cause: Message; messageId: string };

export type CommitUnit = {
  origin: UnitOrigin;
  writes: StoreWrite[];
  sends: OutboundSend[];
  publishes: OutboundPublish[];
  replies: DeferredReply[];
};

export type AdmittedMessage = { message: Message; handler: string; digest?: string };

export type OriginalMessage = { id: string; state: MessageState; reply?: ReplyPayload };

export type SendRequest = {
  send: OutboundSend;
  sender: Sender;
  cause: Message | undefined;
  workspaceId: string | undefined;
  index: number;
  id?: string;
};

// A refused send carries the row to store as `failed` only when its continuation can be delivered (ADR 0034).
export type SendAdmission =
  | { outcome: 'admitted'; admitted: AdmittedMessage }
  | { outcome: 'duplicate'; original: OriginalMessage }
  | { outcome: 'refused'; problem: Problem; failed?: AdmittedMessage };

export type PublishRequest = { publish: OutboundPublish; sender: Sender; cause: Message | undefined; workspaceId: string | undefined };

export type EventDelivery = { admitted: AdmittedMessage; problem?: Problem };

export type PublishAdmission =
  | { outcome: 'admitted'; event: Message; deliveries: EventDelivery[] }
  | { outcome: 'refused'; problem: Problem };

// A deferred reply checked against its command's output schema (ADR 0074).
export type ReplyCheck = { command: Message; payload: ReplyPayload };

export interface Admission {
  admitSend(connection: Connection, request: SendRequest): SendAdmission;
  admitPublish(connection: Connection, request: PublishRequest): PublishAdmission;
  checkReply(check: ReplyCheck): Problem | undefined;
}

export type StoredMessage = AdmittedMessage & { seq: number; state: MessageState };

// A message whose result this unit stored, for its waiters (02 §2.3).
export type FinalReply = { messageId: string; reply: ReplyPayload };

export type AppliedMessages = {
  inserted: StoredMessage[];
  duplicates: OriginalMessage[];
  announced: Message[];
  unstored: AdmittedMessage[];
  replies: FinalReply[];
};

export type CommitResult = ({ committed: true } & AppliedMessages) | { committed: false; problem: Problem };

export function correlationOf(origin: UnitOrigin): string {
  if (origin.kind === 'invocation') return origin.invocation.message.correlationId;
  if (origin.kind === 'call') return origin.cause.correlationId;
  return origin.kind === 'retry' ? origin.message.correlationId : origin.messageId;
}

export function senderOf(origin: UnitOrigin): Sender {
  if (origin.kind === 'invocation') return { address: `ext:${origin.invocation.extension}`, extension: origin.invocation.extension };
  return origin.kind === 'retry' ? { address: 'kernel' } : origin.sender;
}

// The message a unit acts for: its sends and publishes are caused by it and run in its workspace.
export function causeOf(origin: UnitOrigin): Message | undefined {
  if (origin.kind === 'invocation') return origin.invocation.message;
  if (origin.kind === 'call') return origin.cause;
  return origin.kind === 'retry' ? origin.message : undefined;
}
