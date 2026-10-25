import { z } from '@kvman/sdk';
import { artifactFormats } from '../artifacts/artifact-format.ts';
import type { JsonValue } from '../connector-call.ts';
import { thinkingLevels } from '../thinking-levels.ts';

export type { JsonValue };

// kvcoder's records (plan 08 §8.1): sessions, messages, turns, and what waits on the person.

/** How hard the model thinks, as kvai takes it (ADR 0087, 11). */
export const thinkingSchema = z.enum(thinkingLevels);

const tokens = z.number().int().nonnegative();

/** Tokens and cost, summed. */
export const usageSchema = z.object({ input: tokens, output: tokens, cacheRead: tokens, cacheWrite: tokens, cost: z.number().nonnegative() });

/** A session title: a string, or a translation key. */
export const titleSchema = z.string();

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

const noTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };

/** The parts of a session's usage that weren't its own replies (ADR 0058, 1). */
export const usageBySchema = z.object({ summary: usageSchema, title: usageSchema, helpers: usageSchema });

export const sessionDocSchema = z.object({
  title: titleSchema,
  autoTitle: z.boolean(),
  deleting: z.boolean().default(false),
  status: statusSchema,
  parentId: z.string().nullable(),
  // The worker a child session runs for, with the instructions it started with (ADR 0021, 29).
  worker: z.object({ name: z.string(), instructions: z.string(), readOnly: z.boolean().default(false) }).nullable().default(null),
  model: z.string().nullable(),
  thinking: thinkingSchema,
  // "Decide for me": the chat has no `ask`, and the lead makes each choice itself (ADR 0092, 2).
  decides: z.boolean().default(false),
  // The last tool result sent cleared (ADR 0094, 1).
  clearedThroughSeq: z.number().int().nullable().default(null),
  // The hosts this chat let web fetch reach (ADR 0095, 4).
  webHosts: z.array(z.string()).default([]),
  usageBy: usageBySchema.default({ summary: noTokens, title: noTokens, helpers: noTokens }),
  stepJobId: z.string().nullable(),
  stepGeneration: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  stepIntentId: z.string().nullable().default(null),
  turnId: z.string().nullable(),
  endedTurns: z.number().int().nonnegative(),
  nextSeq: z.number().int().nonnegative(),
  usage: usageSchema,
  durationMs: z.number().nonnegative(),
  checks: z.array(checkSchema).nullable(),
  connectors: z.array(z.string()).nullable(),
  // The `optIn` connectors enabled for this chat (ADR 0027, 10).
  optedIn: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** A step's durable scheduling/claim record in its workspace (ADR0041). */
export const stepIntentDocSchema = z.object({
  sessionId: z.string(),
  turnId: z.string(),
  generation: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  phase: z.enum(['prepared', 'claimed', 'settled', 'invalidated', 'needs-review']),
  jobId: z.string().nullable(),
  legacyJobId: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
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
  // What a reply's provider count was measured with: the prompt and tools of its call (ADR 0058, 2); none on older messages.
  basis: z.string().nullable().default(null),
  durationMs: z.number().nonnegative().nullable(),
  createdAt: z.string(),
});

// A message waiting for the running step to append its results (ADR 0009, 102).
// `running` is the chat's background runs when the person sent the message (ADR 0068, 4).
export const queuedDocSchema = z.object({ sessionId: z.string(), source: sourceSchema, text: z.string(), running: z.array(z.string()).exactOptional(), fileIds: z.array(z.string()).nullable(), fileNames: z.array(z.string()).nullable(), createdAt: z.string() });

/** What a pending call waits on. */
export const pendingSchema = z.object({
  toolCallId: z.string(),
  kind: z.enum(['question', 'subagent', 'approval', 'worker']),
  questionId: z.string().nullable(),
  question: z.json().nullable(),
  childSessionId: z.string().nullable(),
  // The run of a program worker the call waits on (ADR 0021, 23).
  runId: z.string().nullable().default(null),
});

// A call stored before ADR 0089 also holds the model's description of it, which only its approval card still shows
// (ADR 0089, 1).
/** A call the person approves before it runs: the connector command with its payload. */
export const runCallSchema = z.strictObject({ description: z.string().exactOptional(), connector: z.string(), command: z.string(), payload: z.record(z.string(), z.json()) });

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
  // The replies of the turn that were empty or cut at the length limit (ADR 0054, 1).
  incomplete: z.number().int().nonnegative().default(0),
  usage: usageSchema,
  outcome: outcomeSchema.nullable(),
  calls: z.array(z.object({ toolCallId: z.string(), toolName: z.string() })),
  pending: z.array(pendingSchema),
  results: z.array(heldResultSchema),
  deferredCalls: z.array(z.object({ toolCallId: z.string(), call: runCallSchema })).default([]),
});

export const questionDocSchema = z.object({
  sessionId: z.string(),
  rootSessionId: z.string(),
  turnId: z.string(),
  toolCallId: z.string(),
  kind: z.enum(['text', 'choice', 'confirm', 'approval']),
  question: z.record(z.string(), z.json()),
});

