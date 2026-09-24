import type { Address, Json, Message, OutboundPublish, OutboundSend, Problem, ReplyPayload, StoreWrite } from '@kvman/protocol';
import type { Connection } from './driver.ts';

export type MessageState = 'pending' | 'running' | 'awaiting' | 'done' | 'failed' | 'dead' | 'cancelled';

export type InvocationOutcome = { ok: true; value: Json } | { ok: false; problem: Problem } | { deferred: true };

export type CommitInvocation = { message: Message; extension: string; outcome: InvocationOutcome };

// Who sends: the kernel-assigned address, and for ext:* and proc:* sources the extension whose grants apply.
export type Sender = { address: Address; extension?: string };

// An adapter-originated unit carries one root message whose id the router chose, which is also its correlation id.
export type UnitOrigin =
  | { kind: 'invocation'; invocation: CommitInvocation }
  | { kind: 'adapter'; sender: Sender; workspaceId?: string; messageId: string };

export type CommitUnit = { origin: UnitOrigin; writes: StoreWrite[]; sends: OutboundSend[]; publishes: OutboundPublish[] };

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

export interface Admission {
  admitSend(connection: Connection, request: SendRequest): SendAdmission;
  admitPublish(connection: Connection, request: PublishRequest): PublishAdmission;
}

export type StoredMessage = AdmittedMessage & { seq: number; state: MessageState };

export type CommitResult =
  | { committed: true; inserted: StoredMessage[]; duplicates: OriginalMessage[]; announced: Message[] }
  | { committed: false; problem: Problem };

export function correlationOf(origin: UnitOrigin): string {
  return origin.kind === 'invocation' ? origin.invocation.message.correlationId : origin.messageId;
}

export function senderOf(origin: UnitOrigin): Sender {
  return origin.kind === 'invocation'
    ? { address: `ext:${origin.invocation.extension}`, extension: origin.invocation.extension }
    : origin.sender;
}
