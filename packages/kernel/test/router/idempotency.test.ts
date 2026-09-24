import { requestDigest } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import { causeMessage, handlerUnit, kernel, messageRows, openRouterFixture, workspaceA } from './harness.ts';
import { blob } from './outcomes.ts';

const recordReply = { type: 'agent.tool.record', context: { toolCallId: 't1' } };

describe('idempotency (plan 02 §2.7, ADRs 0034, 0057, 0058)', () => {
  it('M1.4-E15 derived keys and request digests', async () => {
    const fixture = openRouterFixture();
    const cause = await causeMessage(fixture, 'agent.run');
    await handlerUnit(fixture, cause, '@kvman/agent', { sends: [{ type: 'agent.run', payload: {} }, { type: 'agent.run', payload: {} }] });
    const sent = messageRows(fixture, 'causation_id = ?', cause.id);
    expect(sent.map((row) => row['idempotency_key'])).toEqual([`${cause.id}:send:0`, `${cause.id}:send:1`]);
    expect(sent[0]?.['digest']).toBe(await requestDigest({ type: 'agent.run', workspaceId: workspaceA, payload: {} }));
    const translated = await causeMessage(fixture, 'pdf.translate', kernel, { fileId: 'f1', lang: 'ar' });
    expect(messageRows(fixture, 'id = ?', translated.id)[0]?.['digest']).toBe(await requestDigest({ type: 'pdf.translate', workspaceId: workspaceA, lane: 'file:f1', payload: { fileId: 'f1', lang: 'ar' } }));
    const failing = await causeMessage(fixture, 'agent.run');
    await handlerUnit(fixture, failing, '@kvman/agent', { sends: [{ type: 'agent.unknown', payload: {}, onReply: recordReply }] });
    const [failed, continuation] = messageRows(fixture, 'correlation_id = ? AND id != ?', failing.correlationId, failing.id);
    expect(continuation?.['idempotency_key']).toBe(`${String(failed?.['id'])}:reply`);
  });

  it('M1.4-E16 an explicit key dedupes a command across invocations', async () => {
    const fixture = openRouterFixture();
    const inject = { type: 'pdf.import', payload: { blobId: blob }, idempotencyKey: 'job-7:result' };
    const first = await handlerUnit(fixture, await causeMessage(fixture, 'pdf.import', kernel, { blobId: blob }), '@acme/pdf', { sends: [inject] });
    const second = await handlerUnit(fixture, await causeMessage(fixture, 'pdf.import', kernel, { blobId: blob }), '@acme/pdf', { sends: [inject] });
    expect(first).toMatchObject({ committed: true, inserted: [{ message: { idempotencyKey: 'job-7:result' } }] });
    expect(second).toMatchObject({ committed: true, inserted: [], duplicates: [{ state: 'pending' }] });
    expect(messageRows(fixture, 'idempotency_key = ?', 'job-7:result')).toHaveLength(1);
  });

  it('M1.4-E17 a mismatched key with onReply is stored failed without the key', async () => {
    const fixture = openRouterFixture();
    fixture.grants.grant('@kvman/agent', workspaceA, { requested: [{ name: 'calls', types: ['pdf.*'] }] });
    await handlerUnit(fixture, await causeMessage(fixture, 'agent.run'), '@kvman/agent', { sends: [{ type: 'pdf.batch', payload: { batch: 'a', part: 1 }, idempotencyKey: 'k1' }] });
    const cause = await causeMessage(fixture, 'agent.run');
    const result = await handlerUnit(fixture, cause, '@kvman/agent', { sends: [{ type: 'pdf.batch', payload: { batch: 'b', part: 1 }, idempotencyKey: 'k1', onReply: recordReply }] });
    expect(result).toMatchObject({ committed: true });
    const [failed, continuation] = messageRows(fixture, 'causation_id = ? OR causation_id IN (SELECT id FROM messages WHERE causation_id = ?)', cause.id, cause.id);
    expect(failed).toMatchObject({ type: 'pdf.batch', state: 'failed', idempotency_key: null });
    expect(JSON.parse(String(failed?.['result']))).toMatchObject({ ok: false, problem: { code: 'IDEMPOTENCY_MISMATCH' } });
    expect(continuation).toMatchObject({ type: 'agent.tool.record', state: 'pending' });
    expect(JSON.parse(String(continuation?.['payload']))).toMatchObject({ reply: { ok: false, problem: { code: 'IDEMPOTENCY_MISMATCH' } }, context: { toolCallId: 't1' } });
    expect(messageRows(fixture, 'idempotency_key = ?', 'k1')).toMatchObject([{ state: 'pending' }]);
  });

  it('M1.4-E18 onReply names one of the sender\'s own internal commands', async () => {
    const fixture = openRouterFixture();
    for (const type of ['pdf.record', 'agent.run', 'agent.nothing']) {
      const result = await handlerUnit(fixture, await causeMessage(fixture, 'agent.run'), '@kvman/agent', {
        sends: [{ type: 'agent.run', payload: {}, onReply: { type } }],
      });
      expect(result).toMatchObject({ committed: false, problem: { code: 'VALIDATION_FAILED', issues: [{ path: 'onReply.type', hint: 'a continuation is one of your own internal commands' }] } });
    }
  });
});
