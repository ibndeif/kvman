import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootFixture, type DaemonFixture } from '../daemon/harness.ts';
import { eventually, workerTests, workspaceA } from '../hosts/harness.ts';
import { acceptedOf, command, problemOf, send, statusOf } from './http-client.ts';

let fixture: DaemonFixture;
beforeEach(async () => {
  fixture = await bootFixture();
});
afterEach(async () => {
  await fixture.close();
});

function row(type: string): Record<string, unknown> | undefined {
  return fixture.kernel.connection.prepare('SELECT * FROM messages WHERE type = ? ORDER BY seq').get(type);
}

describe('queries and GET /messages/:id (plan 12 §12.2, ADRs 0066, 0094)', workerTests, () => {
  it('M1.8-H8 a reply reaches a caller whose request already ended, through GET /messages/:id', async () => {
    const accepted = await command(fixture.port, 'notes.relay', { id: 'h8' }, { wait: 0 });
    expect(accepted.status).toBe(202);
    const { id, state } = acceptedOf(accepted);
    expect(state).toBe('pending');
    await eventually(() => expect(row('notes.ask')?.['state']).toBe('awaiting'));
    expect((await command(fixture.port, 'notes.question.answer', { askId: row('notes.ask')?.['id'], answer: 'later' })).status).toBe(200);
    await eventually(() => expect(row('notes.relay')?.['state']).toBe('done'));
    const status = await send(fixture.port, 'GET', `/api/v1/messages/${id}`);
    expect([status.status, status.json]).toEqual([200, { id, type: 'notes.relay', state: 'done', reply: { answer: 'later' } }]);
  });

  it('M1.8-E42 a query answers its data or its Problem', async () => {
    const total = await send(fixture.port, 'POST', '/api/v1/queries/counter.total.get', { body: { payload: {}, workspaceId: workspaceA } });
    expect([total.status, total.json]).toEqual([200, { data: { total: 0 } }]);
    const unknown = await send(fixture.port, 'POST', '/api/v1/queries/notes.unknown.get', { body: { payload: {}, workspaceId: workspaceA } });
    expect([unknown.status, problemOf(unknown).code]).toEqual([404, 'TYPE_NOT_FOUND']);
  });

  it('M1.8-E43 GET /messages/:id shows each state', async () => {
    expect((await command(fixture.port, 'notes.edit.slow', { id: 'e43' }, { wait: 0 })).status).toBe(202);
    await eventually(() => expect(row('notes.edit.slow')?.['state']).toBe('running'));
    const { id } = acceptedOf(await command(fixture.port, 'notes.edit.slow', { id: 'e43' }, { wait: 0 }));
    const pending = await send(fixture.port, 'GET', `/api/v1/messages/${id}`);
    expect([pending.status, pending.json]).toEqual([200, { id, type: 'notes.edit.slow', state: 'pending' }]);
    expect((await command(fixture.port, 'counter.fail', {})).status).toBe(422);
    const failedId = String(row('counter.fail')?.['id']);
    const failed = statusOf(await send(fixture.port, 'GET', `/api/v1/messages/${failedId}`));
    expect(failed).toMatchObject({ id: failedId, type: 'counter.fail', state: 'failed', problem: { code: 'counter/NEGATIVE' } });
    expect(failed.reply).toBeUndefined();
    const unknown = await send(fixture.port, 'GET', '/api/v1/messages/01JAZ3K4M5N6P7Q8R9S0T1V2W3');
    expect([unknown.status, problemOf(unknown).code]).toEqual([404, 'NOT_FOUND']);
    const malformed = await send(fixture.port, 'GET', '/api/v1/messages/nope');
    expect([malformed.status, problemOf(malformed).code]).toEqual([400, 'VALIDATION_FAILED']);
  });
});
