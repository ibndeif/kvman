import { describe, expect, it } from 'vitest';
import { causeMessage, handlerUnit, kernel, messageRows, openRouterFixture, workspaceA, type RouterFixture } from './harness.ts';
import { blob } from './outcomes.ts';

async function pdfPublishes(fixture: RouterFixture, publishes: Array<{ type: string; payload: object }>) {
  const cause = await causeMessage(fixture, 'pdf.import', kernel, { blobId: blob });
  return { cause, result: await handlerUnit(fixture, cause, '@acme/pdf', { publishes: publishes.map((publish) => ({ type: publish.type, payload: { ...publish.payload } })) }) };
}

describe('events (plan 02 §2.5, ADR 0053)', () => {
  it('M1.4-E19 a durable event is logged and delivered once per granted subscription', async () => {
    const fixture = openRouterFixture();
    fixture.grants.grant('@acme/audit', workspaceA, { derived: { subscribes: ['pdf.imported', 'pdf.*'], providesLlm: [] } });
    const { cause, result } = await pdfPublishes(fixture, [{ type: 'pdf.imported', payload: { fileId: 'f1' } }]);
    expect(result).toMatchObject({ committed: true });
    const events = fixture.connection.prepare('SELECT * FROM events').all();
    expect(events).toMatchObject([{ type: 'pdf.imported', source: 'ext:@acme/pdf', workspace_id: workspaceA, causation_id: cause.id, correlation_id: cause.correlationId }]);
    const eventId = String(events[0]?.['id']);
    const deliveries = messageRows(fixture, 'kind = ?', 'event');
    expect(deliveries.map((row) => row['handler'])).toEqual(['@acme/pdf|subscription:pdf.imported', '@acme/audit|subscription:pdf.imported', '@acme/audit|subscription:pdf.*']);
    for (const row of deliveries) {
      expect(row).toMatchObject({ state: 'pending', causation_id: eventId, type: 'pdf.imported', idempotency_key: `${eventId}:${String(row['handler'])}` });
      expect(row['id']).not.toBe(eventId);
    }
    expect(deliveries[2]?.['lane']).toBe('@acme/audit|file:f1');
  });

  it('M1.4-E20 a transient event is announced and not stored', async () => {
    const fixture = openRouterFixture();
    const { result } = await pdfPublishes(fixture, [{ type: 'pdf.changed', payload: { any: 1 } }]);
    expect(result).toMatchObject({ committed: true, announced: [{ type: 'pdf.changed', kind: 'event', delivery: 'transient' }] });
    expect(fixture.connection.prepare('SELECT * FROM events').all()).toEqual([]);
    expect(messageRows(fixture, 'kind = ?', 'event')).toEqual([]);
  });

  it('M1.4-E21 a subscriber lane that cannot render fails only that delivery', async () => {
    const fixture = openRouterFixture();
    fixture.grants.grant('@acme/audit', workspaceA, { derived: { subscribes: ['pdf.*'], providesLlm: [] } });
    fixture.grants.grant('@kvman/agent', workspaceA, { derived: { subscribes: ['pdf.exported'], providesLlm: [] } });
    const { result } = await pdfPublishes(fixture, [{ type: 'pdf.exported', payload: { name: 'report' } }]);
    expect(result).toMatchObject({ committed: true });
    const deliveries = messageRows(fixture, 'kind = ?', 'event');
    expect(deliveries.map((row) => [row['handler'], row['state']])).toEqual([
      ['@kvman/agent|subscription:pdf.exported', 'pending'],
      ['@acme/audit|subscription:pdf.*', 'failed'],
    ]);
    expect(JSON.parse(String(deliveries[1]?.['result']))).toMatchObject({ ok: false, problem: { code: 'VALIDATION_FAILED' } });
  });

  it('M1.4-E22 an event payload is validated, and publishes count toward the unit limit', async () => {
    const fixture = openRouterFixture();
    expect((await pdfPublishes(fixture, [{ type: 'pdf.imported', payload: { fileId: 3 } }])).result).toMatchObject({ committed: false, problem: { code: 'VALIDATION_FAILED' } });
    const cause = await causeMessage(fixture, 'pdf.import', kernel, { blobId: blob });
    const crowded = await handlerUnit(fixture, cause, '@acme/pdf', {
      sends: Array.from({ length: 600 }, () => ({ type: 'pdf.import', payload: { blobId: blob } })),
      publishes: Array.from({ length: 401 }, () => ({ type: 'pdf.changed', payload: {} })),
    });
    expect(crowded).toMatchObject({ committed: false, problem: { code: 'PAYLOAD_TOO_LARGE', params: { limit: 'messages', max: 1000 } } });
  });
});
