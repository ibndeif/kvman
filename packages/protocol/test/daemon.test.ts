import { describe, expect, it } from 'vitest';
import {
  commandAcceptedResponseSchema, commandReplyResponseSchema, daemonLockSchema, daemonStartReportSchema, healthResultSchema,
  kernelStartedSchema, messageStatusSchema, queryResponseSchema, shutdownRequestSchema, shutdownResultSchema, sseMessageSchemas,
  subscriptionCreatedSchema,
} from '../src/index.ts';
import { expectRoundTrip, issuePaths } from './assertions.ts';

const id = '01JAZ3K4M5N6P7Q8R9S0T1V2W3';
const nonce = '0b5c7f2e-4a1d-4c3b-9e8f-1a2b3c4d5e6f';
const problem = { code: 'NOT_FOUND', title: 'The resource does not exist', retryable: false, correlationId: id };

describe('daemon, health, and HTTP shapes (plan 03 §3.8–§3.10, 12 §12.2–§12.3, ADRs 0087–0098)', () => {
  it('M1.8-E68 each shape parses its example and rejects unknown fields and other values', () => {
    const lock = { pid: 4242, processStart: 'Thu Sep 25 10:00:00 2026', nonce, port: 4173, startedAt: 1_790_000_000_000 };
    expectRoundTrip(daemonLockSchema, lock);
    expect(issuePaths(daemonLockSchema, { ...lock, nonce: 'not-a-uuid' })).toEqual(['nonce']);
    expect(issuePaths(daemonLockSchema, { ...lock, host: '127.0.0.1' })).toEqual(['']);

    expectRoundTrip(daemonStartReportSchema, { ok: true, port: 4174 });
    expectRoundTrip(daemonStartReportSchema, { ok: false, problem: { ...problem, code: 'DAEMON_CONFLICT', title: 'Another kernel owns this home folder' } });
    expect(daemonStartReportSchema.safeParse({ ok: true, port: 4174, problem }).success).toBe(false);

    const health = { status: 'degraded', version: '0.0.0', instanceId: nonce, processStart: lock.processStart, uptimeMs: 12, port: 4173, home: '/h' };
    expectRoundTrip(healthResultSchema, health);
    expect(issuePaths(healthResultSchema, { ...health, status: 'starting' })).toEqual(['status']);
    expectRoundTrip(kernelStartedSchema, { version: '0.0.0', instanceId: nonce });
    expectRoundTrip(shutdownRequestSchema, {});
    expectRoundTrip(shutdownResultSchema, {});
    expect(shutdownRequestSchema.safeParse({ now: true }).success).toBe(false);

    expectRoundTrip(commandReplyResponseSchema, { id, reply: { noteId: 'n1' } });
    expectRoundTrip(commandAcceptedResponseSchema, { id, state: 'awaiting' });
    expect(issuePaths(commandAcceptedResponseSchema, { id, state: 'waiting' })).toEqual(['state']);
    expectRoundTrip(queryResponseSchema, { data: [1, 2] });
    expectRoundTrip(messageStatusSchema, { id, type: 'notes.relay', state: 'done', reply: { answer: 'yes' } });
    expectRoundTrip(messageStatusSchema, { id, type: 'notes.relay', state: 'failed', problem });
    expectRoundTrip(messageStatusSchema, { id, type: 'notes.relay', state: 'pending' });
    expectRoundTrip(subscriptionCreatedSchema, { sid: 'q1' });

    expectRoundTrip(sseMessageSchemas.resync, { reason: 'cursor-expired' });
    expectRoundTrip(sseMessageSchemas.resync, { reason: 'cursor-unknown' });
    expect(issuePaths(sseMessageSchemas.resync, { reason: 'cursor too old' })).toEqual(['reason']);
  });
});
