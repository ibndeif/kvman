import { describe, expect, it } from 'vitest';
import type { CommitResult, Sender } from '../../src/index.ts';
import { agentProcess, causeMessage, handlerUnit, kernel, now, openRouterFixture, personCommand, workspaceA, type RouterFixture } from './harness.ts';

const run = { type: 'agent.run', payload: {} };

function insertedMessage(result: CommitResult, index = 0) {
  if (!result.committed) throw new Error(`not committed: ${result.problem.code}`);
  const stored = result.inserted[index];
  if (stored === undefined) throw new Error(`nothing inserted: ${JSON.stringify(result)}`);
  return stored.message;
}

async function rootMessage(fixture: RouterFixture, sender: Sender, extra: object = {}) {
  return insertedMessage(await fixture.pipeline.enqueue({
    origin: { kind: 'adapter', sender, workspaceId: workspaceA, messageId: '01JAZ3K4M5N6P7Q8R9S0T1V2W3' },
    writes: [], sends: [{ ...run, ...(sender.address === 'kernel' ? {} : { idempotencyKey: `key-${sender.address}` }), ...extra }], publishes: [],
  }));
}

describe('envelope and assignment (plan 02 §2.2, §2.6, §2.10)', () => {
  it('M1.4-E1 malformed envelopes fail VALIDATION_FAILED at their path', async () => {
    const fixture = openRouterFixture();
    const cause = await causeMessage(fixture, 'agent.run');
    const pathOf = async (send: object) => {
      const result = await handlerUnit(fixture, cause, '@kvman/agent', { sends: [{ ...run, ...send }] });
      return result.committed ? 'committed' : `${result.problem.code} ${result.problem.issues?.[0]?.path ?? ''}`;
    };
    expect(await pathOf({ type: 'Pdf.Translate' })).toBe('VALIDATION_FAILED type');
    expect(await pathOf({ context: { note: 'x'.repeat(3000) } })).toBe('VALIDATION_FAILED context');
    expect(await pathOf({ delayMs: 10, at: now() + 10 })).toBe('VALIDATION_FAILED delayMs');
    for (const sender of [{ address: 'user:local' as const }, agentProcess]) {
      const result = await fixture.adapter.submitCommand({ sender, workspaceId: workspaceA, ...run });
      expect(result).toMatchObject({ ok: false, problem: { code: 'VALIDATION_FAILED', issues: [{ path: 'idempotencyKey' }] } });
    }
  });

  it('M1.4-E2 a root message starts a correlation; a handler send inherits it', async () => {
    const fixture = openRouterFixture();
    const root = await causeMessage(fixture, 'agent.run');
    expect(root).toMatchObject({ source: 'user:local', correlationId: root.id, createdAt: now(), context: { locale: 'en' }, workspaceId: workspaceA });
    expect(root.causationId).toBeUndefined();
    const child = insertedMessage(await handlerUnit(fixture, { ...root, context: { locale: 'en', sessionId: 's1' } }, '@kvman/agent', { sends: [{ ...run, context: { turn: 't1' } }] }));
    expect(child).toMatchObject({ correlationId: root.id, causationId: root.id, workspaceId: workspaceA, source: 'ext:@kvman/agent', context: { locale: 'en', sessionId: 's1', turn: 't1' } });
  });

  it('M1.4-E3 context additions may add and change keys, never a kernel-set one', async () => {
    const fixture = openRouterFixture();
    const cause = { ...(await causeMessage(fixture, 'agent.run')), context: { locale: 'ar', sessionId: 's1' } };
    const outcome = async (context: Record<string, string>) => {
      const result = await handlerUnit(fixture, cause, '@kvman/agent', { sends: [{ ...run, context }] });
      return result.committed ? 'committed' : result.problem.code;
    };
    expect(await outcome({ turn: 't1' })).toBe('committed');
    expect(await outcome({ sessionId: 's2' })).toBe('committed');
    expect(await outcome({ locale: 'ar' })).toBe('committed');
    expect(await outcome({ locale: 'en' })).toBe('VALIDATION_FAILED');
  });

  it('M1.4-E4 priorities follow the sender, inherit, and are only lowered', async () => {
    const fixture = openRouterFixture();
    expect((await rootMessage(fixture, { address: 'user:local' })).priority).toBe('interactive');
    expect((await rootMessage(openRouterFixture(), agentProcess)).priority).toBe('normal');
    expect((await rootMessage(openRouterFixture(), kernel)).priority).toBe('normal');
    const sendWith = async (extra: object) => {
      const cause = await causeMessage(fixture, 'agent.run');
      return insertedMessage(await handlerUnit(fixture, cause, '@kvman/agent', { sends: [{ ...run, ...extra }] })).priority;
    };
    expect(await sendWith({})).toBe('interactive');
    expect(await sendWith({ priority: 'background' })).toBe('background');
    expect((await rootMessage(openRouterFixture(), agentProcess, { priority: 'interactive' })).priority).toBe('normal');
    expect((await rootMessage(openRouterFixture(), kernel, { priority: 'interactive' })).priority).toBe('normal');
  });

  it('M1.4-E5 delayMs and at set notBefore; deadlineAt is kept as sent', async () => {
    const fixture = openRouterFixture();
    const at = now() + 60_000;
    const stored = async (extra: object) => {
      const result = await personCommand(fixture, { ...run, ...extra });
      if (!result.ok) throw new Error(result.problem.code);
      return fixture.connection.prepare('SELECT not_before, deadline_at FROM messages WHERE id = ?').get(result.id);
    };
    expect(await stored({ delayMs: 5000 })).toEqual({ not_before: now() + 5000, deadline_at: null });
    expect(await stored({ at })).toEqual({ not_before: at, deadline_at: null });
    expect(await stored({ deadlineAt: at })).toEqual({ not_before: null, deadline_at: at });
    expect(await stored({})).toEqual({ not_before: null, deadline_at: null });
  });
});