/** A committed answer's internal retry identity, not a reusable approval (ADR0042). */
export const answerReceiptDocSchema = z.object({
  questionId: z.string(),
  sessionId: z.string(),
  turnId: z.string(),
  toolCallId: z.string(),
  questionKind: questionDocSchema.shape.kind,
  answerFingerprint: z.string().regex(/^[0-9a-f]{64}$/i),
  createdAt: z.iso.datetime(),
});

// What a chat last saw of a file, and a file's content before one of the chat's changes (ADR 0053, 2 and 4).
export const fileViewDocSchema = z.object({ sessionId: z.string(), path: z.string(), fingerprint: z.string().regex(/^[0-9a-f]{64}$/), updatedAt: z.iso.datetime() });
// A file a chat changed with `fs`, under the chat at the root, for its Changes view (ADR 0093, 2).
// `turnId` is the root chat's turn of the latest change (ADR 0102, 9); records from before it read `null`.
export const fileChangeDocSchema = z.object({ sessionId: z.string(), path: z.string(), firstAt: z.iso.datetime(), lastAt: z.iso.datetime(), turnId: z.string().nullable().default(null) });
export const fileBackupDocSchema = z.object({ sessionId: z.string(), path: z.string(), previous: z.string().nullable(), written: z.string().regex(/^[0-9a-f]{64}$/), createdAt: z.iso.datetime() });

// One numbered piece of a long file a chat is writing, held until `fs assemble` (ADR 0054, 2).
export const filePartDocSchema = z.object({ sessionId: z.string(), path: z.string(), part: z.number().int().min(1), content: z.string(), updatedAt: z.iso.datetime() });

// A send the page named with `sendId` and the session accepted (ADR 0048): it proves acceptance, and holds no text.
export const sendReceiptDocSchema = z.object({
  sendId: z.string(),
  sessionId: z.string(),
  messageFingerprint: z.string().regex(/^[0-9a-f]{64}$/i),
  createdAt: z.iso.datetime(),
});

// A subagent a session started with `background: true` (ADR 0009, 88), by its child session id. `connector` is the kind
// of a job started with the old `--async`; such a stored row still parses and is never listed (ADR 0011, 6).
export const backgroundDocSchema = z.object({ sessionId: z.string(), ref: z.string(), kind: z.enum(['connector', 'subagent']), call: z.string(), startedAt: z.string() });

/** How a program worker's run stands. */
export const runStatusSchema = z.enum(['running', 'succeeded', 'failed', 'cancelled', 'interrupted']);

// What a run changed in the folder's Git staging area (ADR 0060, 4): the staged tree before it, the tree and the
// commit `HEAD` named after it, and how many staged paths differ.
export const runStagingSchema = z.object({
  tree: z.string(),
  after: z.string(),
  head: z.string().nullable(),
  headMoved: z.boolean(),
  paths: z.number().int().nonnegative(),
  restored: z.boolean(),
});

// A run of a program worker (ADR 0021, 33): the command line it started with, the job that runs it, and what it
// returned. `toolCallId` is the call a turn waits on, and `null` for a background run.
export const runDocSchema = z.object({
  sessionId: z.string(),
  toolCallId: z.string().nullable(),
  worker: z.string(),
  kind: z.enum(['opencode', 'pi', 'claude']),
  call: z.string(),
  command: z.string(),
  args: z.array(z.string()),
  timeoutMs: z.number().int().positive(),
  jobId: z.string().nullable(),
  status: runStatusSchema,
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  exitCode: z.number().int().nullable(),
  output: z.string().nullable(),
  staging: runStagingSchema.nullable().default(null),
});

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
  starting: z.boolean().exactOptional(),
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
export type StepIntentDoc = z.output<typeof stepIntentDocSchema>;
export type MessageDoc = z.output<typeof messageDocSchema>;
export type QueuedDoc = z.output<typeof queuedDocSchema>;
export type TurnDoc = z.output<typeof turnDocSchema>;
export type FileChangeDoc = z.output<typeof fileChangeDocSchema>;
export type Pending = z.output<typeof pendingSchema>;
export type HeldResult = z.output<typeof heldResultSchema>;
export type RunCallDoc = z.output<typeof runCallSchema>;
export type QuestionDoc = z.output<typeof questionDocSchema>;
export type AnswerReceiptDoc = z.output<typeof answerReceiptDocSchema>;
export type SendReceiptDoc = z.output<typeof sendReceiptDocSchema>;
export type BackgroundDoc = z.output<typeof backgroundDocSchema>;
export type ArtifactDoc = z.output<typeof artifactDocSchema>;
export type ProcessDoc = z.output<typeof processDocSchema>;
export type RunDoc = z.output<typeof runDocSchema>;
export type RunStaging = z.output<typeof runStagingSchema>;
export type Usage = z.output<typeof usageSchema>;
export type Outcome = z.output<typeof outcomeSchema>;
export type Source = z.output<typeof sourceSchema>;
export type Title = z.output<typeof titleSchema>;
