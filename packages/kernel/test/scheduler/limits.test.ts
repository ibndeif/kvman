import { describe, expect, it } from 'vitest';
import { complete, openSchedulerFixture, pdfHandlers, row, submit, workspaceA, type SchedulerFixture } from './harness.ts';

function inFlightOf(fixture: SchedulerFixture, type: string): number {
  return fixture.dispatcher.running().filter((id) => row(fixture, id)['type'] === type).length;
}

function query(fixture: SchedulerFixture): string {
  const admission = fixture.router.admitQuery({ sender: { address: 'user:local' }, type: 'pdf.files.list', payload: {}, cause: undefined, workspaceId: workspaceA });
  if (!admission.ok) throw new Error(admission.problem.code);
  fixture.scheduler.submitQuery(admission.admitted);
  return admission.admitted.message.id;
}

describe('limits (plan 03 §3.4, ADR 0060)', () => {
  it('M1.5-E6 a handler runs at most its concurrency, 16 by default', async () => {
    const fixture = openSchedulerFixture();
    for (let index = 0; index < 5; index += 1) await submit(fixture, 'pdf.import');
    for (let index = 0; index < 20; index += 1) await submit(fixture, 'pdf.render');
    expect(inFlightOf(fixture, 'pdf.import')).toBe(2);
    expect(inFlightOf(fixture, 'pdf.render')).toBe(16);
    const running = fixture.dispatcher.running().find((id) => row(fixture, id)['type'] === 'pdf.import') ?? '';
    await complete(fixture, running);
    expect(inFlightOf(fixture, 'pdf.import')).toBe(2);
    expect(fixture.dispatcher.claims.filter((claim) => claim.message.type === 'pdf.import')).toHaveLength(3);
  });

  it('M1.5-E7 an extension runs at most 64 messages at once', async () => {
    const fixture = openSchedulerFixture();
    fixture.dispatcher.setCommandSlots('@acme/pdf', 0);
    for (let index = 0; index < 70; index += 1) await submit(fixture, pdfHandlers[index % pdfHandlers.length] ?? 'pdf.render');
    fixture.dispatcher.setCap('@acme/pdf', 1000);
    fixture.scheduler.pump();
    expect(fixture.dispatcher.running()).toHaveLength(64);
    await complete(fixture, fixture.dispatcher.running()[0] ?? '');
    expect(fixture.dispatcher.running()).toHaveLength(64);
    expect(fixture.dispatcher.claims).toHaveLength(65);
  });

  it('M1.5-E8 commands fill 75% of a host; queries use the reserved share', async () => {
    const fixture = openSchedulerFixture();
    fixture.dispatcher.setCap('@acme/pdf', 8);
    for (let index = 0; index < 10; index += 1) await submit(fixture, 'pdf.render');
    expect(fixture.dispatcher.running()).toHaveLength(6);
    const queries = [query(fixture), query(fixture), query(fixture)];
    fixture.scheduler.pump();
    expect(fixture.dispatcher.running()).toHaveLength(8);
    expect(fixture.dispatcher.claimedIds()).not.toContain(queries[2]);
    fixture.dispatcher.end(queries[0] ?? '');
    fixture.scheduler.pump();
    expect(fixture.dispatcher.claimedIds()).toContain(queries[2]);
    expect(fixture.dispatcher.claims.filter((claim) => claim.message.kind === 'command')).toHaveLength(6);
  });

  it('M1.5-E9 a deferred command releases its lane', async () => {
    const fixture = openSchedulerFixture();
    const deferred = await submit(fixture, 'pdf.translate', { fileId: 'f1' });
    const next = await submit(fixture, 'pdf.translate', { fileId: 'f1' });
    expect(fixture.dispatcher.claimedIds()).toEqual([deferred]);
    await complete(fixture, deferred, { deferred: true });
    expect(row(fixture, deferred)['state']).toBe('awaiting');
    expect(fixture.dispatcher.claimedIds()).toEqual([deferred, next]);
  });
});
