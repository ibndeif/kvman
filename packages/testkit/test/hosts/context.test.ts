import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHostFixture, row, send, value, workspaceA, workspaceB, type HostFixture, workerTests } from './harness.ts';

let fixture: HostFixture;
beforeEach(() => {
  fixture = openHostFixture();
});
afterEach(() => fixture.close());

describe('the invocation context (plan 05 §5.4, ADRs 0066, 0073, 0075)', workerTests, () => {
  it('M1.6-E36 ctx.message, ctx.context, and ctx.workspace', async () => {
    const id = await send(fixture, 'notes.describe');
    const workspace = { id: workspaceA, path: '/w/a', name: 'A' };
    expect(await fixture.runtime.awaitReply(id)).toEqual({
      ok: true, value: { message: { id, type: 'notes.describe', source: 'user:local' }, context: { locale: 'en' }, workspace },
    });
    expect(await value(fixture, 'notes.describe.nested')).toMatchObject({
      message: { type: 'notes.describe', source: 'ext:@acme/notes' }, context: { locale: 'en', sessionId: 's1' }, workspace,
    });
    expect(await value(fixture, 'notes.global.describe')).toEqual({ workspace: null });
  });

  it('M1.6-E37 a message whose workspace has no row fails WORKSPACE_INVALID', async () => {
    const id = await send(fixture, 'notes.add', { text: 'hi' }, { workspaceId: workspaceB });
    expect(await fixture.runtime.awaitReply(id)).toMatchObject({ ok: false, problem: { code: 'WORKSPACE_INVALID', retryable: false } });
    expect(row(fixture, id)).toMatchObject({ state: 'failed', attempts: 0 });
  });

  it('M1.6-E38 ctx.log lines are attributed and redacted', async () => {
    const id = await send(fixture, 'notes.log');
    await fixture.runtime.awaitReply(id);
    const attributes = { correlationId: id, messageId: id, type: 'notes.log', extension: '@acme/notes', workspaceId: workspaceA, attempt: 1 };
    expect(fixture.logged).toEqual([
      { level: 'info', message: 'fetched', fields: { url: 'https://[redacted]@h/x', apiKey: '[redacted]', nested: { password: '[redacted]' }, count: 2 }, attributes },
      { level: 'warn', message: 'Bearer [redacted]', fields: {}, attributes },
    ]);
  });
});
