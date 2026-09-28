import type {
  Address, BlobRefChange, Notification, SseMessage, Toast, ConfigWrite, ConfigWriteScope, DeferredReply, Json, JsonObject, Message, OutboundPublish, OutboundSend, Problem, QuarantineReason, ReplyPayload,
  SecretWrite, StoreWrite,
} from '@kvman/protocol';
import type { SecretChange } from '../secrets/secret-store.ts';
import type { Connection } from './driver.ts';
import type { KernelChange } from './kernel-changes.ts';
import type { ProcessEnd } from './process-rows.ts';

export type MessageState = 'pending' | 'running' | 'awaiting' | 'done' | 'failed' | 'dead' | 'cancelled';

export type InvocationOutcome = { ok: true; value: Json } | { ok: false; problem: Problem } | { deferred: true; onAbort?: string };

// An unstored invocation is a transient event's delivery (ADR 0069): it has no row to mark. `deadlineAt` is the
// invocation deadline: a unit that reaches commit after it is refused (04 §4.2, ADR 0084).
// `received` holds the blob IDs the invocation received (ADR 0134): its sends, publishes, results, and keeps may name them.
export type CommitInvocation = {
  message: Message; extension: string; outcome: InvocationOutcome; stored: boolean; deadlineAt?: number; received?: ReadonlySet<string>;
};

// A delegated job token's actor (ADR 0140): the extension whose calls and tools apply, a person, who delegates only
// access-`all` types, or nobody (a process whose own token ended), who delegates nothing.
export type DelegatingActor = { kind: 'extension'; extension: string } | { kind: 'person' } | { kind: 'nobody' };

// Who sends: the kernel-assigned address, and for ext:* and proc:* sources the extension whose grants apply (its blob
// reads included). A process with a delegated token calls with its actor's grants instead (`delegatedBy`).
export type Sender = { address: Address; extension?: string; delegatedBy?: DelegatingActor };

// A failed attempt as the scheduler settles it (03 §3.4): back to pending after its backoff, or dead with its reply.
export type RetryOutcome = { state: 'pending'; notBefore: number } | { state: 'dead'; reply: ReplyPayload };

// An adapter-originated unit carries one root message whose id the router chose, which is also its correlation id.
// A retry unit is the kernel's: it moves the message on and may publish kernel events caused by it. A call unit is
// a running handler's ctx.command, stored at once with the id the kernel chose for it (ADR 0072).
export type UnitOrigin =
  | { kind: 'invocation'; invocation: CommitInvocation }
  | { kind: 'adapter'; sender: Sender; workspaceId?: string; messageId: string }
  | { kind: 'retry'; message: Message; attempts: number; outcome: RetryOutcome }
  | { kind: 'call'; sender: Sender; cause: Message; messageId: string; received: ReadonlySet<string> }
  | { kind: 'cancel'; invocation: CommitInvocation; messageIds: readonly string[]; unstored: number }
  | { kind: 'expire'; messageIds: readonly string[]; correlationId: string }
  | { kind: 'quarantine'; extension: string; reason: QuarantineReason; correlationId: string }
  // A change to the extension catalog, a workspace, an applied preset, config, or secrets, by a kernel command, which
  // it replies to, or by the kernel itself at first run.
  | { kind: 'change'; change: KernelChange; command?: Message; correlationId: string }
  | { kind: 'announce'; correlationId: string }
  // A process ended (03 §3.7, ADR 0139): its row ends, and a detached one's onExit is sent, caused by the spawning message.
  | { kind: 'process'; end: ProcessEnd; cause: Message };

export type CommitUnit = {
  origin: UnitOrigin;
  writes: StoreWrite[];
  sends: OutboundSend[];
  publishes: OutboundPublish[];
  replies: DeferredReply[];
  // An invocation's ctx.config.set, applied in the commit, and ctx.secrets.set, applied after it (04 §4.2, §4.7).
  config?: ConfigWrite[];
  secrets?: SecretWrite[];
  // An invocation's ctx.store.blobs.keep and release (04 §4.2).
  blobRefs?: BlobRefChange[];
};

export type AdmittedMessage = { message: Message; handler: string; digest?: string };

export type OriginalMessage = { id: string; state: MessageState; reply?: ReplyPayload };

export type SendRequest = {
  send: OutboundSend;
  sender: Sender;
  cause: Message | undefined;
  workspaceId: string | undefined;
  index: number;
  received: ReadonlySet<string>;
  id?: string;
};

// A checked ui.* send, which the kernel handles at commit (ADR 0162): a notification's entity route is rendered, and a
// toast or notification carries the id of the tray entry it may store or fold into.
export type UiSend =
  | { kind: 'toast'; toast: Toast; entryId: string }
  | { kind: 'notify'; notification: Notification; entryId: string }
  | { kind: 'dismiss'; key: string }
  | { kind: 'navigate'; route: string };

