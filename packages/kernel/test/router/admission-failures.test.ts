import { describe, expect, it } from 'vitest';
import { causeMessage, handlerUnit, messageRows, openRouterFixture, personCommand, workspaceA } from './harness.ts';

const translate = { type: 'pdf.translate', payload: { fileId: 'f1', lang: 'ar' } };

describe('admission failures (plan 03 §3.3)', () => {
  it('M1.4-H1 a payload that fails its schema is VALIDATION_FAILED', async () => {
    const fixture = openRouterFixture();
    const result = await personCommand(fixture, { type: 'pdf.translate', payload: { fileId: 7 } });
    expect(result).toMatchObject({ ok: false, problem: { code: 'VALIDATION_FAILED' } });
    expect(result.ok ? [] : result.problem.issues?.map((issue) => issue.path).sort()).toEqual(['payload.fileId', 'payload.lang']);
    expect(messageRows(fixture)).toEqual([]);
  });

  it('M1.4-H2 an unknown type is TYPE_NOT_FOUND', async () => {
    const fixture = openRouterFixture();
    expect(await personCommand(fixture, { type: 'pdf.unknown', payload: {} })).toMatchObject({ ok: false, problem: { code: 'TYPE_NOT_FOUND' } });
  });

  it('M1.4-H3 an owner not enabled in the workspace is HANDLER_UNAVAILABLE', async () => {
    const fixture = openRouterFixture();
    expect(await personCommand(fixture, { type: 'ocr.extract', payload: {}, workspaceId: workspaceA })).toMatchObject({ ok: false, problem: { code: 'HANDLER_UNAVAILABLE' } });
  });

  it('M1.4-H4 a foreign command without a grant is CAPABILITY_DENIED', async () => {
    const fixture = openRouterFixture();
    const cause = await causeMessage(fixture, 'agent.run');
    const denied = await handlerUnit(fixture, cause, '@kvman/agent', { sends: [translate] });
    expect(denied).toMatchObject({ committed: false, problem: { code: 'CAPABILITY_DENIED' } });
    fixture.grants.grant('@kvman/agent', workspaceA, { requested: [{ name: 'calls', types: ['pdf.*'] }] });
    expect(await handlerUnit(fixture, cause, '@kvman/agent', { sends: [translate] })).toMatchObject({ committed: true });
  });

  it('M1.4-H5 a caller outside the access is CALLER_NOT_ALLOWED', async () => {
    const fixture = openRouterFixture();
    expect(await personCommand(fixture, { type: 'agent.prompt.section.set', payload: {} })).toMatchObject({ ok: false, problem: { code: 'CALLER_NOT_ALLOWED' } });
  });

  it('M1.4-H6 a reused key with another payload is IDEMPOTENCY_MISMATCH', async () => {
    const fixture = openRouterFixture();
    expect(await personCommand(fixture, { ...translate, idempotencyKey: 'click-1' })).toMatchObject({ ok: true, state: 'pending' });
    const again = await personCommand(fixture, { type: 'pdf.translate', payload: { fileId: 'f1', lang: 'fr' }, idempotencyKey: 'click-1' });
    expect(again).toMatchObject({ ok: false, problem: { code: 'IDEMPOTENCY_MISMATCH' } });
    expect(messageRows(fixture)).toHaveLength(1);
  });

  it('M1.4-H7 the same key and digest return the original message', async () => {
    const fixture = openRouterFixture();
    const first = await personCommand(fixture, { ...translate, idempotencyKey: 'click-1' });
    if (!first.ok) throw new Error('the first command failed');
    fixture.connection.prepare("UPDATE messages SET state = 'done', result = ? WHERE id = ?").run(JSON.stringify({ ok: true, value: { blobId: 'b' } }), first.id);
    const again = await personCommand(fixture, { ...translate, idempotencyKey: 'click-1' });
    expect(again).toEqual({ ok: true, id: first.id, state: 'done', reply: { ok: true, value: { blobId: 'b' } } });
    expect(messageRows(fixture)).toHaveLength(1);
  });
});
