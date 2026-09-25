import { describe, expect, it } from 'vitest';
import { cancelRequestSchema, cancelResultSchema, extensionQuarantinedSchema, kernelToHostFrameSchema } from '../src/index.ts';
import { commandMessage, messageId } from './fixtures.ts';

describe('kernel command and event shapes (plan 02 §2.9, 03 §3.6)', () => {
  it('M1.7-E21 the cancel, quarantine, invoke, and abort shapes', () => {
    expect(cancelRequestSchema.parse({ messageId })).toEqual({ messageId });
    expect(cancelRequestSchema.parse({ correlationId: messageId })).toEqual({ correlationId: messageId });
    expect(cancelRequestSchema.safeParse({}).success).toBe(false);
    expect(cancelRequestSchema.safeParse({ messageId, correlationId: messageId }).success).toBe(false);
    expect(cancelResultSchema.parse({ cancelled: 0 })).toEqual({ cancelled: 0 });
    expect(extensionQuarantinedSchema.parse({ name: '@acme/pdf', reason: 'EXT_MANIFEST_INVALID' })).toEqual({ name: '@acme/pdf', reason: 'EXT_MANIFEST_INVALID' });
    expect(extensionQuarantinedSchema.safeParse({ name: '@acme/pdf', reason: 'TIRED' }).success).toBe(false);
    expect(kernelToHostFrameSchema.parse({ frame: 'abort', invocationId: 'i-1', reason: 'timeout' })).toEqual({ frame: 'abort', invocationId: 'i-1', reason: 'timeout' });
    expect(kernelToHostFrameSchema.safeParse({ frame: 'abort', invocationId: 'i-1', reason: 'bored' }).success).toBe(false);
    const invoke = {
      frame: 'invoke', invocationId: 'i-1', extension: '@acme/pdf', handler: 'command:pdf.translate', kind: 'command', message: commandMessage,
      readOnly: false, recorded: { id: [], now: [] },
    };
    expect(kernelToHostFrameSchema.safeParse(invoke).success).toBe(false);
    expect(kernelToHostFrameSchema.safeParse({ ...invoke, deadlineAt: 1 }).success).toBe(true);
  });
});
