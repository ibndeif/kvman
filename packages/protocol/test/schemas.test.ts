import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as protocol from '../src/index.ts';
import {
  accessSchema,
  addressSchema,
  commandRequestBodySchema,
  eventDeliverySchema,
  issueSchema,
  liveChunkSchema,
  messageKindSchema,
  messageSchema,
  prioritySchema,
  problemSchema,
  queryRequestBodySchema,
  replyPayloadSchema,
  subscriptionRequestBodySchema,
} from '../src/index.ts';
import {
  commandMessage,
  continuationSendMessage,
  durableEventMessage,
  liveEventMessage,
  messageId,
  queryMessage,
  reloadingProblem,
  uiCommandMessage,
  validationProblem,
  workspaceId,
} from './fixtures.ts';
import { expectRoundTrip, issuePaths } from './assertions.ts';

const commandBody = { payload: { fileId: 'f1' }, workspaceId, idempotencyKey: 'click-1', priority: 'normal', wait: 30_000 };

describe('messaging schemas (plan 02, 12 §12.2, 13 §13.1)', () => {
  it('M0.2-H1 every schema round-trips fixtures and converts to JSON Schema', () => {
    for (const address of ['kernel', 'ext:@kvman/agent', 'ext:pdf-lite', 'user:local', 'user:local/client:tab-1', 'proc:p1']) {
      expectRoundTrip(addressSchema, address);
    }
    for (const message of [commandMessage, queryMessage, durableEventMessage, liveEventMessage, uiCommandMessage, continuationSendMessage]) {
      expectRoundTrip(messageSchema, message);
    }
    for (const [schema, values] of [
      [messageKindSchema, ['command', 'query', 'event']],
      [eventDeliverySchema, ['durable', 'transient', 'live']],
      [accessSchema, ['all', 'user', 'extensions', 'internal']],
      [prioritySchema, ['interactive', 'normal', 'background']],
    ] as const) {
      for (const value of values) expectRoundTrip(schema, value);
    }
    for (const chunk of [{ text: 'مرحبا' }, { value: 0.5 }, { value: 1, label: { $t: 'progress.pages', count: 3 } }, { data: { page: 2 } }, { reset: true }]) {
      expectRoundTrip(liveChunkSchema, chunk);
    }
    expectRoundTrip(replyPayloadSchema, { ok: true, value: { blobId: 'b1' } });
    expectRoundTrip(replyPayloadSchema, { ok: false, problem: validationProblem });
    expectRoundTrip(problemSchema, validationProblem);
    expectRoundTrip(problemSchema, reloadingProblem);
    expectRoundTrip(problemSchema, { code: 'pdf/NOT_FOUND', title: 'No such file', params: { fileId: 'f1' }, retryable: false, correlationId: messageId });
    expectRoundTrip(issueSchema, { path: '', message: 'Required' });
    expectRoundTrip(commandRequestBodySchema, commandBody);
    expectRoundTrip(queryRequestBodySchema, { payload: { status: 'ready' }, workspaceId });
    expectRoundTrip(subscriptionRequestBodySchema, {
      stream: 's1', sid: 'q1', events: ['pdf.*', 'pdf.translated'], live: ['pdf.progress.updated:f1'], workspaceId, since: 120,
    });
    const schemas: z.ZodType[] = Object.values(protocol).flatMap((value) => (value instanceof z.ZodType ? [value] : []));
    expect(schemas.length).toBeGreaterThan(20);
    for (const schema of schemas) expect(z.toJSONSchema(schema)).toHaveProperty('$schema');
  });

  it('M0.2-E1 an address outside the five forms is rejected', () => {
    for (const address of ['agent', 'ext:', 'user:local/tab:1', 'proc:', 'user:', 'ext:Bad Name']) {
      expect(addressSchema.safeParse(address).success, address).toBe(false);
    }
  });

  it('M0.2-E2 identifiers that are not ULIDs are rejected at their path', () => {
    expect(issuePaths(messageSchema, { ...commandMessage, id: 'msg-1' })).toEqual(['id']);
    expect(issuePaths(messageSchema, { ...commandMessage, correlationId: messageId.toLowerCase() })).toEqual(['correlationId']);
    expect(issuePaths(messageSchema, { ...commandMessage, causationId: '81JAZ3K4M5N6P7Q8R9S0T1V2W3' })).toEqual(['causationId']);
  });

  it('M0.2-E3 a context over 2 KB is rejected; exactly 2,048 bytes is accepted', () => {
    const exactly = { k: 'x'.repeat(2048 - JSON.stringify({ k: '' }).length) };
    expect(messageSchema.safeParse({ ...commandMessage, context: exactly }).success).toBe(true);
    expect(issuePaths(messageSchema, { ...commandMessage, context: { ...exactly, k: `${exactly.k}é` } })).toEqual(['context']);
  });

  it('M0.2-E4 delivery is set on events and only on events', () => {
    expect(issuePaths(messageSchema, { ...commandMessage, delivery: 'durable' })).toEqual(['delivery']);
    expect(issuePaths(messageSchema, { ...queryMessage, delivery: 'transient' })).toEqual(['delivery']);
    const { delivery: _delivery, ...eventWithoutDelivery } = durableEventMessage;
    expect(issuePaths(messageSchema, eventWithoutDelivery)).toEqual(['delivery']);
  });

  it('M0.2-E5 target is allowed only on ui.* commands', () => {
    expect(issuePaths(messageSchema, { ...commandMessage, target: 'user:local' })).toEqual(['target']);
    expect(issuePaths(messageSchema, { ...durableEventMessage, type: 'ui.toasted', target: 'user:local' })).toEqual(['target']);
  });

  it('M0.2-E6 envelopes are strict', () => {
    expect(issuePaths(messageSchema, { ...commandMessage, extra: true })).toEqual(['']);
  });

  it('M0.2-E7 a workspace id that is not 64 lowercase hex characters is rejected', () => {
    for (const id of ['A'.repeat(64), 'a'.repeat(63), 'g'.repeat(64)]) {
      expect(issuePaths(messageSchema, { ...commandMessage, workspaceId: id })).toEqual(['workspaceId']);
    }
  });

  it('M0.2-E8 malformed live chunks are rejected', () => {
    for (const chunk of [{ value: 1.5 }, { value: -0.1 }, { text: 'a', value: 0.5 }, { reset: false }, {}]) {
      expect(liveChunkSchema.safeParse(chunk).success, JSON.stringify(chunk)).toBe(false);
    }
  });

  it('M0.2-E9 a live chunk over 16 KB is rejected', () => {
    const limit = 16 * 1024 - JSON.stringify({ text: '' }).length;
    expect(liveChunkSchema.safeParse({ text: 'x'.repeat(limit) }).success).toBe(true);
    expect(liveChunkSchema.safeParse({ text: 'x'.repeat(limit + 1) }).success).toBe(false);
  });

  it('M0.2-E10 a reply needs its value or its problem', () => {
    expect(replyPayloadSchema.safeParse({ ok: true }).success).toBe(false);
    expect(replyPayloadSchema.safeParse({ ok: false }).success).toBe(false);
  });

  it('M0.2-E11 problems need correlationId and retryable; issue severity is error or warning', () => {
    const { correlationId: _correlationId, ...withoutCorrelation } = reloadingProblem;
    expect(issuePaths(problemSchema, withoutCorrelation)).toEqual(['correlationId']);
    const { retryable: _retryable, ...withoutRetryable } = reloadingProblem;
    expect(issuePaths(problemSchema, withoutRetryable)).toEqual(['retryable']);
    expect(issuePaths(issueSchema, { path: 'a', message: 'b', severity: 'info' })).toEqual(['severity']);
  });

  it('M0.2-E12 command bodies need an idempotency key, a wait of 0–60,000, and no unknown keys', () => {
    const { idempotencyKey: _key, ...withoutKey } = commandBody;
    expect(issuePaths(commandRequestBodySchema, withoutKey)).toEqual(['idempotencyKey']);
    expect(issuePaths(commandRequestBodySchema, { ...commandBody, wait: 60_001 })).toEqual(['wait']);
    expect(issuePaths(commandRequestBodySchema, { ...commandBody, wait: -1 })).toEqual(['wait']);
    expect(commandRequestBodySchema.safeParse({ ...commandBody, wait: 0 }).success).toBe(true);
    expect(issuePaths(commandRequestBodySchema, { ...commandBody, deadline: 5 })).toEqual(['']);
  });

  it('M0.2-E13 subscription patterns and live addresses are checked', () => {
    const base = { stream: 's1', sid: 'q1' };
    expect(issuePaths(subscriptionRequestBodySchema, { ...base, events: ['*'] })).toEqual(['events.0']);
    expect(issuePaths(subscriptionRequestBodySchema, { ...base, events: ['pdf.*.list'] })).toEqual(['events.0']);
    expect(issuePaths(subscriptionRequestBodySchema, { ...base, live: ['pdf.progress.updated'] })).toEqual(['live.0']);
    expect(subscriptionRequestBodySchema.safeParse({ ...base, events: ['pdf.*', 'kernel.extension.*', 'pdf.translated'] }).success).toBe(true);
  });
});
