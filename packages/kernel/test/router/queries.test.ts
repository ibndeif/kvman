import { describe, expect, it } from 'vitest';
import { agentSender, causeMessage, messageRows, openRouterFixture, person, workspaceA } from './harness.ts';

describe('queries (plan 03 §3.3 step 7)', () => {
  it('M1.4-E23 a query is admitted for the priority path and never stored', async () => {
    const fixture = openRouterFixture();
    const byPerson = fixture.router.admitQuery({ sender: person, type: 'pdf.files.list', payload: {}, cause: undefined, workspaceId: workspaceA });
    expect(byPerson).toMatchObject({ ok: true, admitted: { handler: '@acme/pdf', message: { kind: 'query', source: 'user:local', priority: 'interactive', context: { locale: 'en' }, workspaceId: workspaceA } } });
    if (!byPerson.ok) throw new Error('the query was refused');
    expect(byPerson.admitted.message.correlationId).toBe(byPerson.admitted.message.id);
    expect(byPerson.admitted.message.lane).toBeUndefined();
    const cause = await causeMessage(fixture, 'agent.run');
    fixture.grants.grant('@kvman/agent', workspaceA, { requested: [{ name: 'calls', types: ['pdf.files.list'] }] });
    const byHandler = fixture.router.admitQuery({ sender: agentSender, type: 'pdf.files.list', payload: {}, cause, workspaceId: workspaceA });
    expect(byHandler).toMatchObject({ ok: true, admitted: { message: { causationId: cause.id, correlationId: cause.correlationId, priority: 'interactive' } } });
    expect(messageRows(fixture, 'type = ?', 'pdf.files.list')).toEqual([]);
    const denied = fixture.router.admitQuery({ sender: agentSender, type: 'pdf.files.list', payload: { extra: 1 }, cause, workspaceId: workspaceA });
    expect(denied).toMatchObject({ ok: false, problem: { code: 'VALIDATION_FAILED', issues: [{ path: 'payload.extra' }] } });
    const withoutGrant = openRouterFixture().router.admitQuery({ sender: agentSender, type: 'pdf.files.list', payload: {}, cause: undefined, workspaceId: workspaceA });
    expect(withoutGrant).toMatchObject({ ok: false, problem: { code: 'CAPABILITY_DENIED' } });
  });
});