// A refused send carries the row to store as `failed` only when its continuation can be delivered (ADR 0034); a
// refused ui.* send never does.
export type SendAdmission =
  | { outcome: 'admitted'; admitted: AdmittedMessage; ui?: UiSend }
  | { outcome: 'duplicate'; original: OriginalMessage }
  | { outcome: 'refused'; problem: Problem; failed?: AdmittedMessage };

export type PublishRequest = { publish: OutboundPublish; sender: Sender; cause: Message | undefined; workspaceId: string | undefined; received: ReadonlySet<string> };

export type EventDelivery = { admitted: AdmittedMessage; problem?: Problem };

export type PublishAdmission =
  | { outcome: 'admitted'; event: Message; deliveries: EventDelivery[] }
  | { outcome: 'refused'; problem: Problem };

// A deferred reply checked against its command's output schema (ADR 0074), and its blob IDs against the replying
// extension's read rights (ADR 0134).
export type ReplyCheck = { command: Message; payload: ReplyPayload; replier: string; received: ReadonlySet<string> };

// A handler's own result: only its blob IDs are checked, since the host checked it against the output schema.
export type ResultCheck = { message: Message; value: Json; extension: string; received: ReadonlySet<string> };

// A config write checked against its extension's config (ADR 0125): `global` is the stored global value, which a
// workspace value is merged over.
export type ConfigCheck = { extension: string; scope: ConfigWriteScope; value: JsonObject; global: JsonObject; correlationId: string };

export interface Admission {
  admitSend(connection: Connection, request: SendRequest): SendAdmission;
  admitPublish(connection: Connection, request: PublishRequest): PublishAdmission;
  checkReply(check: ReplyCheck): Problem | undefined;
  checkResult(check: ResultCheck): Problem | undefined;
  checkConfig(check: ConfigCheck): Problem | undefined;
}

export type StoredMessage = AdmittedMessage & { seq: number; state: MessageState };

// A message whose result this unit stored, for its waiters (02 §2.3).
export type FinalReply = { messageId: string; reply: ReplyPayload };

// A message this unit ended by cancel or deadline, with the state it had (ADRs 0083, 0084).
export type EndedMessage = { messageId: string; previous: MessageState; handler: string };

// A durable event with its events-table seq, the resume cursor of the event stream (12 §12.3).
export type LoggedEvent = { seq: number; event: Message };

export type AppliedMessages = {
  inserted: StoredMessage[];
  duplicates: OriginalMessage[];
  logged: LoggedEvent[];
  announced: Message[];
  unstored: UnstoredDelivery[];
  replies: FinalReply[];
  ended: EndedMessage[];
  // Applied to secrets.json after the commit, in commit order (04 §4.7).
  secrets: SecretChange[];
  // The ui.* messages the event stream pushes after the commit (12 §12.3, ADR 0162).
  pushes: UiPush[];
  correlationId: string;
};

export type UiPush = SseMessage<'ui'>;

// A transient event's delivery, with the message that published the event (for cancel scopes, ADR 0083).
export type UnstoredDelivery = { admitted: AdmittedMessage; publisher: string | undefined };

// A stale unit belongs to an invocation that already ended (cancelled, timed out): it is discarded.
export type CommitResult = ({ committed: true } & AppliedMessages) | { committed: false; problem: Problem; stale: boolean };

export function correlationOf(origin: UnitOrigin): string {
  if (origin.kind === 'invocation' || origin.kind === 'cancel') return origin.invocation.message.correlationId;
  if (origin.kind === 'expire' || origin.kind === 'quarantine' || origin.kind === 'announce' || origin.kind === 'change') return origin.correlationId;
  if (origin.kind === 'call' || origin.kind === 'process') return origin.cause.correlationId;
  return origin.kind === 'retry' ? origin.message.correlationId : origin.messageId;
}

export function senderOf(origin: UnitOrigin): Sender {
  if (origin.kind === 'invocation') return { address: `ext:${origin.invocation.extension}`, extension: origin.invocation.extension };
  return origin.kind === 'adapter' || origin.kind === 'call' ? origin.sender : { address: 'kernel' };
}

// The message a unit acts for: its sends and publishes are caused by it and run in its workspace.
export function causeOf(origin: UnitOrigin): Message | undefined {
  if (origin.kind === 'invocation' || origin.kind === 'cancel') return origin.invocation.message;
  if (origin.kind === 'call' || origin.kind === 'process') return origin.cause;
  if (origin.kind === 'change') return origin.command;
  return origin.kind === 'retry' ? origin.message : undefined;
}
