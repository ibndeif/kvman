import { describe, expect, it } from 'vitest';
import { hostToKernelFrameSchema, kernelToHostFrameSchema, manifestSchema } from '../src/index.ts';
import { copyOf } from './assertions.ts';
import { commandMessage, messageId, validationProblem, workspaceId } from './fixtures.ts';
import pdfManifestFixture from './fixtures/pdf-manifest.json' with { type: 'json' };

const noValues = { id: [], now: [] };

const invoke = {
  frame: 'invoke', invocationId: 'i-1', extension: '@acme/pdf', handler: 'command:pdf.translate', kind: 'command',
  message: commandMessage, readOnly: false, deadlineAt: 1_790_000_060_000, workspace: { id: workspaceId, path: '/w/a', name: 'A' },
  recorded: { id: [messageId], now: [1_790_000_000_000] },
  module: { entry: '/x/extension.ts', manifest: manifestSchema.parse(pdfManifestFixture) },
};

const rpcResult = { frame: 'rpcResult', invocationId: 'i-1', callId: 1, result: { ok: false, problem: validationProblem } };

const rpcCalls = [
  { name: 'command', type: 'ocr.extract', payload: {}, options: { priority: 'background' }, ordinal: 1, recorded: { id: [{ n: 1, value: messageId }], now: [] } },
  { name: 'query', type: 'ocr.jobs.list', payload: {} },
  { name: 'live', type: 'pdf.progress.updated', key: 'f1', chunk: { value: 0.5 } },
  { name: 'step.begin', step: 'fetch', retrySafe: false, recorded: noValues },
  { name: 'step.end', step: 'fetch', result: { ok: 1 } },
  { name: 'log', level: 'info', message: 'fetched', fields: { count: 2 } },
  { name: 'config.get', pending: { workspace: { limit: 3 } } },
  { name: 'secret.get', secret: 'apiKey' },
];

const complete = {
  frame: 'complete', invocationId: 'i-1', outcome: { deferred: true, onAbort: 'pdf.question.expire' },
  unitOfWork: {
    writes: [{ kind: 'kv.set', scope: 'workspace', key: 'k', value: 1 }], sends: [{ type: 'ocr.extract', payload: {} }],
    publishes: [{ type: 'pdf.translated', payload: {} }], replies: [{ commandId: messageId, payload: { ok: true, value: null } }],
    config: [{ scope: 'workspace', value: { limit: 3 } }], secrets: [{ name: 'apiKey', value: 'sk-1' }, { name: 'oauth.token', value: null }],
    blobRefs: [{ blobId: 'b'.repeat(64), scope: 'workspace', op: 'keep' }],
  },
  recorded: noValues,
};

describe('host frames', () => {
  it('M1.6-E41 each frame parses its valid example and rejects unknown fields and mixed-up call arguments', () => {
    expect(kernelToHostFrameSchema.parse(invoke)).toEqual(invoke);
    expect(kernelToHostFrameSchema.parse(rpcResult)).toEqual(rpcResult);
    for (const call of rpcCalls) {
      const frame = { frame: 'rpc', invocationId: 'i-1', callId: 2, call };
      expect(hostToKernelFrameSchema.parse(frame)).toEqual(frame);
    }
    expect(hostToKernelFrameSchema.parse(complete)).toEqual(complete);

    expect(kernelToHostFrameSchema.safeParse({ ...invoke, timeoutMs: 1 }).success).toBe(false);
    const { deadlineAt: _deadline, ...withoutDeadline } = invoke;
    expect(kernelToHostFrameSchema.safeParse(withoutDeadline).success).toBe(false);
    expect(hostToKernelFrameSchema.safeParse({ ...complete, unitOfWork: { ...complete.unitOfWork, processes: [] } }).success).toBe(false);
    const mixed = copyOf(rpcCalls[3]);
    expect(hostToKernelFrameSchema.safeParse({ frame: 'rpc', invocationId: 'i-1', callId: 3, call: { ...mixed, name: 'step.end' } }).success).toBe(false);
    expect(hostToKernelFrameSchema.safeParse({ frame: 'rpc', invocationId: 'i-1', callId: 3, call: { name: 'query', type: 'ocr.jobs.list', payload: {}, ordinal: 1 } }).success).toBe(false);
    expect(hostToKernelFrameSchema.safeParse({ ...complete, outcome: { ok: true } }).success).toBe(false);
  });
});
