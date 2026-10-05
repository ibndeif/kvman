import { z } from '@kvman/sdk';
import { artifactFormats } from '../artifacts/artifact-format.ts';
import type { JsonValue } from '../connector-call.ts';

export type { JsonValue };

// kvcoder's records (plan 08 §8.1): sessions, messages, turns, and what waits on the person.

/** How hard the model thinks, as kvai takes it. */
export const thinkingSchema = z.enum(['off', 'minimal', 'low', 'medium', 'high']);

const tokens = z.number().int().nonnegative();

/** Tokens and cost, summed. */
export const usageSchema = z.object({ input: tokens, output: tokens, cacheRead: tokens, cacheWrite: tokens, cost: z.number().nonnegative() });

/** A session title: a string, or a translation key. */
export const titleSchema = z.union([z.string(), z.object({ key: z.string().min(1) })]);

/** A session's status. */
export const statusSchema = z.enum(['idle', 'running', 'waiting']);

/** A binary connector's check result, stored in the session at its first step. */
export const checkSchema = z.object({ name: z.string(), passed: z.boolean() });

/** How a turn ended. */
export const outcomeSchema = z.enum(['done', 'cancelled', 'failed', 'interrupted', 'maxSteps']);

/** Where a message came from. */
export const sourceSchema = z.union([
  z.object({ kind: z.literal('user') }),
  z.object({ kind: z.literal('extension'), name: z.string() }),
  z.object({ kind: z.literal('subagent'), sessionId: z.string() }),
  z.object({ kind: z.literal('job'), jobId: z.string() }),
]);

/** A message's kind. */
export const messageKindSchema = z.enum(['user', 'assistant', 'toolResult', 'notice', 'note', 'summary']);

export const sessionDocSchema = z.object({
  title: titleSchema,
  autoTitle: z.boolean(),
  status: statusSchema,
  parentId: z.string().nullable(),
  model: z.string().nullable(),
  thinking: thinkingSchema,
  stepJobId: z.string().nullable(),
  turnId: z.string().nullable(),
  endedTurns: z.number().int().nonnegative(),
  nextSeq: z.number().int().nonnegative(),
  usage: usageSchema,
  durationMs: z.number().nonnegative(),
  checks: z.array(checkSchema).nullable(),
  connectors: z.array(z.string()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const messageDocSchema = z.object({
  sessionId: z.string(),
  turnId: z.string().nullable(),
  seq: z.number().int().nonnegative(),
  block: z.number().int().nonnegative(),
  kind: messageKindSchema,
  source: sourceSchema.nullable(),
  content: z.record(z.string(), z.json()),
  fileIds: z.array(z.string()).nullable(),
  fileNames: z.array(z.string()).nullable(),
  model: z.string().nullable(),
  usage: usageSchema.nullable(),
  durationMs: z.number().nonnegative().nullable(),
  createdAt: z.string(),
});

// A message waiting for the running step to append its results (ADR 0009, 102).
export const queuedDocSchema = z.object({ sessionId: z.string(), source: sourceSchema, text: z.string(), fileIds: z.array(z.string()).nullable(), fileNames: z.array(z.string()).nullable(), createdAt: z.string() });

/** What a pending call waits on. */
export const pendingSchema = z.object({
  toolCallId: z.string(),
  kind: z.enum(['question', 'subagent', 'approval']),
  questionId: z.string().nullable(),
  question: z.json().nullable(),
  childSessionId: z.string().nullable(),
});

/** A call the person approves before it runs: what the model said it does, and the connector command with its payload. */
export const runCallSchema = z.strictObject({ description: z.string(), connector: z.string(), command: z.string(), payload: z.record(z.string(), z.json()) });

// An approved call of the old shell tool. It is kept only so a turn stored before `run` still parses; it is never run
// (ADR 0011, 12).
const oldShellRunSchema = z.object({ command: z.string(), timeoutMs: z.number().int().positive() });

// A call's result kept in the turn until the step's calls all resolve; `run` is an approved call the next step runs
// before it appends the results.
export const heldResultSchema = z.object({
  toolCallId: z.string(),
  text: z.string(),
  details: z.json().nullable(),
  isError: z.boolean(),
  run: z.union([runCallSchema, oldShellRunSchema]).nullable(),
});

export const turnDocSchema = z.object({
  sessionId: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  durationMs: z.number().nonnegative(),
  steps: z.number().int().nonnegative(),
  lost: z.number().int().nonnegative().default(0),
  usage: usageSchema,
  outcome: outcomeSchema.nullable(),
  calls: z.array(z.object({ toolCallId: z.string(), toolName: z.string() })),
  pending: z.array(pendingSchema),
  results: z.array(heldResultSchema),
});

export const questionDocSchema = z.object({
  sessionId: z.string(),
  rootSessionId: z.string(),
  turnId: z.string(),
  toolCallId: z.string(),
  kind: z.enum(['text', 'choice', 'confirm', 'approval']),
  question: z.record(z.string(), z.json()),
});

// A subagent a session started with `background: true` (ADR 0009, 88), by its child session id. `connector` is the kind
// of a job started with the old `--async`; such a stored row still parses and is never listed (ADR 0011, 6).
export const backgroundDocSchema = z.object({ sessionId: z.string(), ref: z.string(), kind: z.enum(['connector', 'subagent']), call: z.string(), startedAt: z.string() });

// A background process a session started with `background: true` (ADR 0009, 150). It lives in the global store, since the
// handlers for kvman stopping and starting run in Home. It is running until `end` is set; `reported` says whether the
// session has been told how it ended.
export const processDocSchema = z.object({
  workspaceId: z.string(),
  sessionId: z.string(),
  title: z.string(),
  call: z.string(),
  startedAt: z.string(),
  endedAt: z.string().exactOptional(),
  end: z.enum(['exited', 'agent', 'person', 'interrupted']).exactOptional(),
  exitCode: z.number().int().nullable().exactOptional(),
  signal: z.string().nullable().exactOptional(),
  reported: z.boolean(),
});

// A document shown beside the chat (plan 08 §8.5, ADR 0009, 175): `sessionId` is the chat's own id, `artifactId`
// names it within the chat, and only the latest content is kept.
export const artifactDocSchema = z.object({
  sessionId: z.string(),
  artifactId: z.string(),
  title: z.string(),
  format: z.enum(artifactFormats),
  content: z.string(),
  version: z.number().int().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SessionDoc = z.output<typeof sessionDocSchema>;
export type MessageDoc = z.output<typeof messageDocSchema>;
export type QueuedDoc = z.output<typeof queuedDocSchema>;
export type TurnDoc = z.output<typeof turnDocSchema>;
export type Pending = z.output<typeof pendingSchema>;
export type HeldResult = z.output<typeof heldResultSchema>;
export type RunCallDoc = z.output<typeof runCallSchema>;
export type QuestionDoc = z.output<typeof questionDocSchema>;
export type BackgroundDoc = z.output<typeof backgroundDocSchema>;
export type ArtifactDoc = z.output<typeof artifactDocSchema>;
export type ProcessDoc = z.output<typeof processDocSchema>;
export type Usage = z.output<typeof usageSchema>;
export type Outcome = z.output<typeof outcomeSchema>;
export type Source = z.output<typeof sourceSchema>;
export type Title = z.output<typeof titleSchema>;
