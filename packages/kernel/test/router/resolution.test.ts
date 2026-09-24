import { describe, expect, it } from 'vitest';
import { handlerUnit, causeMessage, kernel, messageRows, openRouterFixture, person, workspaceA } from './harness.ts';
import { blob } from './outcomes.ts';

describe('type resolution (plan 03 §3.3 step 3, ADRs 0048, 0058)', () => {
  it('M1.4-E6 a message of another kind than its type is TYPE_NOT_FOUND', async () => {
    const fixture = openRouterFixture();
    const cause = await causeMessage(fixture, 'pdf.import', kernel, { blobId: blob });
    const sent = await handlerUnit(fixture, cause, '@acme/pdf', { sends: [{ type: 'pdf.files.list', payload: {} }] });
    expect(sent).toMatchObject({ committed: false, problem: { code: 'TYPE_NOT_FOUND', detail: '"pdf.files.list" is a query, not a command' } });
    const queried = fixture.router.admitQuery({ sender: person, type: 'pdf.translate', payload: {}, cause: undefined, workspaceId: workspaceA });
    expect(queried).toMatchObject({ ok: false, problem: { code: 'TYPE_NOT_FOUND', detail: '"pdf.translate" is a command, not a query' } });
    const published = await handlerUnit(fixture, cause, '@acme/pdf', { publishes: [{ type: 'pdf.translate', payload: {} }] });
    expect(published).toMatchObject({ committed: false, problem: { code: 'TYPE_NOT_FOUND', detail: '"pdf.translate" is a command, not an event' } });
  });

  it('M1.4-E7 a global type runs without a workspace; a workspace type needs one', async () => {
    const fixture = openRouterFixture();
    const global = await fixture.adapter.submitCommand({ sender: person, workspaceId: workspaceA, idempotencyKey: 'login-1', type: 'agent.login.start', payload: {} });
    expect(global).toMatchObject({ ok: true, state: 'pending' });
    expect(messageRows(fixture)[0]).toMatchObject({ type: 'agent.login.start', workspace_id: null });
    const unscoped = await fixture.adapter.submitCommand({ sender: person, idempotencyKey: 'translate-1', type: 'pdf.translate', payload: { fileId: 'f1', lang: 'ar' } });
    expect(unscoped).toMatchObject({ ok: false, problem: { code: 'WORKSPACE_INVALID' } });
  });
});
