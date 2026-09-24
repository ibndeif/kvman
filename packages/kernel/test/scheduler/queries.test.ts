import { describe, expect, it } from 'vitest';
import type { Sender } from '../../src/index.ts';
import { openSchedulerFixture, pdfProcess, person, submit, workspaceA, type SchedulerFixture } from './harness.ts';

function countRows(fixture: SchedulerFixture): number {
  return Number(fixture.connection.prepare('SELECT COUNT(*) AS count FROM messages').get()?.['count']);
}

describe('the query priority path (plan 03 §3.4)', () => {
  it('M1.5-E10 queries skip lanes and handler limits and go ahead of commands', async () => {
    const fixture = openSchedulerFixture();
    fixture.dispatcher.setCap('@acme/pdf', 8);
    await submit(fixture, 'pdf.translate', { fileId: 'f1' });
    await submit(fixture, 'pdf.translate', { fileId: 'f1' });
    for (let index = 0; index < 3; index += 1) await submit(fixture, 'pdf.import');
    for (let index = 0; index < 5; index += 1) await submit(fixture, 'pdf.render');
    expect(fixture.dispatcher.running()).toHaveLength(6);
    const rowsBefore = countRows(fixture);
    const admit = (sender: Sender): string => {
      const admission = fixture.router.admitQuery({ sender, type: 'pdf.files.list', payload: {}, cause: undefined, workspaceId: workspaceA });
      if (!admission.ok) throw new Error(admission.problem.code);
      fixture.scheduler.submitQuery(admission.admitted);
      return admission.admitted.message.id;
    };
    const normalQuery = admit(pdfProcess);
    const interactiveQuery = admit(person);
    fixture.scheduler.pump();
    const dispatched = fixture.dispatcher.claims.slice(6);
    expect(dispatched.map((claim) => claim.message.id)).toEqual([interactiveQuery, normalQuery]);
    expect(dispatched.map((claim) => [claim.handler, claim.attempt])).toEqual([['query:pdf.files.list', 1], ['query:pdf.files.list', 1]]);
    expect(countRows(fixture)).toBe(rowsBefore);
    expect(fixture.dispatcher.claims).toHaveLength(8);
  });
});
