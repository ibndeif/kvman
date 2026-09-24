import type { OutboundSend } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import type { CommitUnit } from '../../src/index.ts';
import { invocationMessage, openTestStore, rows } from './harness.ts';

const agent = '@kvman/agent';
const onReply = { type: 'agent.tool.record', context: { sessionId: 's1', toolCallId: 'c1' } };

async function unitSending(send: OutboundSend, owners: Record<string, string>, invalidField?: string) {
  const store = openTestStore({ 'agent.step': agent, 'agent.tool.record': agent, ...owners }, invalidField);
  const message = await invocationMessage(store, 'agent.step');
  const unit: CommitUnit = {
    origin: { kind: 'invocation', invocation: { message, extension: agent, outcome: { ok: true, value: null } } },
    writes: [{ kind: 'kv.set', scope: 'workspace', key: 'turn:s1', value: { status: 'awaiting-tools' } }],
    sends: [send],
  };
  return { store, message, result: await store.pipeline.enqueue(unit) };
}

describe('failed sends (plan 04 §4.2, ADR 0034)', () => {
  it('M1.1-H5 a failed send with onReply commits the unit and delivers the failure', async () => {
    const { store, result } = await unitSending({ type: 'shell.exec', payload: { command: 'ls' }, onReply }, {});
    expect(result.committed).toBe(true);
    const [failed, continuation] = rows(store.connection, "SELECT id, type, state, handler, result, payload, idempotency_key FROM messages WHERE type != 'agent.step' ORDER BY seq");
    expect(failed).toMatchObject({ type: 'shell.exec', state: 'failed', handler: '' });
    const reply = JSON.parse(String(failed?.['result'])) as { ok: boolean; problem: { code: string } };
    expect(reply).toMatchObject({ ok: false, problem: { code: 'TYPE_NOT_FOUND' } });
    expect(continuation).toMatchObject({ type: 'agent.tool.record', state: 'pending', handler: agent, idempotency_key: `${String(failed?.['id'])}:reply` });
    expect(JSON.parse(String(continuation?.['payload']))).toEqual({ reply, context: onReply.context });
    expect(rows(store.connection, 'SELECT key FROM kv')).toEqual([{ key: 'turn:s1' }]);
  });

  it('M1.1-H6 a failed send without onReply fails the unit', async () => {
    const { store, message, result } = await unitSending({ type: 'shell.exec', payload: { command: 'ls' } }, {});
    expect(result).toMatchObject({ committed: false, problem: { code: 'TYPE_NOT_FOUND', retryable: false } });
    expect(rows(store.connection, 'SELECT count(*) AS n FROM kv')).toEqual([{ n: 0 }]);
    expect(rows(store.connection, 'SELECT type, state FROM messages')).toEqual([{ type: 'agent.step', state: 'pending' }]);
    expect(message.type).toBe('agent.step');
  });

  it('M1.1-E18 a known type that rejects the payload keeps its owner as handler', async () => {
    const { store, result } = await unitSending({ type: 'shell.exec', payload: { invalid: true }, onReply }, { 'shell.exec': '@kvman/shell' }, 'invalid');
    expect(result.committed).toBe(true);
    expect(rows(store.connection, "SELECT handler, state FROM messages WHERE type = 'shell.exec'")).toEqual([{ handler: '@kvman/shell', state: 'failed' }]);
    expect(rows(store.connection, "SELECT state FROM messages WHERE type = 'agent.tool.record'")).toEqual([{ state: 'pending' }]);
  });

  it('M1.1-E19 a continuation that cannot be admitted rejects the whole unit', async () => {
    const { store, result } = await unitSending({ type: 'shell.exec', payload: {}, onReply: { type: 'agent.missing.record' } }, {});
    expect(result).toMatchObject({ committed: false, problem: { code: 'TYPE_NOT_FOUND' } });
    expect(rows(store.connection, 'SELECT count(*) AS n FROM messages')).toEqual([{ n: 1 }]);
    expect(rows(store.connection, 'SELECT count(*) AS n FROM kv')).toEqual([{ n: 0 }]);
  });
});
