import { z, type Stored } from '@kvman/sdk';
import { checkSchema, outcomeSchema, pendingSchema, sourceSchema, statusSchema, thinkingSchema, titleSchema, usageSchema, messageKindSchema, type MessageDoc, type QueuedDoc, type SessionDoc, type TurnDoc } from '../schemas/records.ts';

// The public shapes of sessions, messages, and turns (plan 08 §8.1), from kvcoder's records.

export const sessionSchema = z.object({
  id: z.string(),
  title: titleSchema,
  status: statusSchema,
  parentId: z.string().exactOptional(),
  worker: z.string().exactOptional(),
  model: z.string().nullable(),
  thinking: thinkingSchema,
  stepJobId: z.string().exactOptional(),
  usage: usageSchema,
  durationMs: z.number(),
  checks: z.array(checkSchema).exactOptional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const messageSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  turnId: z.string().exactOptional(),
  seq: z.number().int().exactOptional(),
  queued: z.literal(true).exactOptional(),
  kind: messageKindSchema,
  source: sourceSchema.exactOptional(),
  content: z.record(z.string(), z.json()),
  fileIds: z.array(z.string()).exactOptional(),
  model: z.string().exactOptional(),
  usage: usageSchema.exactOptional(),
  durationMs: z.number().exactOptional(),
  createdAt: z.string(),
});

// A pending call as it is shown: `runId` only on a call that waits on a program worker's run (plan 08 §8.1).
const shownPendingSchema = pendingSchema.omit({ runId: true }).extend({ runId: z.string().exactOptional() });

export const turnSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  startedAt: z.string(),
  endedAt: z.string().exactOptional(),
  durationMs: z.number(),
  steps: z.number().int(),
  usage: usageSchema,
  outcome: outcomeSchema.exactOptional(),
  pending: z.array(shownPendingSchema),
});

export type Session = z.output<typeof sessionSchema>;
export type Message = z.output<typeof messageSchema>;
export type Turn = z.output<typeof turnSchema>;

export function sessionView(doc: Stored<SessionDoc>): Session {
  return {
    id: doc.id,
    title: doc.title,
    status: doc.status,
    ...(doc.parentId === null ? {} : { parentId: doc.parentId }),
    ...(doc.worker === null ? {} : { worker: doc.worker.name }),
    model: doc.model,
    thinking: doc.thinking,
    ...(doc.stepJobId === null ? {} : { stepJobId: doc.stepJobId }),
    usage: doc.usage,
    durationMs: doc.durationMs,
    ...(doc.checks === null ? {} : { checks: doc.checks }),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function messageView(doc: Stored<MessageDoc>): Message {
  return {
    id: doc.id,
    sessionId: doc.sessionId,
    ...(doc.turnId === null ? {} : { turnId: doc.turnId }),
    seq: doc.seq,
    kind: doc.kind,
    ...(doc.source === null ? {} : { source: doc.source }),
    content: doc.content,
    ...(doc.fileIds === null ? {} : { fileIds: doc.fileIds }),
    ...(doc.model === null ? {} : { model: doc.model }),
    ...(doc.usage === null ? {} : { usage: doc.usage }),
    ...(doc.durationMs === null ? {} : { durationMs: doc.durationMs }),
    createdAt: doc.createdAt,
  };
}

export function queuedView(doc: Stored<QueuedDoc>): Message {
  return {
    id: doc.id,
    sessionId: doc.sessionId,
    queued: true,
    kind: 'user',
    source: doc.source,
    content: { role: 'user', content: doc.text, timestamp: Date.parse(doc.createdAt) },
    ...(doc.fileIds === null ? {} : { fileIds: doc.fileIds }),
    createdAt: doc.createdAt,
  };
}

export function turnView(doc: Stored<TurnDoc>): Turn {
  return {
    id: doc.id,
    sessionId: doc.sessionId,
    startedAt: doc.startedAt,
    ...(doc.endedAt === null ? {} : { endedAt: doc.endedAt }),
    durationMs: doc.durationMs,
    steps: doc.steps,
    usage: doc.usage,
    ...(doc.outcome === null ? {} : { outcome: doc.outcome }),
    pending: doc.pending.map(({ runId, ...item }) => (runId === null ? item : { ...item, runId })),
  };
}
