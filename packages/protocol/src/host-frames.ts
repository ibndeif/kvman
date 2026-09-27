import { z } from 'zod';
import { manifestSchema } from './extension/manifest.ts';
import { epochMsSchema, typeNameSchema, ulidSchema, workspaceIdSchema } from './identifiers.ts';
import { jsonObjectSchema, jsonSchema } from './json.ts';
import { liveChunkSchema } from './live-chunk.ts';
import { messageKindSchema, messageSchema } from './message.ts';
import { problemSchema } from './problem.ts';
import { replyPayloadSchema } from './reply.ts';
import { configWriteSchema, outboundPublishSchema, outboundSendSchema, secretWriteSchema, storeWriteSchema } from './unit-of-work.ts';
import { secretNameSchema } from './config-values.ts';
import { storeReadSchema } from './store-reads.ts';
import { base64Schema, blobLimits, blobNameSchema, blobRefChangeSchema, mimeTypeSchema } from './blobs.ts';
import { blobIdSchema } from './blob-id.ts';
import { fileContentSchema, workspacePathSchema } from './workspace-files.ts';
import { storeScopeSchema } from './unit-of-work.ts';
import { spawnOptionsSchema } from './processes.ts';

// 03 §3.5 and ADR 0076: the frames between the kernel and an execution host.

const invocationIdSchema = z.string().min(1);
const callNumberSchema = z.number().int().positive();

export const hostWorkspaceSchema = z.strictObject({ id: workspaceIdSchema, path: z.string().min(1), name: z.string().min(1) });
export type HostWorkspace = z.infer<typeof hostWorkspaceSchema>;

// Values recorded by earlier attempts, in call order from 1 (ADR 0070).
export const recordedValuesSchema = z.strictObject({ id: z.array(ulidSchema), now: z.array(epochMsSchema) });
export type RecordedValues = z.infer<typeof recordedValuesSchema>;

// Values generated since the last journaled write, each with its call number.
export const newRecordedValuesSchema = z.strictObject({
  id: z.array(z.strictObject({ n: callNumberSchema, value: ulidSchema })),
  now: z.array(z.strictObject({ n: callNumberSchema, value: epochMsSchema })),
});
export type NewRecordedValues = z.infer<typeof newRecordedValuesSchema>;

export const commandOptionsSchema = outboundSendSchema.pick({ lane: true, priority: true, deadlineAt: true, context: true, idempotencyKey: true });
export type CommandOptions = z.infer<typeof commandOptionsSchema>;

export const invokeFrameSchema = z.strictObject({
  frame: z.literal('invoke'),
  invocationId: invocationIdSchema,
  extension: z.string().min(1),
  handler: z.string().min(1),
  kind: messageKindSchema,
  message: messageSchema,
  readOnly: z.boolean(),
  deadlineAt: epochMsSchema,
  workspace: hostWorkspaceSchema.exactOptional(),
  recorded: recordedValuesSchema,
  module: z.strictObject({ entry: z.string().min(1), manifest: manifestSchema }).exactOptional(),
});
export type InvokeFrame = z.infer<typeof invokeFrameSchema>;

const uploadIdSchema = z.number().int().positive();
// `name` names the call, so a blob's name travels as `fileName`.
const putMetaSchema = { scope: storeScopeSchema, mime: mimeTypeSchema.exactOptional(), fileName: blobNameSchema.exactOptional() };

// 04 §4.3, §4.6, ADR 0134: a put streams its bytes into an upload the kernel opened; reads come in chunks.
const blobCalls = [
  z.strictObject({ name: z.literal('blobs.put.open') }),
  z.strictObject({ name: z.literal('blobs.put.write'), upload: uploadIdSchema, bytes: base64Schema }),
  z.strictObject({ name: z.literal('blobs.put.close'), upload: uploadIdSchema, ...putMetaSchema }),
  z.strictObject({ name: z.literal('blobs.put.file'), path: workspacePathSchema, ...putMetaSchema }),
  z.strictObject({ name: z.literal('blobs.stat'), blobId: blobIdSchema }),
  z.strictObject({ name: z.literal('blobs.read'), blobId: blobIdSchema, offset: z.number().int().nonnegative(), length: z.number().int().positive().max(blobLimits.chunkBytes) }),
] as const;

// 07 §7.2, ADR 0136: ctx.files, served by the kernel's workspace I/O edge.
const workspaceCalls = [
  z.strictObject({ name: z.literal('workspace.read'), path: workspacePathSchema }),
  z.strictObject({ name: z.literal('workspace.write'), path: workspacePathSchema, content: fileContentSchema }),
  z.strictObject({ name: z.literal('workspace.list'), path: workspacePathSchema }),
  z.strictObject({ name: z.literal('workspace.stat'), path: workspacePathSchema }),
  z.strictObject({ name: z.literal('workspace.mkdir'), path: workspacePathSchema }),
  z.strictObject({ name: z.literal('workspace.rm'), path: workspacePathSchema, recursive: z.boolean() }),
  z.strictObject({ name: z.literal('workspace.glob'), pattern: z.string().min(1).max(4096) }),
] as const;

