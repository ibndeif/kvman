import { describe, expect, it } from 'vitest';
import { messageRows, openRouterFixture, personCommand } from './harness.ts';

describe('the adapter path (plan 03 §3.3 step 7)', () => {
  it('M1.4-E24 a person\'s command commits alone; a refused one stores nothing', async () => {
    const fixture = openRouterFixture();
    const accepted = await personCommand(fixture, { type: 'pdf.translate', payload: { fileId: 'f1', lang: 'ar' } });
    expect(accepted).toMatchObject({ ok: true, state: 'pending' });
    if (!accepted.ok) throw new Error('refused');
    expect(messageRows(fixture)).toMatchObject([{ id: accepted.id, correlation_id: accepted.id, state: 'pending', handler: '@acme/pdf', lane: '@acme/pdf|file:f1' }]);
    const refused = await personCommand(fixture, { type: 'pdf.unknown', payload: {} });
    expect(refused).toMatchObject({ ok: false, problem: { code: 'TYPE_NOT_FOUND' } });
    expect(messageRows(fixture)).toHaveLength(1);
  });
});