// 03 §3.7, ADR 0139: ctx.process, served by the kernel's process supervisor.
const processCalls = [
  z.strictObject({ name: z.literal('process.spawn'), options: spawnOptionsSchema }),
  z.strictObject({ name: z.literal('process.wait'), processId: ulidSchema }),
  z.strictObject({ name: z.literal('process.kill'), processId: ulidSchema }),
] as const;

export const rpcCallSchema = z.discriminatedUnion('name', [
  z.strictObject({
    name: z.literal('command'), type: typeNameSchema, payload: jsonSchema, options: commandOptionsSchema, ordinal: callNumberSchema,
    recorded: newRecordedValuesSchema,
  }),
  z.strictObject({ name: z.literal('query'), type: typeNameSchema, payload: jsonSchema }),
  z.strictObject({ name: z.literal('live'), type: typeNameSchema, key: z.string().min(1), chunk: liveChunkSchema }),
  z.strictObject({ name: z.literal('step.begin'), step: z.string().min(1), retrySafe: z.boolean(), recorded: newRecordedValuesSchema }),
  z.strictObject({ name: z.literal('step.end'), step: z.string().min(1), result: jsonSchema.exactOptional() }),
  // ADRs 0125, 0126: the merged config with the handler's own pending values, and one secret of its extension.
  z.strictObject({ name: z.literal('config.get'), pending: z.strictObject({ global: jsonObjectSchema.exactOptional(), workspace: jsonObjectSchema.exactOptional() }) }),
  z.strictObject({ name: z.literal('secret.get'), secret: secretNameSchema }),
  // ADR 0131: a sandboxed host's read, served by the read pool.
  z.strictObject({ name: z.literal('store.read'), read: storeReadSchema }),
  ...blobCalls,
  ...workspaceCalls,
  ...processCalls,
  z.strictObject({
    name: z.literal('log'), level: z.enum(['debug', 'info', 'warn', 'error']), message: z.string(), fields: jsonObjectSchema.exactOptional(),
  }),
]);
export type RpcCall = z.infer<typeof rpcCallSchema>;

export const rpcFrameSchema = z.strictObject({ frame: z.literal('rpc'), invocationId: invocationIdSchema, callId: callNumberSchema, call: rpcCallSchema });
export type RpcFrame = z.infer<typeof rpcFrameSchema>;

export const rpcResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), value: jsonSchema.exactOptional() }),
  z.strictObject({ ok: z.literal(false), problem: problemSchema }),
]);
export type RpcResult = z.infer<typeof rpcResultSchema>;

export const rpcResultFrameSchema = z.strictObject({
  frame: z.literal('rpcResult'), invocationId: invocationIdSchema, callId: callNumberSchema, result: rpcResultSchema,
});
export type RpcResultFrame = z.infer<typeof rpcResultFrameSchema>;

export const invocationOutcomeSchema = z.union([
  z.strictObject({ ok: z.literal(true), value: jsonSchema }),
  z.strictObject({ ok: z.literal(false), problem: problemSchema }),
  z.strictObject({ deferred: z.literal(true), onAbort: typeNameSchema.exactOptional() }),
]);
export type HostOutcome = z.infer<typeof invocationOutcomeSchema>;

export const deferredReplySchema = z.strictObject({ commandId: ulidSchema, payload: replyPayloadSchema });
export type DeferredReply = z.infer<typeof deferredReplySchema>;

export const hostUnitOfWorkSchema = z.strictObject({
  writes: z.array(storeWriteSchema),
  sends: z.array(outboundSendSchema),
  publishes: z.array(outboundPublishSchema),
  replies: z.array(deferredReplySchema),
  config: z.array(configWriteSchema),
  secrets: z.array(secretWriteSchema),
  blobRefs: z.array(blobRefChangeSchema),
});
export type HostUnitOfWork = z.infer<typeof hostUnitOfWorkSchema>;

export const completeFrameSchema = z.strictObject({
  frame: z.literal('complete'),
  invocationId: invocationIdSchema,
  outcome: invocationOutcomeSchema,
  unitOfWork: hostUnitOfWorkSchema,
  recorded: newRecordedValuesSchema,
});
export type CompleteFrame = z.infer<typeof completeFrameSchema>;

// ADR 0084: the invocation ended by cancel, its message deadline, or its handler timeout.
export const abortReasonSchema = z.enum(['cancelled', 'deadline', 'timeout']);
export type AbortReason = z.infer<typeof abortReasonSchema>;

export const abortFrameSchema = z.strictObject({ frame: z.literal('abort'), invocationId: invocationIdSchema, reason: abortReasonSchema });
export type AbortFrame = z.infer<typeof abortFrameSchema>;

// The extension could not be loaded for this invocation (ADRs 0071, 0081).
export const loadFailedFrameSchema = z.strictObject({ frame: z.literal('loadFailed'), invocationId: invocationIdSchema, problem: problemSchema });
export type LoadFailedFrame = z.infer<typeof loadFailedFrameSchema>;

export const kernelToHostFrameSchema = z.discriminatedUnion('frame', [invokeFrameSchema, rpcResultFrameSchema, abortFrameSchema]);
export type KernelToHostFrame = z.infer<typeof kernelToHostFrameSchema>;

export const hostToKernelFrameSchema = z.discriminatedUnion('frame', [rpcFrameSchema, completeFrameSchema, loadFailedFrameSchema]);
export type HostToKernelFrame = z.infer<typeof hostToKernelFrameSchema>;
